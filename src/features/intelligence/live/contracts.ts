import { IntelligenceContractError, parseResponse } from "../parser";

export const MAX_SDP_BYTES = 32 * 1024;
export const MAX_LIVE_BODY_BYTES = 64 * 1024;
export const MAX_LIVE_EVENTS = 4096;
export class LiveContractError extends IntelligenceContractError {
  constructor(readonly category: "SessionIdType" | "SessionIdEmpty" | "SessionIdTooLong" | "SessionIdControlCharacter"
    | "SdpType" | "SdpEmpty" | "SdpTooLarge" | "SdpVersion" | "SdpNullByte" | "UnexpectedSessionFields") { super(); }
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IntelligenceContractError();
  return value as Record<string, unknown>;
}
export function opaqueId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new IntelligenceContractError();
  return value;
}
export function sessionId(value: unknown): string {
  if (typeof value !== "string") throw new LiveContractError("SessionIdType");
  if (!value.trim()) throw new LiveContractError("SessionIdEmpty");
  if (value.length > 128) throw new LiveContractError("SessionIdTooLong");
  if (/[\x00-\x1f\x7f-\x9f]/.test(value)) throw new LiveContractError("SessionIdControlCharacter");
  return value;
}
export function liveText(value: unknown, max = 4000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new IntelligenceContractError();
  return value;
}
export function parseSdp(value: unknown): string {
  if (typeof value !== "string") throw new LiveContractError("SdpType");
  if (!value.length) throw new LiveContractError("SdpEmpty");
  if (new TextEncoder().encode(value).length > MAX_SDP_BYTES) throw new LiveContractError("SdpTooLarge");
  if (!value.startsWith("v=0")) throw new LiveContractError("SdpVersion");
  if (value.includes("\0")) throw new LiveContractError("SdpNullByte");
  // RTCPeerConnection validates SDP. The boundary preserves every original character.
  return value;
}
export function parseLiveSession(value: unknown): { sessionId: string; sdp: string } {
  const v = record(value);
  if (Object.keys(v).some((key) => key !== "sessionId" && key !== "sdp")) throw new LiveContractError("UnexpectedSessionFields");
  return { sessionId: sessionId(v.sessionId), sdp: parseSdp(v.sdp) };
}
export function parseLiveClose(value: unknown): { closed: true } {
  if (record(value).closed !== true) throw new IntelligenceContractError();
  return { closed: true };
}
export function parseLiveRequest(path: string, value: unknown) {
  const v = record(value);
  const keys = path === "live/session" ? ["sdp"] : path === "live/delegate" ? ["sessionId", "callId", "question"] : ["sessionId"];
  if (Object.keys(v).some((key) => !keys.includes(key))) throw new IntelligenceContractError();
  if (path === "live/session") return { sdp: parseSdp(v.sdp) };
  const id = sessionId(v.sessionId);
  if (path === "live/delegate") return { sessionId: id, callId: opaqueId(v.callId), question: liveText(v.question) };
  return { sessionId: id };
}
export function parseLiveResponse(path: string, value: unknown) {
  return path === "live/session" ? parseLiveSession(value) : path === "live/close" ? parseLiveClose(value) : parseResponse(value);
}
