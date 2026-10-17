import "server-only";
import { IntelligenceContractError } from "../parser";
import { LiveContractError } from "../live/contracts";

type Stage = "request_received" | "upstream_fetch_started" | "upstream_received"
  | "upstream_status_validated" | "upstream_content_type_validated" | "upstream_body_read"
  | "json_parsed" | "live_session_contract_parsed" | "live_session_security_validated"
  | "response_serialized" | "response_returned";
type Failure = "RequestRejected" | "ConfigurationError" | "UpstreamStatusError"
  | "ContentTypeError" | "BodyTooLarge" | "SecurityError";

// Temporary development-only instrumentation. Never accept raw messages, headers,
// IDs or SDP as log arguments. Unknown JSON key names/media types are redacted too.
export function liveDiagnostics(active: boolean) {
  const enabled = active && process.env.NODE_ENV === "development";
  let stage: Stage = "request_received";
  let metadata: Record<string, number | string | boolean | string[]> = {};
  function emit(event: "live_bridge_stage" | "live_bridge_failure", errorClass?: string) {
    if (!enabled) return;
    try { console.info(event, JSON.stringify({ stage, ...metadata, ...(errorClass ? { error_class: errorClass } : {}) })); }
    catch { /* Diagnostics must never change the response. */ }
  }
  return {
    enter(next: Stage) { stage = next; },
    done(next: Stage) { stage = next; emit("live_bridge_stage"); },
    upstream(status: number, mediaType: string | undefined) {
      if (!enabled) return;
      const knownTypes = ["application/json", "text/html", "text/plain", "application/octet-stream", "application/problem+json"];
      metadata = { ...metadata, upstreamStatus: status, upstreamContentType: !mediaType ? "missing" : knownTypes.includes(mediaType) ? mediaType : "other" };
    },
    bodySize(size: number) { if (enabled) metadata.bodySize = size; },
    security(field: "sessionId" | "sdp", rule: "CallerToken" | "BearerCredential" | "ApiKey" | "CredentialMarker" | "HttpUrl", hasExtmapHttpUri: boolean) {
      if (enabled) metadata = { ...metadata, securityField: field, securityRule: rule, hasExtmapHttpUri };
    },
    shape(raw: unknown) {
      if (!enabled) return;
      const v = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      const keys = Object.keys(v);
      const knownKeys = ["sessionId", "sdp", "session_id", "id", "data", "error", "detail", "status", "type", "Authorization", "OPENAI_API_KEY"];
      const sdp = typeof v.sdp === "string" ? v.sdp : undefined;
      metadata = {
        ...metadata, keys: keys.slice(0, 16).map((key) => knownKeys.includes(key) ? key : "[unexpected]"), keyCount: keys.length,
        sessionIdType: typeof v.sessionId, sessionIdLength: typeof v.sessionId === "string" ? v.sessionId.length : 0,
        sdpType: typeof v.sdp, sdpLength: sdp?.length ?? 0, sdpBytes: sdp === undefined ? 0 : new TextEncoder().encode(sdp).length,
        startsWithV0: sdp?.startsWith("v=0") ?? false, containsCRLF: sdp?.includes("\r\n") ?? false,
        containsLF: sdp?.includes("\n") ?? false, hasNullByte: sdp?.includes("\0") ?? false,
        hasMediaLine: sdp !== undefined && /(?:^|[\r\n])m=/.test(sdp), hasAttributeLine: sdp !== undefined && /(?:^|[\r\n])a=/.test(sdp),
      };
    },
    fail(category: Failure) { emit("live_bridge_failure", category); },
    exception(cause: unknown) {
      // Do not trust Error.name/message: either can contain upstream secrets.
      const category = cause instanceof LiveContractError ? cause.category : cause instanceof IntelligenceContractError ? "IntelligenceContractError"
        : cause instanceof SyntaxError ? "SyntaxError" : cause instanceof TypeError ? "TypeError"
        : cause instanceof DOMException ? "DOMException" : "UnknownError";
      emit("live_bridge_failure", category);
    },
  };
}
