import "server-only";
import { intelligenceMethod } from "../paths";
import { parseResponse, parseSession, parseTranscript, parseVoice } from "../parser";
import { safeRequestId } from "../errors";

function baseUrl(): URL {
  const url = new URL(process.env.SNG_INTELLIGENCE_BASE_URL?.trim() ?? "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Invalid configuration");
  return url;
}
const responseHeaders = () => new Headers({ "Cache-Control": "no-store", Vary: "Authorization", "X-Content-Type-Options": "nosniff" });
function error(status: number, requestId?: string, allow?: string) {
  const headers = responseHeaders();
  if (allow) headers.set("Allow", allow);
  return Response.json({ status, ...(requestId ? { requestId } : {}) }, { status, headers });
}
async function jsonLimited(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Missing response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512 * 1024) { await reader.cancel(); throw new Error("Response too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
function containsPrivateData(value: unknown, forbidden: string[]): boolean {
  if (typeof value === "string") return forbidden.some((text) => text && value.toLowerCase().includes(text.toLowerCase()))
    || /(?:\bBearer\s+\S+|\bsk-[A-Za-z0-9_-]{8,}|[A-Z]:[\\/]|\\\\[^\\]+\\|\/(?:var|home|usr|tmp|app|srv)\/)/i.test(value);
  if (Array.isArray(value)) return value.some((item) => containsPrivateData(item, forbidden));
  if (value && typeof value === "object") return Object.values(value).some((item) => containsPrivateData(item, forbidden));
  return false;
}
export async function forwardIntelligence(request: Request, segments: string[]): Promise<Response> {
  const path = segments.join("/");
  // Joining must not turn a slash embedded in one segment into an allowed route.
  if (segments.some((part) => !/^[a-z]+$/.test(part))) return error(400);
  const method = intelligenceMethod(path);
  if (!method) return error(400);
  if (request.method !== method) return error(405, undefined, method);
  if (new URL(request.url).search) return error(400);
  const authorization = request.headers.get("Authorization");
  if (!authorization || !/^Bearer [A-Za-z0-9._~+/-]+=*$/i.test(authorization)) return error(401);
  let base: URL;
  try { base = baseUrl(); } catch { return error(503); }
  const headers = new Headers({ Authorization: authorization, Accept: path === "voice/speech" ? "audio/mpeg" : "application/json" });
  if (method === "POST") {
    const type = request.headers.get("Content-Type") ?? "";
    const upload = path === "voice" || path === "voice/transcribe";
    const valid = upload ? /^multipart\/form-data\s*;/i.test(type) && /;\s*boundary=(?:"[^"\r\n]{1,70}"|[^;\s]{1,70})(?:;|$)/i.test(type) : /^application\/json(?:\s*;.*)?$/i.test(type);
    if (!valid) return error(415);
    const limit = upload ? 10 * 1024 * 1024 + 64 * 1024 : 64 * 1024;
    if (Number(request.headers.get("Content-Length")) > limit) return error(413);
    headers.set("Content-Type", type);
  }
  const forbidden = [base.origin, base.hostname, authorization, authorization.replace(/^Bearer /i, "")];
  try {
    const init: RequestInit & { duplex?: "half" } = {
      method, headers, cache: "no-store", redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(180_000)]),
      ...(method === "POST" && request.body ? { body: request.body, duplex: "half" } : {}),
    };
    const upstream = await fetch(new URL("/api/intelligence/" + path, base), init);
    if (!upstream.ok) {
      let requestId: string | undefined;
      try {
        const payload = await jsonLimited(upstream);
        if (payload && typeof payload === "object" && "requestId" in payload) requestId = safeRequestId(payload.requestId);
        if (requestId && containsPrivateData(requestId, forbidden)) requestId = undefined;
      } catch { /* Only a validated correlation identifier can leave this boundary. */ }
      return error(upstream.status >= 400 ? upstream.status : 502, requestId);
    }
    const mediaType = upstream.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
    if (path === "voice/speech") {
      if (mediaType !== "audio/mpeg" || !upstream.body) return error(502);
      const outHeaders = responseHeaders();
      outHeaders.set("Content-Type", "audio/mpeg");
      return new Response(upstream.body, { headers: outHeaders });
    }
    if (mediaType !== "application/json") return error(502);
    const raw = await jsonLimited(upstream);
    const result = path === "session" ? parseSession(raw) : path === "voice" ? parseVoice(raw) : path === "voice/transcribe" ? parseTranscript(raw) : parseResponse(raw);
    if (containsPrivateData(result, forbidden)) return error(502);
    return Response.json(result, { headers: responseHeaders() });
  } catch { return error(502); }
}
