import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceRecorder } from "@/features/intelligence/hooks/useVoiceRecorder";
import { useSpeech } from "@/features/intelligence/hooks/useSpeech";
import { createApiClient } from "@/lib/api/apiClient";
import { MAX_AUDIO_BYTES } from "@/features/intelligence/types";
import { token } from "./fixtures";
import { deferred } from "./operationalFixtures";
import { intelligenceResponse } from "./intelligenceFixtures";
import { FakeAudio, FakeRecorder, mockVoiceBrowser } from "./intelligenceUiSetup";
beforeEach(() => { mockVoiceBrowser(); });
afterEach(() => { vi.useRealTimers(); });

describe("recorder lifecycle", () => {
  it.each(["audio/webm;codecs=opus", "audio/webm", "audio/mp4"])("selects supported MIME %s and names the original container correctly", async (mime) => {
    const { getUserMedia, stopTrack } = mockVoiceBrowser();
    FakeRecorder.supported = mime;
    const onFile = vi.fn();
    const { result, unmount } = renderHook(() => useVoiceRecorder(onFile));
    expect(getUserMedia).not.toHaveBeenCalled();
    await act(async () => { await result.current.start(); });
    expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({ audio: true });
    expect(result.current.state).toBe("recording");
    act(() => { result.current.stop(); });
    const file = onFile.mock.calls[0][0] as File;
    expect(file.name).toBe(mime === "audio/mp4" ? "voice.m4a" : "voice.webm");
    expect(file.type).toBe(mime === "audio/mp4" ? "audio/mp4" : "audio/webm");
    expect(stopTrack).toHaveBeenCalled();
    unmount();
  });
  it("cancels recording without sending audio and stops tracks", async () => {
    const { stopTrack } = mockVoiceBrowser();
    const onFile = vi.fn();
    const { result } = renderHook(() => useVoiceRecorder(onFile));
    await act(async () => { await result.current.start(); });
    act(() => { result.current.cancel(); });
    expect(result.current.state).toBe("idle");
    expect(onFile).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalled();
  });
  it.each(["cancel", "unmount"])("closes late microphone permission streams after %s", async (action) => {
    const { getUserMedia, stream, stopTrack } = mockVoiceBrowser();
    const permission = deferred<MediaStream>();
    getUserMedia.mockReturnValue(permission.promise);
    const onFile = vi.fn();
    const { result, unmount } = renderHook(() => useVoiceRecorder(onFile));
    let start!: Promise<void>;
    act(() => { start = result.current.start(); });
    if (action === "cancel") act(() => result.current.cancel()); else unmount();
    await act(async () => { permission.resolve(stream); await start; });
    expect(stopTrack).toHaveBeenCalled();
    expect(FakeRecorder.instances).toHaveLength(0);
    expect(onFile).not.toHaveBeenCalled();
  });
  it("stops automatically at 60 seconds", async () => {
    vi.useFakeTimers();
    const onFile = vi.fn();
    const { result } = renderHook(() => useVoiceRecorder(onFile));
    await act(async () => { await result.current.start(); });
    act(() => vi.advanceTimersByTime(60_000));
    expect(FakeRecorder.instances[0].stop).toHaveBeenCalledOnce();
    expect(onFile).toHaveBeenCalledOnce();
    expect(result.current.state).toBe("idle");
  });
  it("rejects excessive recording bytes and releases the microphone", async () => {
    const { stopTrack } = mockVoiceBrowser();
    const onFile = vi.fn();
    const { result } = renderHook(() => useVoiceRecorder(onFile));
    await act(async () => { await result.current.start(); });
    act(() => FakeRecorder.instances[0].ondataavailable?.({ data: new Blob([new Uint8Array(MAX_AUDIO_BYTES + 1)]) }));
    expect(result.current.error).toContain("10 MiB");
    expect(onFile).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalled();
  });
  it("handles unsupported recording without requesting permission", async () => {
    const { getUserMedia } = mockVoiceBrowser();
    FakeRecorder.supported = "unsupported";
    const { result } = renderHook(() => useVoiceRecorder(vi.fn()));
    await act(async () => { await result.current.start(); });
    expect(result.current.error).toContain("formato");
    expect(getUserMedia).not.toHaveBeenCalled();
  });
  it("stops a live recording on unmount/logout", async () => {
    const { stopTrack } = mockVoiceBrowser();
    const onFile = vi.fn();
    const { result, unmount } = renderHook(() => useVoiceRecorder(onFile));
    await act(async () => { await result.current.start(); });
    unmount();
    expect(stopTrack).toHaveBeenCalled();
    expect(onFile).not.toHaveBeenCalled();
  });
});

describe("speech lifecycle", () => {
  const client = () => createApiClient({ getSession: () => ({ token, generation: 1 , activeRole: "Management" as const}), invalidateSession: vi.fn() });
  const speechResponse = () => new Response(new Uint8Array([73, 68, 51]), { headers: { "Content-Type": "audio/mpeg" } });
  it("stops previous audio, revokes URLs on replacement/end, and supports replay", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => speechResponse()));
    const { result, unmount } = renderHook(() => useSpeech(client()));
    await act(async () => { await result.current.play(intelligenceResponse, 1); });
    expect(result.current.state).toBe("playing");
    await act(async () => { await result.current.play(intelligenceResponse, 2); });
    expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    act(() => FakeAudio.instances[1].onended?.());
    expect(result.current.state).toBe("idle");
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    await act(async () => { await result.current.play(intelligenceResponse, 2); });
    unmount();
    expect(FakeAudio.instances[2].pause).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
  });
  it("does not play a late speech response after unmount/logout", async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn(() => pending.promise); vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useSpeech(client()));
    let playback!: Promise<void>;
    act(() => { playback = result.current.play(intelligenceResponse, 1); });
    unmount();
    await act(async () => { pending.resolve(speechResponse()); await playback; });
    expect(FakeAudio.instances).toHaveLength(0);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("recovers from autoplay rejection with a user-initiated resume", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => speechResponse()));
    class BlockedAudio extends FakeAudio { play = vi.fn().mockRejectedValueOnce(new DOMException("Blocked", "NotAllowedError")).mockResolvedValue(undefined); }
    vi.stubGlobal("Audio", BlockedAudio);
    const { result } = renderHook(() => useSpeech(client()));
    await act(async () => { await result.current.play(intelligenceResponse, 1); });
    expect(result.current.state).toBe("paused");
    expect(result.current.error).toContain("Reanudar");
    await act(async () => { await result.current.toggle(); });
    expect(result.current.state).toBe("playing");
  });
});
