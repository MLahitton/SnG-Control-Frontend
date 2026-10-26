import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveLatency, reportLiveLatency, type PerceivedLatency } from "@/features/intelligence/live/latency";
import { useLiveVoice } from "@/features/intelligence/hooks/useLiveVoice";
import { createApiClient } from "@/lib/api/apiClient";
import { LivePeer, LiveTrack, mockLiveBrowser } from "./liveBrowser";
import { liveCreated, liveCaption, completedCall } from "./liveFixtures";
import { token } from "./fixtures";
const audio = vi.hoisted(() => ({ update: (input: boolean, output: boolean) => { void input; void output; }, cleanup: vi.fn() }));
vi.mock("@/features/intelligence/live/activity", () => ({ observeAudio: (_a: unknown, _b: unknown, update: typeof audio.update) => { audio.update = update; return audio.cleanup; } }));
beforeEach(() => { mockLiveBrowser(); audio.cleanup.mockClear(); });

describe("numeric local latency", () => {
  it("measures once per turn, ignores continuing output and resets on interruption", () => {
    let now = 0; const rows: PerceivedLatency[] = [];
    const meter = new LiveLatency(value => rows.push(value), () => now);
    meter.sample(true, false); now = 100; meter.sample(false, false);
    expect(meter.waiting).toBe(true);
    now = 900; meter.sample(false, true); meter.sample(false, true);
    expect(rows).toEqual([{ operation: "live_latency", source: "local_audio_energy", speech_stopped_ms: 100, assistant_audio_ms: 900, perceived_ms: 800 }]);
    now = 1100; meter.sample(true, true); now = 1200; meter.sample(false, true);
    expect(rows).toHaveLength(1); // Existing audio is not a new response.
    meter.sample(true, false); now = 1400; meter.sample(false, false);
    now = 1800; meter.sample(false, true);
    expect(rows[1].perceived_ms).toBe(400);
  });
  it("clears pending measurement on mute/reset and permanently on close", () => {
    const emit = vi.fn(); const meter = new LiveLatency(emit);
    meter.sample(true, false); meter.sample(false, false); meter.reset();
    meter.sample(false, true); expect(emit).not.toHaveBeenCalled();
    meter.sample(true, false); meter.sample(false, false); meter.close();
    meter.sample(false, true); meter.sample(true, false); meter.sample(false, true);
    expect(meter.waiting).toBe(false); expect(emit).not.toHaveBeenCalled();
  });
  it("only emits fixed numeric metadata in development, never production", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const row: PerceivedLatency = { operation: "live_latency", source: "local_audio_energy", speech_stopped_ms: 1, assistant_audio_ms: 3, perceived_ms: 2 };
    vi.stubEnv("NODE_ENV", "production"); reportLiveLatency(row); expect(spy).not.toHaveBeenCalled();
    vi.stubEnv("NODE_ENV", "development"); reportLiveLatency(row);
    expect(spy).toHaveBeenCalledExactlyOnceWith(JSON.stringify(row));
  });
});

async function start() {
  const fetchMock = vi.fn(async (path: string) => Response.json(path.endsWith("/session") ? liveCreated : { closed: true }));
  vi.stubGlobal("fetch", fetchMock);
  const api = createApiClient({ getSession: () => ({ token, generation: 1 , activeRole: "Management" as const}), invalidateSession: vi.fn() });
  const hook = renderHook(() => useLiveVoice(api));
  await act(async () => { await hook.result.current.start(); });
  const pc = LivePeer.instances[0];
  await act(async () => { pc.started(); pc.ontrack?.({ track: new LiveTrack() }); });
  return { ...hook, pc, fetchMock };
}
it("shows thinking at acoustic speech stop; captions and tools never enter telemetry", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const logs = vi.spyOn(console, "info").mockImplementation(() => {});
  const { result, pc, fetchMock } = await start();
  act(() => audio.update(true, false)); expect(result.current.state).toBe("user_speaking");
  act(() => audio.update(false, false)); expect(result.current.state).toBe("assistant_thinking");
  act(() => { pc.channel.emit(liveCaption("user", "PRIVATE PROJECT CLIENT")); pc.channel.emit(completedCall()); });
  expect(logs).not.toHaveBeenCalled();
  act(() => audio.update(false, true)); expect(result.current.state).toBe("assistant_speaking");
  expect(logs).toHaveBeenCalledTimes(1);
  const log = logs.mock.calls[0][0];
  expect(log).not.toContain(token); expect(log).not.toContain("PRIVATE"); expect(log).not.toContain("question");
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(pc.channel.send).not.toHaveBeenCalled();
  await act(async () => { await result.current.stop(); });
});
it.each(["stop", "identity-unmount"])("cleans latency on %s and ignores late metering", async (mode) => {
  vi.stubEnv("NODE_ENV", "development");
  const logs = vi.spyOn(console, "info").mockImplementation(() => {});
  const { result, unmount } = await start();
  act(() => { audio.update(true, false); audio.update(false, false); });
  if (mode === "stop") await act(async () => { await result.current.stop(); });
  else unmount();
  act(() => audio.update(false, true));
  expect(logs).not.toHaveBeenCalled(); expect(audio.cleanup).toHaveBeenCalled();
});
