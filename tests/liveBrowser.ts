import { vi } from "vitest";
import { FakeAudio, mockIntelligenceBrowser } from "./intelligenceUiSetup";
import { liveSdp, liveSessionId } from "./liveFixtures";

export class LiveTrack {
  enabled = true;
  onended: (() => void) | null = null;
  stop = vi.fn();
}
export class LiveStream {
  constructor(public tracks: LiveTrack[] = []) {}
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks; }
  addTrack(track: LiveTrack) { this.tracks.push(track); }
}
export class LiveChannel {
  readyState = "open";
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  acknowledgeClose = true;
  send = vi.fn((data: string) => { if (this.acknowledgeClose && JSON.parse(data).type === "session.close") this.emit({ type: "session.closed", reason: "close_requested" }); });
  close = vi.fn(() => { this.readyState = "closed"; });
  emit(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
}
export class LivePeer extends EventTarget {
  static instances: LivePeer[] = [];
  iceGatheringState = "complete";
  connectionState = "connected";
  localDescription: RTCSessionDescriptionInit | null = null;
  ontrack: ((event: { track: LiveTrack }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  channel = new LiveChannel();
  createDataChannel = vi.fn(() => this.channel);
  addTrack = vi.fn();
  createOffer = vi.fn(async () => ({ type: "offer" as const, sdp: liveSdp }));
  setLocalDescription = vi.fn(async (value: RTCSessionDescriptionInit) => { this.localDescription = value; });
  setRemoteDescription = vi.fn<(value: RTCSessionDescriptionInit) => Promise<void>>(async () => {});
  close = vi.fn(() => { this.connectionState = "closed"; });
  constructor() { super(); LivePeer.instances.push(this); }
  started() { this.channel.emit({ type: "session.started", session: { id: liveSessionId } }); }
}
export function mockLiveBrowser() {
  mockIntelligenceBrowser(); LivePeer.instances = []; FakeAudio.instances = [];
  const track = new LiveTrack();
  const stream = new LiveStream([track]);
  const getUserMedia = vi.fn(async () => stream as unknown as MediaStream);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  vi.stubGlobal("RTCPeerConnection", LivePeer); vi.stubGlobal("MediaStream", LiveStream); vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("AudioContext", undefined);
  return { track, stream, getUserMedia };
}
