"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { useResource } from "@/lib/api/useResource";
import { ApiError } from "@/lib/api/apiError";
import { intelligenceService } from "../service";
import { IntelligenceError, intelligenceErrorMessage, isConversationUnavailable } from "../errors";
import { MAX_MESSAGE_CHARACTERS, MAX_RECORDING_SECONDS, type Message } from "../types";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { useSpeech } from "../hooks/useSpeech";
import { useConversation } from "../hooks/useConversation";
import { useLiveVoice } from "../hooks/useLiveVoice";
import { liveErrors, type LiveState } from "../live/connection";
import { LiveTranscript } from "./LiveTranscript";
import { IntelligenceResponseView } from "./IntelligenceResponseView";
import styles from "./Intelligence.module.css";

const liveLabels: Record<LiveState, string> = { idle: "Voz en vivo lista", connecting: "Conectando…", listening: "Escuchando", user_speaking: "Te escucho", assistant_thinking: "Pensando…", assistant_speaking: "Respondiendo…", error: "Conversación detenida", closing: "Finalizando conversación…" };

export function IntelligencePanel({ onClose, visible = true }: { onClose: () => void; visible?: boolean }) {
  const api = useApiClient();
  const load = useCallback((signal: AbortSignal) => intelligenceService.session(api, signal), [api]);
  const session = useResource(load);
  const conversation = useConversation(api, !!session.data);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<"text" | "voice" | null>(null);
  const [failure, setFailure] = useState<unknown>();
  const [denied, setDenied] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const speech = useSpeech(api);
  const live = useLiveVoice(api);
  const [basicVoice, setBasicVoice] = useState(false);
  const recorder = useVoiceRecorder((file) => { void send(file); });
  const available = !!session.data && !!conversation.id && !denied;
  const blocked = !available || !!busy || live.active || recorder.state !== "idle";
  useEffect(() => {
    const element = dialog.current;
    if (visible) element?.showModal(); else element?.close();
    const viewport = window.visualViewport;
    function resize() {
      if (!element || !viewport) return;
      const mobile = window.matchMedia("(max-width: 767px)").matches;
      element.style.height = mobile ? `${viewport.height}px` : "";
      element.style.maxHeight = mobile ? `${viewport.height}px` : "";
      element.style.top = mobile ? `${viewport.offsetTop}px` : "";
    }
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      request.current?.abort(); element?.close();
    };
  }, [visible]);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "nearest" }); }, [messages, busy, live.captions.length]);
  async function send(value: string | File) {
    if (!visible || !available || live.active || request.current || (typeof value === "string" && (!value.trim() || value.length > MAX_MESSAGE_CHARACTERS))) return;
    const controller = new AbortController();
    request.current = controller;
    speech.stop(); setFailure(undefined);
    const text = typeof value === "string";
    setBusy(text ? "text" : "voice");
    const userId = ++sequence.current;
    if (text) {
      setInput("");
      setMessages((items) => [...items.slice(-39), { id: userId, role: "user", content: value.trim(), state: "sending" }]);
    }
    try {
      const result = text ? await (async () => {
        try { return await intelligenceService.chat(api, value.trim(), controller.signal, conversation.id); }
        catch (error) {
          if (!isConversationUnavailable(error) || controller.signal.aborted) throw error;
          const id = await conversation.recover(controller.signal);
          controller.signal.throwIfAborted();
          setMessages((items) => items.filter((item) => item.id === userId));
          return intelligenceService.chat(api, value.trim(), controller.signal, id);
        }
      })() : await intelligenceService.voice(api, value, controller.signal);
      if (controller.signal.aborted) return;
      const responseId = ++sequence.current;
      setMessages((items) => [
        ...items.slice(-38).map((item): Message => item.id === userId && item.role === "user" ? { ...item, state: "complete" } : item),
        ...(!text && "transcript" in result && typeof result.transcript === "string" ? [{ id: userId, role: "user" as const, content: result.transcript, state: "complete" as const }] : []),
        { id: responseId, role: "assistant", response: result, state: "complete" },
      ]);
      if (!text && autoSpeak) void speech.play(result, responseId);
    } catch (error) {
      if (controller.signal.aborted) return;
      setFailure(error);
      if (error instanceof ApiError && error.status === 403) { setDenied(true); void live.stop(); }
      setMessages((items) => items.map((item): Message => item.id === userId && item.role === "user" ? { ...item, state: "error" } : item));
      if (text) setInput(value);
    } finally {
      if (!controller.signal.aborted) { request.current = null; setBusy(null); }
    }
  }
  function cancelQuery() {
    request.current?.abort(); request.current = null; setBusy(null);
    setMessages((items) => items.map((item): Message => item.role === "user" && item.state === "sending" ? { ...item, state: "error" } : item));
  }
  function closePanel() {
    cancelQuery(); speech.stop(); recorder.cancel(); live.clear(); onClose();
  }
  async function newConversation() {
    cancelQuery(); speech.stop(); recorder.cancel();
    setBusy("text");
    await live.stop(); live.clear();
    if (!mounted.current) return;
    setMessages([]); setInput(""); setFailure(undefined);
    await conversation.reset();
    if (mounted.current) setBusy(null);
  }
  function navigate() { if (window.matchMedia("(max-width: 767px)").matches) closePanel(); }
  const error = failure ?? session.error ?? conversation.error;
  return <dialog ref={dialog} className={styles.panel} aria-labelledby="intelligence-title" onCancel={(event) => { event.preventDefault(); closePanel(); }}>
    <header className={styles.header}><div><h2 id="intelligence-title">SnG Intelligence</h2><p className="metadata">Consulta gerencial · voz generada por IA</p></div><button type="button" className="button-ghost" onClick={closePanel} aria-label="Cerrar SnG Intelligence">Cerrar</button></header>
    <div className={styles.conversation} role="log" aria-label="Conversación actual" aria-live="polite" aria-relevant="additions text">
      {messages.length === 0 && <p className="metadata">Consulta proyectos y operación por texto o voz. El contexto de texto y voz en vivo se conserva durante esta sesión de uso, hasta su expiración.</p>}
      {messages.map((message) => <article key={message.id} className={message.role === "user" ? styles.userMessage : styles.assistantMessage} aria-label={message.role === "user" ? "Mensaje del usuario" : "Respuesta de Intelligence"}>
        <p className={styles.speaker}>{message.role === "user" ? "Tú" : "Intelligence"}</p>
        {message.role === "user" ? <><p className={styles.answer}>{message.content}</p>{message.state === "error" && <p className="metadata">Consulta sin completar.</p>}</> : <>
          <IntelligenceResponseView response={message.response} onAsk={(text) => { if (!blocked) void send(text); }} onNavigate={navigate} disabled={blocked} />
          {speech.messageId === message.id && speech.state !== "idle" ? <div className={styles.audioControls}>
            {speech.state === "loading" ? <p role="status">Preparando audio…</p> : <button className="button-secondary" onClick={() => void speech.toggle()}>{speech.state === "playing" ? "Pausar audio" : "Reanudar audio"}</button>}
            <button className="button-ghost" onClick={speech.stop}>Detener audio</button>
          </div> : <button className="button-ghost" disabled={blocked || live.active || !message.response.spokenAnswer.trim()} onClick={() => void speech.play(message.response, message.id)}>Escuchar respuesta</button>}
        </>}
      </article>)}
      {live.captions.length > 0 && <LiveTranscript captions={live.captions} />}
      <div ref={end} />
    </div>
    <footer className={styles.footer}>
      <button type="button" className="button-ghost" disabled={!!busy || conversation.loading || !session.data} onClick={() => void newConversation()}>Nueva conversación</button>
      {conversation.loading && session.data && <p role="status">Preparando conversación…</p>}
      {session.loading && <p role="status">Verificando acceso a Intelligence…</p>}
      {!!error && <div role="alert" className="error-message"><p>{intelligenceErrorMessage(error)}</p>{error instanceof IntelligenceError && error.requestId && <p className="metadata">Referencia: {error.requestId}</p>}{(!session.data || denied || !!conversation.error) && <button className="button-secondary" onClick={() => { cancelQuery(); speech.stop(); recorder.cancel(); live.clear(); setMessages([]); setInput(""); setDenied(false); setFailure(undefined); session.refresh(); }}>Volver a verificar</button>}</div>}
      {speech.error && <p role="status" className="info-notice">{speech.error}</p>}
      {recorder.error && <p role="alert" className="error-message">{recorder.error}</p>}
      {!basicVoice && <section className={styles.liveControls} aria-label="Voice Live">
        <p role="status" aria-label="Estado de voz en vivo" className={styles.liveStatus} data-active={live.active}>{liveLabels[live.state]}{live.muted ? " · Micrófono silenciado" : ""}</p>
        {live.failure && <p role="alert" className="error-message">{liveErrors[live.failure]}</p>}
        {live.closeUnconfirmed && <p role="status" className="metadata">Micrófono liberado. No se pudo confirmar el cierre remoto completo.</p>}
        {live.active && <><p className="metadata">Habla naturalmente; puedes interrumpir. La conversación por voz está activa. Al finalizar, puedes continuar por texto.</p><div className={styles.audioControls}>
          <button type="button" className="button-secondary" disabled={live.state === "connecting" || live.state === "closing"} aria-label={live.muted ? "Activar micrófono" : "Silenciar micrófono"} aria-pressed={live.muted} onClick={live.mute}>{live.muted ? "Activar micrófono" : "Silenciar micrófono"}</button>
          <button type="button" className="button-secondary" disabled={live.state === "closing"} aria-label="Finalizar conversación" onClick={() => void live.stop()}>Finalizar conversación</button>
        </div></>}
        {live.playbackBlocked && <button type="button" className="button-secondary" onClick={() => void live.resumeAudio()}>Activar audio de la conversación</button>}
      </section>}
      {!live.active && recorder.state === "idle" && <button type="button" className="button-ghost" disabled={!!busy} onClick={() => { speech.stop(); setBasicVoice((value) => !value); }}>{basicVoice ? "Volver a voz en vivo" : "Usar modo de voz básico"}</button>}
      {basicVoice && <p className="metadata">Voz básica: grabar, detener y enviar. Cada consulta es independiente.</p>}
      {busy && <div className={styles.audioControls}><p role="status">{busy === "voice" ? "Enviando y procesando audio…" : "Analizando…"}</p><button className="button-ghost" onClick={cancelQuery}>Cancelar consulta</button></div>}
      {recorder.state !== "idle" && <div className={styles.audioControls}><p role="status">{recorder.state === "recording" ? `Grabando · ${recorder.seconds} / ${MAX_RECORDING_SECONDS} s` : "Esperando permiso de micrófono…"}</p>{recorder.state === "recording" && <button className="button-primary" aria-label="Detener grabación" onClick={recorder.stop}>Detener y enviar</button>}<button className="button-ghost" onClick={recorder.cancel}>Cancelar grabación</button></div>}
      <form onSubmit={(event) => { event.preventDefault(); if (!blocked) void send(input); }}>
        <label className="field-label" htmlFor="intelligence-input">Tu consulta</label>
        <textarea id="intelligence-input" className="form-control" rows={2} maxLength={MAX_MESSAGE_CHARACTERS} value={input} disabled={blocked} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!blocked) void send(input); } }} />
        <div className={styles.composerActions}>{basicVoice && <label className={styles.autoSpeak}><input type="checkbox" disabled={!!busy || recorder.state !== "idle"} checked={autoSpeak} onChange={(event) => setAutoSpeak(event.target.checked)} />Escuchar al consultar por voz</label>}{!live.active && <button type="button" className="button-secondary" aria-label={basicVoice ? "Iniciar consulta por voz" : "Iniciar conversación por voz"} disabled={blocked} onClick={() => { speech.stop(); if (basicVoice) void recorder.start(); else void live.start(conversation.id, conversation.recover); }}><Icon name="microphone" /></button>}<button className="button-primary" disabled={blocked || !input.trim()}>Enviar</button></div>
      </form>
    </footer>
  </dialog>;
}
