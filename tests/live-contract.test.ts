// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseLiveEvent, toolResult } from "@/features/intelligence/live/events";
import { parseLiveRequest, parseLiveSession, parseLiveClose, parseSdp } from "@/features/intelligence/live/contracts";
import { completedCall, liveCaption, liveCreated, liveSdp } from "./liveFixtures";
const parse = (value: unknown) => parseLiveEvent(JSON.stringify(value));

describe("closed GPT-Live contracts", () => {
  it("admits only the typed REST response and SDP", () => {
    expect(parseLiveSession(liveCreated)).toEqual(liveCreated);
    expect(() => parseLiveSession({ ...liveCreated, secret: "reject" })).toThrow();
    expect(parseLiveClose({ closed: true, secret: "remove" })).toEqual({ closed: true });
    expect(() => parseLiveClose({ closed: false })).toThrow();
  });
  it.each(["", "v=0\r\n", liveSdp + "a=" + "x".repeat(32768), liveSdp + "a=bad\u0000"])("rejects invalid/big SDP", (sdp) => expect(() => parseSdp(sdp)).toThrow());
  it("bounds SDP answers by UTF-8 bytes, not character count", () => {
    const sdp = liveSdp + "a=x:" + "é".repeat(16384) + "\r\n";
    expect(sdp.length).toBeLessThan(32768);
    expect(() => parseLiveSession({ ...liveCreated, sdp })).toThrow();
  });
  it("preserves SDP answer line endings without normalizing the returned text", () => {
    const sdp = liveSdp.replace(/\r\n/g, "\n");
    expect(parseLiveSession({ ...liveCreated, sdp }).sdp).toBe(sdp);
  });
  it.each(["live/session", "live/delegate", "live/close"])("rejects arbitrary request fields at %s", (path) => expect(() => parseLiveRequest(path, { ...liveCreated, url: "https://evil.test" })).toThrow());
  it("requires a completed nested function item, never argument deltas/done alone", () => {
    expect(parse(completedCall())).toMatchObject({ type: "call", callId: "call_123", question: "Cómo va Casa Ximena", delegationId: "delegation_1" });
    for (const type of ["response.function_call_arguments.delta", "response.function_call_arguments.done"]) expect(parse({ type: "response.event", delegation_id: "d", event: { ...completedCall().event.item, type } })).toBeNull();
    const event = completedCall(); event.event.item.status = "in_progress";
    expect(parse(event)).toBeNull();
    expect(parse({ ...completedCall(), event: { ...completedCall().event, item: { ...completedCall().event.item, status: undefined } } })).toMatchObject({ type: "call", callId: "call_123" });
  });
  it("rejects unknown tools, extra arguments and invalid completed calls", () => {
    const wrong = completedCall(); wrong.event.item.name = "delete_project";
    expect(parse(wrong)).toEqual({ type: "invalid_tool" });
    const extra = completedCall(); extra.event.item.arguments = JSON.stringify({ question: "Hi", url: "https://evil.test" });
    expect(parse(extra)).toEqual({ type: "invalid_tool" });
    expect(parse(completedCall("unsafe/id"))).toEqual({ type: "invalid_tool" });
  });
  it("ignores unknown, malformed, oversized and reasoning events", () => {
    for (const data of ["{", "x".repeat(65537), null, new Uint8Array([1])]) expect(parseLiveEvent(data)).toBeNull();
    expect(parse({ type: "response.event", event: { type: "response.reasoning_text.delta", delta: "private reasoning" } })).toBeNull();
    expect(parse({ type: "unknown" })).toBeNull();
  });
  it("preserves spaces and timestamps in captions; rejects invalid timeline", () => {
    expect(parse(liveCaption("user", " ", 200))).toMatchObject({ type: "transcript", text: " ", start: 200, end: 300 });
    expect(parse({ ...liveCaption("user", "Hi"), end_ms: -1 })).toBeNull();
    expect(parse({ ...liveCaption("user", "Hi"), start_ms: Infinity })).toBeNull();
  });
  it("returns only factual tool output with the original call ID", () => {
    expect(toolResult("call_1", "Two projects")).toEqual({ type: "response.item.create", item: { type: "function_call_output", call_id: "call_1", output: '{"answer":"Two projects"}' } });
  });
});
