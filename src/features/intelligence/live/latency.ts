// In-memory acoustic estimate, not provider VAD or proof of a useful factual answer.
// The existing meter has a 250 ms hangover. No transcript/IDs enter this boundary.
export interface PerceivedLatency {
  operation: "live_latency";
  source: "local_audio_energy";
  speech_stopped_ms: number;
  assistant_audio_ms: number;
  perceived_ms: number;
}
export class LiveLatency {
  private input = false;
  private output = false;
  private stoppedAt: number | undefined;
  private closed = false;
  constructor(private emit: (value: PerceivedLatency) => void, private now = () => performance.now()) {}
  get waiting() { return this.stoppedAt !== undefined; }
  sample(input: boolean, output: boolean) {
    if (this.closed) return;
    const now = this.now();
    if (input && !this.input) this.stoppedAt = undefined; // Interruption/new utterance.
    if (!input && this.input) this.stoppedAt = now;
    if (output && !this.output && !input && this.stoppedAt !== undefined) {
      this.emit({ operation: "live_latency", source: "local_audio_energy",
        speech_stopped_ms: this.stoppedAt, assistant_audio_ms: now,
        perceived_ms: Math.max(0, Math.round(now - this.stoppedAt)) });
      this.stoppedAt = undefined;
    }
    this.input = input; this.output = output;
  }
  reset() { this.input = false; this.output = false; this.stoppedAt = undefined; }
  close() { this.reset(); this.closed = true; }
}
export function reportLiveLatency(value: PerceivedLatency) {
  if (process.env.NODE_ENV === "development") console.info(JSON.stringify(value));
}
