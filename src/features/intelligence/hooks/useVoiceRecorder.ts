"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_AUDIO_BYTES, MAX_RECORDING_SECONDS } from "../types";

export const recordingFormats = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"] as const;
type Recording = { stream: MediaStream; recorder: MediaRecorder; timer?: ReturnType<typeof setInterval>; chunks: Blob[]; bytes: number; cancelled: boolean };

export function useVoiceRecorder(onFile: (file: File) => void) {
  const current = useRef<Recording | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const mounted = useRef(false);
  const [state, setState] = useState<"idle" | "requesting_permission" | "recording">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const dispose = useCallback(() => {
    generation.current += 1;
    pending.current = false;
    const active = current.current;
    current.current = null;
    if (active) {
      active.cancelled = true;
      clearInterval(active.timer);
      active.stream.getTracks().forEach((track) => track.stop());
      if (active.recorder.state !== "inactive") active.recorder.stop();
      active.chunks = [];
    }
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; dispose(); }; }, [dispose]);
  const cancel = () => { dispose(); setState("idle"); setSeconds(0); setError(""); };
  const stop = () => {
    const active = current.current;
    if (active && active.recorder.state !== "inactive") {
      clearInterval(active.timer);
      active.recorder.stop();
      active.stream.getTracks().forEach((track) => track.stop());
    }
  };
  async function start() {
    if (pending.current || current.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Este navegador no permite grabar audio aquí. Usa el chat textual o un navegador con micrófono en HTTPS.");
      return;
    }
    const mimeType = recordingFormats.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { setError("No hay un formato de grabación compatible. Puedes usar el chat textual."); return; }
    const version = ++generation.current;
    pending.current = true; setError(""); setState("requesting_permission"); setSeconds(0);
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || generation.current !== version) { stream.getTracks().forEach((track) => track.stop()); return; }
      const recorder = new MediaRecorder(stream, { mimeType });
      const active: Recording = { stream, recorder, chunks: [], bytes: 0, cancelled: false };
      current.current = active;
      recorder.ondataavailable = (event) => {
        if (active.cancelled || !event.data.size) return;
        active.bytes += event.data.size;
        if (active.bytes > MAX_AUDIO_BYTES) {
          dispose(); setState("idle"); setError("La grabación supera 10 MiB. Haz una consulta más breve."); return;
        }
        active.chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (!mounted.current || active.cancelled) return;
        dispose(); setState("idle"); setError("No pudimos grabar el audio. Intenta de nuevo o escribe tu consulta.");
      };
      recorder.onstop = () => {
        clearInterval(active.timer);
        active.stream.getTracks().forEach((track) => track.stop());
        if (active.cancelled || !mounted.current || generation.current !== version) return;
        current.current = null; pending.current = false; setState("idle");
        // Normalize MP4 container MIME, including Safari's codec parameters.
        const type = (recorder.mimeType || mimeType).split(";")[0].toLowerCase();
        const file = new File(active.chunks, type === "audio/mp4" ? "voice.m4a" : "voice.webm", { type });
        active.chunks = [];
        if (!file.size) { setError("No se capturó audio. Intenta grabar de nuevo."); return; }
        onFile(file);
      };
      recorder.start(1000);
      const started = Date.now();
      active.timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        if (!mounted.current || active.cancelled) return;
        setSeconds(Math.min(elapsed, MAX_RECORDING_SECONDS));
        if (elapsed >= MAX_RECORDING_SECONDS) stop();
      }, 250);
      pending.current = false; setState("recording");
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      if (!mounted.current || generation.current !== version) return;
      dispose(); setState("idle");
      setError("No pudimos acceder al micrófono. Revisa el permiso del navegador; puedes continuar escribiendo.");
    }
  }
  return { state, seconds, error, start, stop, cancel };
}
