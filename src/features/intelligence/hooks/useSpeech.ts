"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiClient } from "@/lib/api/types";
import type { IntelligenceResponse } from "../types";
import { intelligenceService } from "../service";
import { intelligenceErrorMessage } from "../errors";

export function useSpeech(api: ApiClient) {
  const active = useRef<{ controller?: AbortController; audio?: HTMLAudioElement; url?: string }>({});
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [messageId, setMessageId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const dispose = useCallback(() => {
    const previous = active.current;
    active.current = {};
    previous.controller?.abort();
    if (previous.audio) {
      previous.audio.onended = null; previous.audio.onerror = null;
      previous.audio.pause(); previous.audio.removeAttribute("src"); previous.audio.load();
    }
    if (previous.url) URL.revokeObjectURL(previous.url);
  }, []);
  useEffect(() => dispose, [dispose]);
  const stop = () => { dispose(); setState("idle"); setMessageId(null); setError(""); };
  async function play(response: IntelligenceResponse, id: number) {
    stop();
    const operation = { controller: new AbortController(), audio: undefined as HTMLAudioElement | undefined, url: undefined as string | undefined };
    active.current = operation;
    setMessageId(id); setState("loading");
    try {
      const blob = await intelligenceService.speech(api, response.spokenAnswer, response.responseType, operation.controller.signal);
      if (operation.controller.signal.aborted || active.current !== operation) return;
      operation.url = URL.createObjectURL(blob);
      const audio = new Audio(operation.url);
      operation.audio = audio;
      audio.onended = () => { if (active.current === operation) stop(); };
      audio.onerror = () => {
        if (active.current !== operation) return;
        stop(); setError("No pudimos reproducir el audio. Puedes volver a escuchar la respuesta.");
      };
      try { await audio.play(); if (active.current === operation) setState("playing"); }
      catch {
        if (active.current !== operation) return;
        setState("paused"); setError("Pulsa Reanudar audio para permitir la reproducción en este navegador.");
      }
    } catch (failure) {
      if (operation.controller.signal.aborted || active.current !== operation) return;
      stop(); setError(intelligenceErrorMessage(failure));
    }
  }
  async function toggle() {
    const operation = active.current, audio = operation.audio;
    if (!audio) return;
    if (state === "playing") { audio.pause(); setState("paused"); }
    else {
      try { await audio.play(); if (active.current === operation) { setState("playing"); setError(""); } }
      catch { if (active.current === operation) setError("No pudimos iniciar el audio. Revisa los permisos de reproducción."); }
    }
  }
  return { state, messageId, error, play, stop, toggle };
}
