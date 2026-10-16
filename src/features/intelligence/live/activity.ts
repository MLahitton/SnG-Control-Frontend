// Local metering only: no recording, transcription, or audio uploads.
export function observeAudio(input: MediaStream, output: MediaStream, update: (input: boolean, output: boolean) => void) {
  if (typeof AudioContext === "undefined") return () => {};
  let context: AudioContext | undefined;
  let frame = 0;
  const sources: MediaStreamAudioSourceNode[] = [];
  try {
    context = new AudioContext();
    const meters = [input, output].map((stream) => {
      const source = context!.createMediaStreamSource(stream);
      const analyser = context!.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser); sources.push(source);
      return { analyser, samples: new Float32Array(512), lastSound: -Infinity };
    });
    const tick = () => {
      const now = performance.now();
      const active = meters.map((meter) => {
        meter.analyser.getFloatTimeDomainData(meter.samples);
        const rms = Math.sqrt(meter.samples.reduce((sum, sample) => sum + sample * sample, 0) / meter.samples.length);
        if (rms > 0.015) meter.lastSound = now;
        return now - meter.lastSound < 250;
      });
      update(active[0], active[1]);
      frame = requestAnimationFrame(tick);
    };
    void context.resume().catch(() => {});
    frame = requestAnimationFrame(tick);
  } catch { /* Captions still provide activity when metering is unavailable. */ }
  return () => {
    cancelAnimationFrame(frame);
    sources.forEach((source) => source.disconnect());
    if (context) void context.close().catch(() => {});
  };
}
