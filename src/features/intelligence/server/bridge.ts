import "server-only";
import { intelligenceMethod } from "../paths";
import { parseResponse, parseSession, parseTranscript, parseVoice } from "../parser";
import { safeRequestId } from "../errors";
import { MAX_LIVE_BODY_BYTES, parseLiveRequest, parseLiveResponse, parseLiveSession } from "../live/contracts";

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
class BodyTooLarge extends Error {}
async function jsonLimited(response: Response | Request, limit = 512 * 1024): Promise<unknown> {
  if (!response.body) throw new Error("Missing response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const signal = response instanceof Request ? AbortSignal.any([response.signal, AbortSignal.timeout(10_000)]) : undefined;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (signal?.aborted) throw new Error("Request cancelled");
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { void reader.cancel().catch(() => {}); throw new BodyTooLarge(); }
      chunks.push(value);
    }
  } finally { signal?.removeEventListener("abort", cancel); reader.releaseLock(); }
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
function containsSessionCredentials(sdp: string, authorization: string): boolean {
  // SDP carries network addresses and ICE passwords (which may start with '/').
  // Those are transport data, not filesystem paths or leaked backend hosts.
  // Still reject the caller's credential, bearer/API keys and embedded service URLs.
  return sdp.includes(authorization.replace(/^Bearer /i, ""))
    || /(?:\bBearer\s+\S+|\bsk-[A-Za-z0-9_-]{8,}|\bAuthorization\s*[:=]|\bOPENAI_API_KEY\b|https?:\/\/)/i.test(sdp);
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
  const live = path.startsWith("live/");
  let liveBody: string | undefined;
  if (live) {
    try {
      liveBody = JSON.stringify(parseLiveRequest(path, await jsonLimited(request, MAX_LIVE_BODY_BYTES)));
    } catch (cause) { return error(cause instanceof BodyTooLarge ? 413 : 422); }
  }
  try {
    const init: RequestInit & { duplex?: "half" } = {
      method, headers, cache: "no-store", redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(180_000)]),
      ...(liveBody !== undefined ? { body: liveBody } : method === "POST" && request.body ? { body: request.body, duplex: "half" } : {}),
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
    if (path === "live/session") {
      const session = parseLiveSession(raw);
      if (containsPrivateData(session.sessionId, forbidden) || containsSessionCredentials(session.sdp, authorization)) return error(502);
      return Response.json(session, { status: upstream.status, headers: responseHeaders() });
    }
    const result = live ? parseLiveResponse(path, raw) : path === "session" ? parseSession(raw) : path === "voice" ? parseVoice(raw) : path === "voice/transcribe" ? parseTranscript(raw) : parseResponse(raw);
    if (containsPrivateData(result, forbidden)) return error(502);
    return Response.json(result, { status: live ? upstream.status : 200, headers: responseHeaders() });
  } catch { return error(502); }
}
