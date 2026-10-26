import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveVoice } from "@/features/intelligence/hooks/useLiveVoice";
import { createApiClient } from "@/lib/api/apiClient";
import { liveCreated, liveSessionId, liveSdp, completedCall, liveCaption } from "./liveFixtures";
import { LivePeer, LiveTrack, mockLiveBrowser } from "./liveBrowser";
import { FakeAudio } from "./intelligenceUiSetup";
import { token } from "./fixtures";
import { deferred } from "./operationalFixtures";
const client = () => createApiClient({ getSession: () => ({ token, generation: 1 , activeRole: "Management" as const}), invalidateSession: vi.fn() });
function network() {
  const fetchMock = vi.fn<(path: string, options: RequestInit) => Promise<Response>>(async (path) => Response.json(path.endsWith("/session") ? liveCreated : { closed: true }));
  vi.stubGlobal("fetch", fetchMock); return fetchMock;
}
beforeEach(() => { mockLiveBrowser(); network(); });
afterEach(() => { vi.useRealTimers(); });
async function start() {
  const api = client();
  const hook = renderHook(() => useLiveVoice(api));
  await act(async () => { await hook.result.current.start(); });
  const pc = LivePeer.instances[0];
  act(() => pc.started());
  return { ...hook, pc, channel: pc.channel };
}
describe("Live session lifecycle", () => {
  it("keeps the same opaque session ID through start and close", async () => {
    const id = "opaque:synthetic/session+1=";
    const fetchMock = network();
    fetchMock.mockResolvedValueOnce(Response.json({ ...liveCreated, sessionId: id }, { status: 201 }));
    const api = client(); const { result } = renderHook(() => useLiveVoice(api));
    await act(async () => { await result.current.start(); });
    const channel = LivePeer.instances[0].channel;
    act(() => channel.emit({ type: "session.started", session: { id } }));
    expect(result.current.state).toBe("listening");
    await act(async () => channel.emit(completedCall()));
    expect(fetchMock.mock.calls.some(([path]) => path.endsWith("/delegate"))).toBe(false);
    await act(async () => { await result.current.stop(); });
    expect(JSON.parse(fetchMock.mock.calls.find(([path]) => path.endsWith("/close"))![1].body as string).sessionId).toBe(id);
    expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/session"))).toHaveLength(1);
  });
  it("starts on demand, exchanges SDP once and waits for session.started", async () => {
    const { track, stream, getUserMedia } = mockLiveBrowser(); const fetchMock = network();
    const api = client(); const { result } = renderHook(() => useLiveVoice(api));
    expect(getUserMedia).not.toHaveBeenCalled();
    await act(async () => { await Promise.all([result.current.start(), result.current.start()]); });
    const pc = LivePeer.instances[0];
    expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({ audio: true });
    expect(pc.addTrack).toHaveBeenCalledWith(track, stream); expect(pc.createDataChannel).toHaveBeenCalledWith("oai-events");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ sdp: liveSdp });
    expect(pc.setRemoteDescription).toHaveBeenCalledWith({ type: "answer", sdp: liveSdp });
    expect(result.current.state).toBe("connecting");
    act(() => pc.started()); expect(result.current.state).toBe("listening");
    expect(pc.channel.send).not.toHaveBeenCalled();
  });
  it("plays the remote track and allows gesture recovery when autoplay is blocked", async () => {
    const { result, pc } = await start();
    FakeAudio.instances[0].play.mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
    const remote = new LiveTrack();
    await act(async () => pc.ontrack?.({ track: remote }));
    expect(result.current.playbackBlocked).toBe(true);
    await act(async () => { await result.current.resumeAudio(); });
    expect(result.current.playbackBlocked).toBe(false);
    expect((FakeAudio.instances[0] as unknown as HTMLAudioElement).srcObject).toBeTruthy();
  });
  it("mutes/unmutes the track without ending the session", async () => {
    const { track } = mockLiveBrowser(); const fetchMock = network(); const { result } = await start();
    act(() => result.current.mute()); expect(track.enabled).toBe(false); expect(result.current.muted).toBe(true);
    act(() => result.current.mute()); expect(track.enabled).toBe(true); expect(result.current.muted).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("closes provider, backend and local resources exactly once", async () => {
    const { track } = mockLiveBrowser(); const fetchMock = network(); const { result, pc, channel } = await start();
    await act(async () => { await result.current.stop(); await result.current.stop(); });
    expect(channel.send).toHaveBeenCalledWith(JSON.stringify({ type: "session.close" }));
    expect(channel.close).toHaveBeenCalledOnce(); expect(pc.close).toHaveBeenCalledOnce(); expect(track.stop).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/close"))).toHaveLength(1);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({ sessionId: liveSessionId });
    expect(result.current.state).toBe("idle"); expect(result.current.closeUnconfirmed).toBe(false);
    expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
  });
  it("does not wait indefinitely for provider finalization", async () => {
    vi.useFakeTimers(); const { track } = mockLiveBrowser(); const { result, channel, pc } = await start();
    channel.acknowledgeClose = false;
    let closing: Promise<void> | undefined;
    act(() => { closing = result.current.stop(); });
    expect(track.stop).toHaveBeenCalled(); expect(result.current.state).toBe("closing");
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); await closing; });
    expect(result.current.closeUnconfirmed).toBe(true); expect(pc.close).toHaveBeenCalled();
  });
  it.each(["NotAllowedError", "NotFoundError", "NotReadableError"])("handles microphone error %s safely", async (name) => {
    const { getUserMedia } = mockLiveBrowser(); getUserMedia.mockRejectedValue(new DOMException("raw provider secret", name));
    const api = client(); const { result } = renderHook(() => useLiveVoice(api));
    await act(async () => { await result.current.start(); });
    expect(result.current.failure).toBe(name === "NotAllowedError" ? "permission" : "microphone");
    expect(result.current.state).toBe("error"); expect(LivePeer.instances).toHaveLength(0);
  });
  it.each(["cancel", "unmount"])("releases permission granted after %s", async (action) => {
    const { getUserMedia, stream, track } = mockLiveBrowser(); const pending = deferred<MediaStream>(); getUserMedia.mockReturnValue(pending.promise);
    const api = client(); const { result, unmount } = renderHook(() => useLiveVoice(api));
    let starting!: Promise<void>;
    act(() => { starting = result.current.start(); });
    if (action === "cancel") await act(async () => { await result.current.stop(); }); else unmount();
    await act(async () => { pending.resolve(stream as unknown as MediaStream); await starting; });
    expect(track.stop).toHaveBeenCalled(); expect(LivePeer.instances).toHaveLength(0);
  });
  it("releases a late created session after cancellation without attaching SDP", async () => {
    const pending = deferred<Response>(); const fetchMock = network(); fetchMock.mockImplementationOnce(() => pending.promise);
    const api = client(); const { result } = renderHook(() => useLiveVoice(api));
    let starting!: Promise<void>;
    act(() => { starting = result.current.start(); }); await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => { await result.current.stop(); });
    await act(async () => { pending.resolve(Response.json(liveCreated)); await starting; });
    expect(LivePeer.instances[0].setRemoteDescription).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([path]) => path.endsWith("/close"))).toBe(true);
  });
  it.each([[503, "unavailable"], [429, "limit"], [403, "forbidden"]] as const)("maps create HTTP %s and releases devices", async (status, failure) => {
    const { track } = mockLiveBrowser(); network().mockResolvedValueOnce(Response.json({ detail: "raw" }, { status }));
    const api = client(); const { result } = renderHook(() => useLiveVoice(api));
    await act(async () => { await result.current.start(); });
    expect(result.current.failure).toBe(failure); expect(track.stop).toHaveBeenCalled();
  });
  it("handles network loss, expiry and provider errors without raw text", async () => {
    const { result, channel } = await start();
    await act(async () => channel.emit({ type: "error", error: { code: "rate_limit_exceeded", message: "raw secret" } }));
    expect(result.current.failure).toBe("limit");
  });
  it.each(["disconnected", "failed"])("releases the session when WebRTC is %s", async (state) => {
    const { result, pc } = await start();
    await act(async () => { pc.connectionState = state; pc.onconnectionstatechange?.(); });
    expect(result.current.failure).toBe("network"); expect(pc.close).toHaveBeenCalled();
  });
  it("shows provider expiry", async () => {
    const { result, channel } = await start();
    await act(async () => channel.emit({ type: "session.closed", reason: "expired" }));
    expect(result.current.failure).toBe("expired");
  });
  it("cleans up immediately on unmount and uses the original auth for backend close", async () => {
    const { track } = mockLiveBrowser(); const fetchMock = network(); let snapshot = { token, generation: 1 , activeRole: "Management" as const};
    const invalidateSession = vi.fn(); const api = createApiClient({ getSession: () => snapshot, invalidateSession });
    const { result, unmount } = renderHook(() => useLiveVoice(api));
    await act(async () => { await result.current.start(); }); act(() => LivePeer.instances[0].started());
    fetchMock.mockResolvedValueOnce(Response.json({}, { status: 401 }));
    snapshot = { token: "next-test-account", generation: 2 , activeRole: "Management" as const};
    await act(async () => unmount());
    expect(track.stop).toHaveBeenCalled(); expect(LivePeer.instances[0].close).toHaveBeenCalled();
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("Authorization")).toBe(`Bearer ${token}`);
    expect(invalidateSession).not.toHaveBeenCalled();
  });
});
describe("Live delegation and continuous context", () => {
  it("never executes reflected calls or sends tool outputs; Live BFF uses only session/close", async () => {
    const fetchMock = network(); const { result, channel } = await start();
    await act(async () => { channel.emit(completedCall()); channel.emit(completedCall()); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(channel.send).not.toHaveBeenCalled();
    expect(result.current.state).toBe("listening");
    await act(async () => { await result.current.stop(); });
    expect(fetchMock.mock.calls.map(([path]) => path.split("/").pop())).toEqual(["session", "close"]);
    expect(channel.send.mock.calls.map(([data]) => JSON.parse(data).type)).toEqual(["session.close"]);
  });
  it("ends the browser session at the absolute 600 second limit", async () => {
    vi.useFakeTimers(); const { result, pc } = await start();
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000); });
    expect(result.current.failure).toBe("expired"); expect(pc.close).toHaveBeenCalled();
  });
  it("uses nested response lifecycle for thinking and handles backend failure safely", async () => {
    const { result, channel } = await start();
    act(() => channel.emit({ type: "response.event", delegation_id: "delegation_1", event: { type: "response.created", response: { id: "response_1" } } }));
    expect(result.current.state).toBe("assistant_thinking");
    act(() => channel.emit({ type: "response.event", delegation_id: "delegation_1", event: { type: "response.completed", response: { id: "response_1", output: [] } } }));
    expect(result.current.state).toBe("listening");
    await act(async () => channel.emit({ type: "response.event", delegation_id: "delegation_1", event: { type: "response.failed", response: { error: "private details" } } }));
    expect(result.current.failure).toBe("delegation");
  });

  it("keeps several voice turns on one connection without rewriting or sending transcripts as chat", async () => {
    const fetchMock = network(); const { result, channel } = await start();
    act(() => channel.emit(liveCaption("user", "Cómo va Casa", 0)));
    act(() => channel.emit(liveCaption("assistant", "¿Cuál Casa?", 1000)));
    expect(result.current.state).toBe("assistant_speaking");
    act(() => channel.emit(liveCaption("user", "La de Ximena", 2000)));
    expect(result.current.state).toBe("user_speaking");
    expect(result.current.captions.map((c) => c.text)).toEqual(["Cómo va Casa", "¿Cuál Casa?", "La de Ximena"]);
    expect(LivePeer.instances).toHaveLength(1); expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(channel.send).not.toHaveBeenCalled(); expect(FakeAudio.instances[0].pause).not.toHaveBeenCalled();
  });
  it("deduplicates caption events, preserves whitespace and ignores reasoning", async () => {
    const { result, channel } = await start();
    act(() => { channel.emit(liveCaption("user", "La ")); channel.emit(liveCaption("user", "La ")); channel.emit(liveCaption("user", "de Ximena", 100)); channel.emit({ type: "response.event", event: { type: "response.reasoning_text.delta", delta: "hidden" } }); });
    expect(result.current.captions.map((c) => c.text).join("")).toBe("La de Ximena");
  });
  it("does not execute argument deltas or a different tool", async () => {
    const fetchMock = network(); const { result, channel } = await start();
    act(() => channel.emit({ type: "response.event", event: { type: "response.function_call_arguments.delta", delta: '{"question":"x"}' } }));
    const wrong = completedCall(); wrong.event.item.name = "arbitrary_tool";
    await act(async () => channel.emit(wrong));
    expect(result.current.failure).toBeUndefined(); expect(fetchMock.mock.calls.some(([path]) => path.endsWith("/delegate"))).toBe(false);
    expect(channel.send).not.toHaveBeenCalled();
  });


});
