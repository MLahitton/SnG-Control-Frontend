import { ACTIVE_ROLE_HEADER } from "@/features/auth/types/auth";
import "server-only";
import { intelligenceMethod } from "../paths";
import { parseResponse, parseSession, parseTranscript, parseVoice } from "../parser";
import { safeRequestId } from "../errors";
import { MAX_LIVE_BODY_BYTES, parseLiveRequest, parseLiveResponse, parseLiveSession } from "../live/contracts";
import { parseConversation, parseConversationClose, parseConversationRequest } from "../conversation";
import { liveDiagnostics } from "./liveDiagnostics";

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
async function jsonLimited(response: Response | Request, limit = 512 * 1024, trace?: ReturnType<typeof liveDiagnostics>): Promise<unknown> {
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
      trace?.bodySize(size);
      if (size > limit) { void reader.cancel().catch(() => {}); throw new BodyTooLarge(); }
      chunks.push(value);
    }
  } finally { signal?.removeEventListener("abort", cancel); reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  trace?.done("upstream_body_read");
  trace?.enter("json_parsed");
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
function containsPrivateData(value: unknown, forbidden: string[]): boolean {
  if (typeof value === "string") return forbidden.some((text) => text && value.toLowerCase().includes(text.toLowerCase()))
    || /(?:\bBearer\s+\S+|\bsk-[A-Za-z0-9_-]{8,}|[A-Z]:[\\/]|\\\\[^\\]+\\|\/(?:var|home|usr|tmp|app|srv)\/)/i.test(value);
  if (Array.isArray(value)) return value.some((item) => containsPrivateData(item, forbidden));
  if (value && typeof value === "object") return Object.values(value).some((item) => containsPrivateData(item, forbidden));
  return false;
}
// Public RTP extension identifiers, not service endpoints. Exact matches only,
// in the URI slot of a=extmap (RFC 8285). Never fetch or rewrite these identifiers.
// https://webrtc.googlesource.com/src/+/refs/heads/main/api/rtp_parameters.h
const audioExtensionUris = new Set([
  "http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time",
  "http://www.webrtc.org/experiments/rtp-hdrext/abs-capture-time",
  "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
  "http://www.webrtc.org/experiments/rtp-hdrext/transport-wide-cc-02",
]);
function sessionSecurityRule(value: string, authorization: string, isSdp = false) {
  // SDP carries network addresses and ICE passwords (which may start with '/').
  // Those are transport data, not filesystem paths or Leaded backend hosts.
  // Still reject the caller's credential, bearer/API keys and embedded service URLs.
  if (value.includes(authorization.replace(/^Bearer /i, ""))) return "CallerToken";
  if (/\bBearer\s+\S+/i.test(value)) return "BearerCredential";
  if (/\bsk-[A-Za-z0-9_-]{8,}/i.test(value)) return "ApiKey";
  if (/\bAuthorization\s*[:=]|\bOPENAI_API_KEY\b/i.test(value)) return "CredentialMarker";
  // Inspect a copy: credentials were checked above against the complete original.
  // A known URI elsewhere, a lookalike host, query or fragment is still rejected.
  const urlInspection = isSdp ? value.replace(
    /(^|[\r\n])(a=extmap:[1-9]\d*(?:\/(?:sendonly|recvonly|sendrecv|inactive))?[ \t]+)([^\s]+)/g,
    (line: string, boundary: string, attribute: string, uri: string) => audioExtensionUris.has(uri) ? `${boundary}${attribute}[rtp-extension]` : line,
  ) : value;
  if (/https?:\/\//i.test(urlInspection)) return "HttpUrl";
  return undefined;
}
export async function forwardIntelligence(request: Request, segments: string[]): Promise<Response> {
  const path = segments.join("/");
  const trace = liveDiagnostics(segments.length === 2 && segments[0] === "live" && segments[1] === "session");
  trace.done("request_received");
  const reject = (status: number, category: Parameters<typeof trace.fail>[0], allow?: string) => {
    trace.fail(category); return error(status, undefined, allow);
  };
  // Joining must not turn a slash embedded in one segment into an allowed route.
  if (segments.some((part) => !/^[a-z]+$/.test(part))) return error(400);
  const method = intelligenceMethod(path);
  if (!method) return error(400);
  if (request.method !== method) return reject(405, "RequestRejected", method);
  if (new URL(request.url).search) return reject(400, "RequestRejected");
  const authorization = request.headers.get("Authorization");
  if (!authorization || !/^Bearer [A-Za-z0-9._~+/-]+=*$/i.test(authorization)) return reject(401, "RequestRejected");
  let base: URL;
  try { base = baseUrl(); } catch { return reject(503, "ConfigurationError"); }
  if (request.headers.get(ACTIVE_ROLE_HEADER) !== "Management") return reject(403, "RequestRejected");
  const headers = new Headers({ Authorization: authorization, Accept: path === "voice/speech" ? "audio/mpeg" : "application/json" });
  if (method === "POST") {
    const type = request.headers.get("Content-Type") ?? "";
    const upload = path === "voice" || path === "voice/transcribe";
    const valid = upload ? /^multipart\/form-data\s*;/i.test(type) && /;\s*boundary=(?:"[^"\r\n]{1,70}"|[^;\s]{1,70})(?:;|$)/i.test(type) : /^application\/json(?:\s*;.*)?$/i.test(type);
    if (!valid) return reject(415, "RequestRejected");
    const limit = upload ? 10 * 1024 * 1024 + 64 * 1024 : 64 * 1024;
    if (Number(request.headers.get("Content-Length")) > limit) return reject(413, "BodyTooLarge");
    headers.set("Content-Type", type);
  }
  const forbidden = [base.origin, base.hostname, authorization, authorization.replace(/^Bearer /i, "")];
  const live = path.startsWith("live/");
  const conversation = path === "conversation" || path === "conversation/close";
  let liveBody: string | undefined;
  if (live || conversation) {
    try {
      const body = await jsonLimited(request, MAX_LIVE_BODY_BYTES);
      liveBody = JSON.stringify(live ? parseLiveRequest(path, body) : parseConversationRequest(path, body));
    } catch (cause) {
      if (cause instanceof BodyTooLarge) trace.fail("BodyTooLarge"); else trace.exception(cause);
      return error(cause instanceof BodyTooLarge ? 413 : 422);
    }
  }
  try {
    const init: RequestInit & { duplex?: "half" } = {
      method, headers, cache: "no-store", redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(180_000)]),
      ...(liveBody !== undefined ? { body: liveBody } : method === "POST" && request.body ? { body: request.body, duplex: "half" } : {}),
    };
    trace.done("upstream_fetch_started");
    trace.enter("upstream_received");
    const upstream = await fetch(new URL("/api/intelligence/" + path, base), init);
    const mediaType = upstream.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
    trace.upstream(upstream.status, mediaType);
    trace.done("upstream_received");
    trace.enter("upstream_status_validated");
    if (!upstream.ok) {
      trace.fail("UpstreamStatusError");
      let requestId: string | undefined;
      try {
        const payload = await jsonLimited(upstream);
        if (payload && typeof payload === "object" && "requestId" in payload) requestId = safeRequestId(payload.requestId);
        if (requestId && containsPrivateData(requestId, forbidden)) requestId = undefined;
      } catch { /* Only a validated correlation identifier can leave this boundary. */ }
      return error(upstream.status >= 400 ? upstream.status : 502, requestId);
    }
    trace.done("upstream_status_validated");
    trace.enter("upstream_content_type_validated");
    if (path === "voice/speech") {
      if (mediaType !== "audio/mpeg" || !upstream.body) return error(502);
      const outHeaders = responseHeaders();
      outHeaders.set("Content-Type", "audio/mpeg");
      return new Response(upstream.body, { headers: outHeaders });
    }
    if (mediaType !== "application/json") return reject(502, "ContentTypeError");
    trace.done("upstream_content_type_validated");
    trace.enter("upstream_body_read");
    const raw = await jsonLimited(upstream, 512 * 1024, trace);
    trace.shape(raw);
    trace.done("json_parsed");
    if (path === "live/session") {
      trace.enter("live_session_contract_parsed");
      const session = parseLiveSession(raw);
      trace.done("live_session_contract_parsed");
      trace.enter("live_session_security_validated");
      const idRule = sessionSecurityRule(session.sessionId, authorization);
      const sdpRule = sessionSecurityRule(session.sdp, authorization, true);
      if (idRule || sdpRule) {
        trace.security(idRule ? "sessionId" : "sdp", (idRule || sdpRule)!, /(?:^|[\r\n])a=extmap:[^\r\n]* https?:\/\//i.test(session.sdp));
        return reject(502, "SecurityError");
      }
      trace.done("live_session_security_validated");
      trace.enter("response_serialized");
      const response = Response.json(session, { status: upstream.status, headers: responseHeaders() });
      trace.done("response_serialized");
      trace.done("response_returned");
      return response;
    }
    const result = path === "conversation" ? parseConversation(raw) : path === "conversation/close" ? parseConversationClose(raw) : live ? parseLiveResponse(path, raw) : path === "session" ? parseSession(raw) : path === "voice" ? parseVoice(raw) : path === "voice/transcribe" ? parseTranscript(raw) : parseResponse(raw);
    if (containsPrivateData(result, forbidden)) return error(502);
    return Response.json(result, { status: live || conversation ? upstream.status : 200, headers: responseHeaders() });
  } catch (cause) {
    if (cause instanceof BodyTooLarge) trace.fail("BodyTooLarge"); else trace.exception(cause);
    return error(502);
  }
}
