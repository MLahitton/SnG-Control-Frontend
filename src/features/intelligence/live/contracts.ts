import { IntelligenceContractError, parseResponse } from "../parser";

export const MAX_SDP_BYTES = 32 * 1024;
export const MAX_LIVE_BODY_BYTES = 64 * 1024;
export const MAX_LIVE_EVENTS = 4096;
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IntelligenceContractError();
  return value as Record<string, unknown>;
}
export function opaqueId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new IntelligenceContractError();
  return value;
}
export function liveText(value: unknown, max = 4000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new IntelligenceContractError();
  return value;
}
export function parseSdp(value: unknown): string {
  if (typeof value !== "string" || new TextEncoder().encode(value).length > MAX_SDP_BYTES) throw new IntelligenceContractError();
  const lines = value.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  if (lines[0] !== "v=0" || lines.some((line) => !/^[a-z]=[^\x00-\x1f\x7f]*$/.test(line))
    || ["o=", "s=", "t=", "m=audio ", "m=application ", "a=ice-ufrag:", "a=ice-pwd:", "a=fingerprint:"].some((prefix) => !lines.some((line) => line.startsWith(prefix)))) throw new IntelligenceContractError();
  return value;
}
function parseSdpAnswer(value: unknown): string {
  if (typeof value !== "string" || new TextEncoder().encode(value).length > MAX_SDP_BYTES) throw new IntelligenceContractError();
  // Validate the envelope, not the negotiated media/ICE layout. Return the original bytes as text.
  const lines = value.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  if (lines[0] !== "v=0" || lines.some((line) => !/^[a-z]=[^\x00-\x1f\x7f]*$/.test(line))
    || ["o=", "s=", "t=", "a=fingerprint:"].some((prefix) => !lines.some((line) => line.startsWith(prefix) && line.length > prefix.length))) throw new IntelligenceContractError();
  return value;
}
export function parseLiveSession(value: unknown): { sessionId: string; sdp: string } {
  const v = record(value);
  if (Object.keys(v).some((key) => key !== "sessionId" && key !== "sdp")) throw new IntelligenceContractError();
  return { sessionId: opaqueId(v.sessionId), sdp: parseSdpAnswer(v.sdp) };
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
  const sessionId = opaqueId(v.sessionId);
  if (path === "live/delegate") return { sessionId, callId: opaqueId(v.callId), question: liveText(v.question) };
  return { sessionId };
}
export function parseLiveResponse(path: string, value: unknown) {
  return path === "live/session" ? parseLiveSession(value) : path === "live/close" ? parseLiveClose(value) : parseResponse(value);
}
