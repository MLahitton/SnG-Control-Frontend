import "server-only";
import { getApiBaseUrl } from "@/lib/config/server-env";
import { isBackendPath } from "./backendPath";
import { safeProblem } from "./apiError";
import { downloadFilename } from "./contentDisposition";
import type { JsonValue } from "./types";

function problem(status: number, payload?: unknown, headers?: Headers) {
  const safeHeaders = new Headers(headers);
  safeHeaders.set("Content-Type", "application/problem+json");
  safeHeaders.set("Cache-Control", "no-store");
  safeHeaders.set("Vary", "Authorization");
  return Response.json(safeProblem(status, payload), { status, headers: safeHeaders });
}

function safeJson(value: JsonValue, forbidden: string[], depth = 0): JsonValue {
  if (depth > 50) throw new Error("Invalid upstream JSON");
  if (typeof value === "string") {
    if (forbidden.some((text) => text && value.toLowerCase().includes(text.toLowerCase()))
      || /(?:[A-Z]:[\\/]|\\\\[^\\]+\\|\/(?:var|home|usr|tmp|app|srv)\/|\bat\s+\S+\([^)]*\)\s+in\b)/i.test(value)) return null;
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => safeJson(item, forbidden, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !forbidden.some((text) => key.toLowerCase().includes(text.toLowerCase()))
        && !/^(?:stack(?:trace)?|exception|innerException|storagePath|filePath|physicalPath|connectionString|authorization|accessToken|idToken|token|backendUrl|server)$/i.test(key))
      .map(([key, item]) => [key, safeJson(item, forbidden, depth + 1)]));
  }
  return value;
}

export async function forwardBackend(request: Request, segments: string[]): Promise<Response> {
  if (!["GET", "POST", "PUT"].includes(request.method)) {
    return problem(405, undefined, new Headers({ Allow: "GET, POST, PUT" }));
  }
  if (!isBackendPath(segments)) return problem(400);
  const authorization = request.headers.get("Authorization");
  if (!authorization || !/^Bearer [A-Za-z0-9._~+/-]+=*$/i.test(authorization)) return problem(401);

  let base: URL;
  try { base = getApiBaseUrl(); } catch { return problem(503); }
  const url = new URL(`/api/${segments.map(encodeURIComponent).join("/")}`, base);
  url.search = new URL(request.url).search;
  const headers = new Headers({ Authorization: authorization });
  const accept = request.headers.get("Accept");
  if (accept) headers.set("Accept", accept);
  const hasBody = request.method !== "GET" && request.body !== null;
  if (hasBody) {
    const contentType = request.headers.get("Content-Type") ?? "";
    const mediaType = contentType.split(";")[0].trim().toLowerCase();
    const allowed = mediaType === "application/json" || /^application\/[a-z0-9.+-]+\+json$/.test(mediaType)
      || mediaType === "application/octet-stream"
      || mediaType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      || (mediaType === "multipart/form-data" && /;\s*boundary=(?:"[^"]+"|[^;\s]+)/i.test(contentType));
    if (!allowed) return problem(415);
    headers.set("Content-Type", contentType);
  }

  try {
    const init: RequestInit & { duplex?: "half" } = {
      method: request.method, headers, cache: "no-store", redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
      ...(hasBody ? { body: request.body, duplex: "half" } : {}),
    };
    const response = await fetch(url, init);
    const responseHeaders = new Headers({ "Cache-Control": "no-store", Vary: "Authorization" });
    const retry = response.headers.get("Retry-After");
    if (retry && (/^\d{1,10}$/.test(retry) || /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(retry))) {
      responseHeaders.set("Retry-After", retry);
    }
    const forbidden = [base.origin, base.hostname, authorization, authorization.replace(/^Bearer /i, "")];
    if (response.status >= 400) {
      let data: unknown;
      try { data = await response.json(); } catch { /* Discard upstream text/HTML diagnostics. */ }
      // Remove internal values even if placed in a permitted extension.
      const safe = safeJson((data ?? null) as JsonValue, forbidden);
      return problem(response.status, safe, responseHeaders);
    }
    if (response.status < 200 || response.status >= 300) return problem(502);
    if (response.status === 204 || response.status === 205) {
      return new Response(null, { status: response.status, headers: responseHeaders });
    }
    const contentType = response.headers.get("Content-Type") ?? "";
    const mediaType = contentType.split(";")[0].trim().toLowerCase();
    if (mediaType === "application/json" || /^application\/[a-z0-9.+-]+\+json$/.test(mediaType)) {
      const data = await response.json() as JsonValue;
      responseHeaders.set("Content-Type", mediaType);
      return Response.json(safeJson(data, forbidden), { status: response.status, headers: responseHeaders });
    }
    if (!["application/octet-stream", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(mediaType)) return problem(502);
    responseHeaders.set("Content-Type", mediaType);
    const disposition = response.headers.get("Content-Disposition");
    const filename = downloadFilename(disposition);
    if (disposition && filename && !forbidden.some((text) => filename.toLowerCase().includes(text.toLowerCase()))
      && /^(?:attachment|inline)(?:;\s*filename(?:\*)?\s*=\s*(?:"[^"\\\r\n]*"|[^;\s]+)){1,2}\s*$/i.test(disposition)
      && !forbidden.some((text) => disposition.toLowerCase().includes(text.toLowerCase()))) {
      responseHeaders.set("Content-Disposition", disposition);
    }
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return problem(502);
  }
}
