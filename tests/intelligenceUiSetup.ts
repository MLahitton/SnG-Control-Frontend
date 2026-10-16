import { vi } from "vitest";

export function mockIntelligenceBrowser() {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:test-audio") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
}
export class FakeRecorder {
  static supported = "audio/webm;codecs=opus";
  static instances: FakeRecorder[] = [];
  static isTypeSupported(type: string) { return type === FakeRecorder.supported; }
  state: RecordingState = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start = vi.fn(() => { this.state = "recording"; });
  stop = vi.fn(() => {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["recorded-audio"], { type: this.mimeType }) });
    this.onstop?.();
  });
  constructor(_stream: MediaStream, options: MediaRecorderOptions) { this.mimeType = options.mimeType!; FakeRecorder.instances.push(this); }
}
export class FakeAudio {
  static instances: FakeAudio[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(async () => {});
  pause = vi.fn();
  removeAttribute = vi.fn();
  load = vi.fn();
  constructor(public src: string) { FakeAudio.instances.push(this); }
}
export function mockVoiceBrowser() {
  mockIntelligenceBrowser();
  FakeRecorder.instances = []; FakeRecorder.supported = "audio/webm;codecs=opus"; FakeAudio.instances = [];
  const stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  const getUserMedia = vi.fn(async () => stream);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal("Audio", FakeAudio);
  return { stopTrack, stream, getUserMedia };
}
