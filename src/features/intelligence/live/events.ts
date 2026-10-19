import { opaqueId, record, sessionId } from "./contracts";

export type LiveEvent =
  | { type: "started"; sessionId: string }
  | { type: "closed"; reason: string }
  | { type: "failure"; code: string }
  | { type: "transcript"; eventId: string; role: "user" | "assistant"; text: string; start: number; end: number }
  | { type: "response"; delegationId: string; responseId: string }
  | { type: "response_finished"; responseId: string };

// GPT-Live events, not Realtime API conversation.item.* or arguments deltas.
// https://developers.openai.com/api/docs/guides/live-delegation
export function parseLiveEvent(data: unknown): LiveEvent | null {
  if (typeof data !== "string" || data.length > 64 * 1024 || new TextEncoder().encode(data).length > 64 * 1024) return null;
  try {
    const v = record(JSON.parse(data) as unknown);
    if (v.type === "session.started") return { type: "started", sessionId: sessionId(record(v.session).id) };
    if (v.type === "session.closed") return { type: "closed", reason: typeof v.reason === "string" ? v.reason : "unknown" };
    if (v.type === "error") return { type: "failure", code: typeof record(v.error).code === "string" ? String(record(v.error).code) : "unknown" };
    if (v.type === "session.input_transcript.delta" || v.type === "session.output_transcript.delta") {
      if (typeof v.start_ms !== "number" || typeof v.end_ms !== "number" || !Number.isSafeInteger(v.start_ms) || !Number.isSafeInteger(v.end_ms) || v.start_ms < 0 || v.end_ms < v.start_ms) return null;
      if (typeof v.delta !== "string" || !v.delta.length || v.delta.length > 12000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v.delta)) return null;
      return { type: "transcript", eventId: opaqueId(v.event_id), role: v.type === "session.input_transcript.delta" ? "user" : "assistant", text: v.delta, start: v.start_ms, end: v.end_ms };
    }
    if (v.type !== "response.event") return null;
    const e = record(v.event);
    if (e.type === "response.created") return { type: "response", delegationId: opaqueId(v.delegation_id), responseId: opaqueId(record(e.response).id) };
    if (e.type === "response.failed" || e.type === "response.incomplete") return { type: "failure", code: "delegation_failed" };
    if (e.type === "response.completed") return { type: "response_finished", responseId: opaqueId(record(e.response).id) };
    // Tools and their arguments are exclusively owned by the private server sideband.
    return null;
  } catch { return null; }
}
