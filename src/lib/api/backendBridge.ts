import { ACTIVE_ROLE_HEADER, isSystemRole } from "@/features/auth/types/auth";
import "server-only";
import { getApiBaseUrl } from "@/lib/config/server-env";
import { isQuotationImagePath, isBackendPath, isBudgetQuotationPath, isCommercialQuotationPath, isSendToCommercialPath, isDocumentFilePath, isDocumentRemovalPath, isLargeDocumentTransfer } from "./backendPath";
import { budgetQuotationProblem } from "./budgetQuotationProblem";
import { safeProblem } from "./apiError";
import { downloadFilename } from "./contentDisposition";
import type { JsonValue } from "./types";

function problem(status: number, payload?: unknown, headers?: Headers) {
  const safeHeaders = new Headers(headers);
  safeHeaders.set("Content-Type", "application/problem+json");
  safeHeaders.set("Cache-Control", "no-store");
  safeHeaders.set("Vary", "Authorization, X-SnG-Active-Role");
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

// Only probe untyped bodies: Next can supply a stream even for an empty POST.
// Stop at the first byte; accepted typed uploads are never read here.
async function hasPayload(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted();
  const reader = body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) return false;
      if (value.byteLength > 0) {
        cancel();
        return true;
      }
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

export async function forwardBackend(request: Request, segments: string[]): Promise<Response> {
  const quotationMethod = isQuotationImagePath(segments) ? "GET" : isBudgetQuotationPath(segments) || isCommercialQuotationPath(segments)
    ? (["status", "commercial-file", "file", "view"].includes(segments[3]) ? "GET" : "POST") : isSendToCommercialPath(segments) ? "POST" : null;
  if (quotationMethod && request.method !== quotationMethod) return problem(405, undefined, new Headers({ Allow: quotationMethod }));
  if (segments[0] === "management" && request.method !== "GET") {
    return problem(405, undefined, new Headers({ Allow: "GET" }));
  }
  if (!["GET", "POST", "PUT"].includes(request.method) && !(request.method === "DELETE" && isDocumentRemovalPath(segments))) {
    return problem(405, undefined, new Headers({ Allow: "GET, POST, PUT" }));
  }
  if (!isBackendPath(segments)) return problem(400);
  const authorization = request.headers.get("Authorization");
  if (!authorization || !/^Bearer [A-Za-z0-9._~+/-]+=*$/i.test(authorization)) return problem(401);

  const activeRole = request.headers.get(ACTIVE_ROLE_HEADER);
  if (!isSystemRole(activeRole)) return problem(403);

  let base: URL;
  try { base = getApiBaseUrl(); } catch { return problem(503); }
  const url = new URL(`/api/${segments.map(encodeURIComponent).join("/")}`, base);
  url.search = new URL(request.url).search;
  const headers = new Headers({ Authorization: authorization, [ACTIVE_ROLE_HEADER]: activeRole });
  const accept = request.headers.get("Accept");
  if (accept) headers.set("Accept", accept);
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(isLargeDocumentTransfer(request.method, segments) ? 600_000 : 120_000)]);
    let body: ReadableStream<Uint8Array> | null = null;
    if (request.method === "DELETE" || isSendToCommercialPath(segments) || (isBudgetQuotationPath(segments) && segments[3] === "status")) {
      if (Number(request.headers.get("Content-Length")) > 0 || (request.body && await hasPayload(request.body, signal))) return problem(415);
    } else if (request.method !== "GET") {
      const contentType = request.headers.get("Content-Type");
      if (contentType !== null) {
        const mediaType = contentType.split(";")[0].trim().toLowerCase();
        const allowed = mediaType === "application/json" || /^application\/[a-z0-9.+-]+\+json$/.test(mediaType)
          || mediaType === "application/octet-stream"
          || mediaType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          || (mediaType === "multipart/form-data" && /;\s*boundary=(?:"[^"]+"|[^;\s]+)/i.test(contentType));
        if (!allowed) return problem(415);
        headers.set("Content-Type", contentType);
        body = request.body;
      } else if (Number(request.headers.get("Content-Length")) > 0
        || (request.body && await hasPayload(request.body, signal))) {
        return problem(415);
      }
    }
    const init: RequestInit & { duplex?: "half" } = {
      method: request.method, headers, cache: "no-store", redirect: "error",
      signal,
      ...(body ? { body, duplex: "half" } : {}),
    };
    const response = await fetch(url, init);
    const responseHeaders = new Headers({ "Cache-Control": "no-store", Vary: "Authorization, X-SnG-Active-Role" });
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
      return problem(response.status, isBudgetQuotationPath(segments) ? budgetQuotationProblem(safe, response.status, segments[3]) : safe, responseHeaders);
    }
    if (response.status < 200 || response.status >= 300) return problem(502);
    if (response.status === 204 || response.status === 205) {
      return new Response(null, { status: response.status, headers: responseHeaders });
    }
    const contentType = response.headers.get("Content-Type") ?? "";
    const mediaType = contentType.split(";")[0].trim().toLowerCase();
    const documentFile = request.method === "GET" && isDocumentFilePath(segments);
    if (isQuotationImagePath(segments)) {
      if (!["image/png", "image/jpeg", "image/gif", "image/bmp", "image/tiff"].includes(mediaType)) return problem(502);
      responseHeaders.set("Content-Type", mediaType);
      responseHeaders.set("X-Content-Type-Options", "nosniff");
      return new Response(response.body, { status: response.status, headers: responseHeaders });
    }

    if (!documentFile && (mediaType === "application/json" || /^application\/[a-z0-9.+-]+\+json$/.test(mediaType))) {
      const data = await response.json() as JsonValue;
      responseHeaders.set("Content-Type", mediaType);
      return Response.json(safeJson(data, forbidden), { status: response.status, headers: responseHeaders });
    }
    if (!documentFile && !["application/octet-stream", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip"].includes(mediaType)) return problem(502);
    // Project documents are opaque downloads, including HTML/SVG/JSON files.
    responseHeaders.set("Content-Type", documentFile ? "application/octet-stream" : mediaType);
    const disposition = response.headers.get("Content-Disposition");
    const filename = downloadFilename(disposition);
    if (disposition && filename && !forbidden.some((text) => filename.toLowerCase().includes(text.toLowerCase()))
      && /^(?:attachment|inline)(?:;\s*filename(?:\*)?\s*=\s*(?:"[^"\\\r\n]*"|[^;\s]+)){1,2}\s*$/i.test(disposition)
      && !forbidden.some((text) => disposition.toLowerCase().includes(text.toLowerCase()))) {
      responseHeaders.set("Content-Disposition", disposition);
    }
    if (documentFile || mediaType === "application/zip") {
      responseHeaders.set("Content-Disposition", responseHeaders.get("Content-Disposition")?.replace(/^inline/i, "attachment") ?? "attachment");
      responseHeaders.set("X-Content-Type-Options", "nosniff");
    }
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return problem(502);
  }
}
