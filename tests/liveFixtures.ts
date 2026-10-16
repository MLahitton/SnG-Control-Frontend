export const liveSessionId = "live_synthetic_123";
export const liveSdp = ["v=0", "o=- 1 1 IN IP4 0.0.0.0", "s=-", "t=0 0", "m=audio 9 UDP/TLS/RTP/SAVPF 111", "m=application 9 UDP/DTLS/SCTP webrtc-datachannel", "a=ice-ufrag:synthetic", "a=ice-pwd:synthetic-test-only", "a=fingerprint:sha-256 AA:BB", ""].join("\r\n");
export const liveCreated = { sessionId: liveSessionId, sdp: liveSdp };
export const completedCall = (callId = "call_123", question = "Cómo va Casa Ximena") => ({
  type: "response.event", delegation_id: "delegation_1", event: { type: "response.output_item.done", item: { type: "function_call", status: "completed", call_id: callId, name: "consult_sng_intelligence", arguments: JSON.stringify({ question }) } },
});
export const liveCaption = (role: "user" | "assistant", text: string, start = 0, id = `${role}_${start}`) => ({ type: role === "user" ? "session.input_transcript.delta" : "session.output_transcript.delta", event_id: id, delta: text, start_ms: start, end_ms: start + 100 });
