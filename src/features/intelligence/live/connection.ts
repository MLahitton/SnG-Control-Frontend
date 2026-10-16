import type { ApiClient } from "@/lib/api/types";
import { ApiError } from "@/lib/api/apiError";
import type { IntelligenceResponse } from "../types";
import { MAX_LIVE_EVENTS } from "./contracts";
import { parseLiveEvent, toolResult, type LiveEvent } from "./events";
import { liveService } from "./service";
import { observeAudio } from "./activity";

export type LiveState = "idle" | "connecting" | "listening" | "user_speaking" | "assistant_thinking" | "assistant_speaking" | "error" | "closing";
export type LiveFailure = "permission" | "microphone" | "unavailable" | "expired" | "delegation" | "network" | "limit" | "unsupported" | "secure_context" | "forbidden" | "protocol";
export const liveErrors: Record<LiveFailure, string> = {
  permission: "Permiso de micrófono denegado. Revisa el permiso del navegador.",
  microphone: "No se pudo usar el micrófono. Comprueba que esté conectado y disponible.",
  unavailable: "La conversación en vivo no está disponible. Puedes intentar de nuevo o usar voz básica.",
  expired: "La sesión de voz venció. Inicia una conversación nueva.",
  delegation: "No se pudo consultar la información empresarial. La conversación se ha detenido.",
  network: "Se perdió la conexión de voz. Inicia una conversación nueva.",
  limit: "Se alcanzó el límite de la sesión de voz. Intenta más tarde.",
  unsupported: "Este navegador no admite conversación en vivo. Puedes usar voz básica.",
  secure_context: "El micrófono requiere HTTPS o localhost y un navegador compatible.",
  forbidden: "No tienes acceso a la conversación en vivo.",
  protocol: "No se pudo continuar la conversación de forma segura. Inicia una sesión nueva.",
};
export interface Caption { id: string; role: "user" | "assistant"; text: string; start: number; end: number }
export interface LiveView {
  state: LiveState; muted: boolean; playbackBlocked: boolean; failure?: LiveFailure;
  captions: Caption[]; responses: IntelligenceResponse[]; closeUnconfirmed: boolean;
}
export const initialLiveView = (): LiveView => ({ state: "idle", muted: false, playbackBlocked: false, captions: [], responses: [], closeUnconfirmed: false });

function httpFailure(error: unknown, fallback: LiveFailure): LiveFailure {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 404 || error.status === 410) return "expired";
  if (error.status === 429) return "limit";
  if (error.status === 401 || error.status === 403) return "forbidden";
  if (error.status === 0) return "network";
  return fallback;
}
function waitForIce(pc: RTCPeerConnection, signal: AbortSignal): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (failed = false) => {
      clearTimeout(timer); pc.removeEventListener("icegatheringstatechange", change); signal.removeEventListener("abort", cancel);
      if (failed) reject(new Error("Connection unavailable")); else resolve();
    };
    const change = () => { if (pc.iceGatheringState === "complete") finish(); };
    const cancel = () => finish(true);
    const timer = setTimeout(cancel, 10_000);
    pc.addEventListener("icegatheringstatechange", change); signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel(); else change();
  });
}

// One instance per session. The React hook owns and disposes it on unmount.
export class LiveConnection {
  private view = initialLiveView();
  private controller = new AbortController();
  private pc?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private microphone?: MediaStream;
  private remote?: MediaStream;
  private audio?: HTMLAudioElement;
  private sessionId?: string;
  private startedId?: string;
  private ready = false;
  private closed = false;
  private closing = false;
  private finalized = false;
  private closePromise?: Promise<void>;
  private finishClose?: () => void;
  private connectTimer?: ReturnType<typeof setTimeout>;
  private meter = () => {};
  private calls = new Set<string>();
  private events = new Set<string>();
  private responses = new Map<string, string>();
  private working = new Set<string>();
  private pending = 0;

  constructor(private api: ApiClient, private notify: (view: LiveView) => void) {}
  private publish(patch: Partial<LiveView>) { this.view = { ...this.view, ...patch }; this.notify(this.view); }
  private activity(state: LiveState) {
    if (this.ready && !this.closing && !this.closed && this.view.state !== state) this.publish({ state });
  }
  async start() {
    this.publish({ ...initialLiveView(), state: "connecting" });
    if (!navigator.mediaDevices?.getUserMedia || window.isSecureContext === false) { this.fail("secure_context"); return; }
    if (typeof RTCPeerConnection === "undefined" || typeof MediaStream === "undefined") { this.fail("unsupported"); return; }
    this.connectTimer = setTimeout(() => this.fail("unavailable"), 45_000);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (this.closing || this.closed) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.microphone = stream;
      const pc = new RTCPeerConnection(); this.pc = pc;
      this.audio = new Audio(); this.audio.autoplay = true;
      this.audio.onerror = () => this.fail("network");
      this.remote = new MediaStream();
      for (const track of stream.getAudioTracks()) {
        pc.addTrack(track, stream);
        track.onended = () => { if (!this.closing && !this.closed) this.fail("microphone"); };
      }
      pc.ontrack = ({ track }) => {
        if (this.closing || this.closed) { track.stop(); return; }
        this.remote!.addTrack(track); this.audio!.srcObject = this.remote!;
        void this.resumeAudio();
        this.meter();
        this.meter = observeAudio(stream, this.remote!, (input, output) => this.activity(input && !this.view.muted ? "user_speaking" : output ? "assistant_speaking" : this.pending || this.working.size ? "assistant_thinking" : "listening"));
      };
      pc.onconnectionstatechange = () => {
        if (!this.closing && !this.closed && ["failed", "disconnected", "closed"].includes(pc.connectionState)) this.fail("network");
      };
      const channel = pc.createDataChannel("oai-events"); this.channel = channel;
      channel.onmessage = ({ data }: MessageEvent<unknown>) => this.handle(data);
      channel.onclose = () => { if (!this.closing && !this.closed) this.fail("network"); };
      channel.onerror = () => { if (!this.closing && !this.closed) this.fail("network"); };
      const offer = await pc.createOffer();
      if (this.closing || this.closed) return;
      await pc.setLocalDescription(offer);
      await waitForIce(pc, this.controller.signal);
      if (this.closing || this.closed) return;
      const result = await liveService.create(this.api, pc.localDescription?.sdp ?? "", this.controller.signal);
      if (this.closing || this.closed) { void liveService.close(this.api, result.sessionId).catch(() => {}); return; }
      this.sessionId = result.sessionId;
      if (this.startedId && this.startedId !== result.sessionId) { this.fail("protocol"); return; }
      await pc.setRemoteDescription({ type: "answer", sdp: result.sdp });
      // REST already starts Live. Never send session.start or session.update.
      this.markReady();
    } catch (error) {
      if (this.closing || this.closed) return;
      const name = error && typeof error === "object" && "name" in error ? error.name : "";
      this.fail(name === "NotAllowedError" ? "permission" : typeof name === "string" && ["NotFoundError", "NotReadableError", "OverconstrainedError"].includes(name) ? "microphone" : httpFailure(error, "unavailable"));
    }
  }
  private markReady() {
    if (this.closing || this.closed || !this.sessionId || !this.startedId) return;
    if (this.startedId !== this.sessionId) { this.fail("protocol"); return; }
    clearTimeout(this.connectTimer); this.ready = true; this.activity("listening");
  }
  private handle(data: unknown) {
    const event = parseLiveEvent(data);
    if (!event || this.closed) return;
    if (event.type === "closed") {
      this.finalized = true;
      if (this.closing) this.finishClose?.();
      else if (event.reason === "expired") this.fail("expired");
      else if (event.reason === "connection_lost") this.fail("network");
      else void this.close();
      return;
    }
    if (this.closing) return;
    if (event.type === "started") { this.startedId = event.sessionId; this.markReady(); return; }
    if (event.type === "failure") { this.fail(event.code.includes("rate_limit") ? "limit" : event.code.includes("expired") ? "expired" : event.code === "delegation_failed" ? "delegation" : "unavailable"); return; }
    if (!this.ready) return;
    if (event.type === "invalid_tool") { this.fail("protocol"); return; }
    if (event.type === "transcript") {
      if (this.events.has(event.eventId)) return;
      if (this.events.size >= MAX_LIVE_EVENTS) { this.fail("limit"); return; }
      this.events.add(event.eventId);
      const caption: Caption = { id: event.eventId, role: event.role, text: event.text, start: event.start, end: event.end };
      this.publish({ captions: [...this.view.captions, caption].sort((a, b) => a.start - b.start).slice(-160) });
      this.activity(event.role === "user" ? "user_speaking" : "assistant_speaking");
    }
    if (event.type === "response") {
      if (this.responses.size >= 128) { this.fail("limit"); return; }
      const previous = this.responses.get(event.delegationId);
      if (previous) this.working.delete(previous);
      this.responses.set(event.delegationId, event.responseId); this.working.add(event.responseId); this.activity("assistant_thinking");
    }
    if (event.type === "response_finished") { this.working.delete(event.responseId); if (!this.pending && !this.working.size && this.view.state === "assistant_thinking") this.activity("listening"); }
    if (event.type === "call") void this.delegate(event);
  }
  private send(value: object) {
    if (this.channel?.readyState !== "open") throw new Error("Channel unavailable");
    const data = JSON.stringify(value);
    const negotiatedLimit = this.pc?.sctp?.maxMessageSize;
    const limit = negotiatedLimit && negotiatedLimit > 0 ? Math.min(negotiatedLimit, 64 * 1024) : 64 * 1024;
    if (new TextEncoder().encode(data).length > limit) throw new Error("Result too large");
    this.channel.send(data);
  }
  private async delegate(event: Extract<LiveEvent, { type: "call" }>) {
    if (this.calls.has(event.callId) || !this.sessionId) return;
    if (this.calls.size >= 64) { this.fail("limit"); return; }
    this.calls.add(event.callId); this.pending++; this.activity("assistant_thinking");
    try {
      const response = await liveService.delegate(this.api, this.sessionId, event.callId, event.question, this.controller.signal);
      if (this.closing || this.closed) return;
      this.publish({ responses: [...this.view.responses.slice(-9), response] });
      this.send(toolResult(event.callId, response.spokenAnswer.trim() ? response.spokenAnswer : response.answer));
      this.send({ type: "response.create" });
    } catch (error) {
      if (!this.closing && !this.closed) this.fail(httpFailure(error, "delegation"));
    } finally { this.pending--; }
  }
  mute() {
    if (!this.ready || this.closing || this.closed) return;
    const muted = !this.view.muted;
    this.microphone?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    this.publish({ muted });
    if (muted) this.activity("listening");
  }
  async resumeAudio() {
    try { await this.audio?.play(); if (!this.closed && !this.closing) this.publish({ playbackBlocked: false }); }
    catch { if (!this.closed && !this.closing) this.publish({ playbackBlocked: true }); }
  }
  private fail(failure: LiveFailure) { if (!this.closing && !this.closed) void this.close(failure); }
  close(failure?: LiveFailure, immediate = false): Promise<void> {
    if (this.closePromise) { if (immediate) this.finishClose?.(); return this.closePromise; }
    this.closing = true; this.ready = false; clearTimeout(this.connectTimer);
    this.controller.abort(); this.meter();
    this.microphone?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    this.audio?.pause(); if (this.audio) { this.audio.onerror = null; this.audio.srcObject = null; }
    this.remote?.getTracks().forEach((track) => track.stop());
    this.publish({ state: failure ? "error" : "closing", failure, muted: false, playbackBlocked: false });
    const sessionId = this.sessionId; this.sessionId = undefined;
    const drained = new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1500);
        this.finishClose = () => { clearTimeout(timer); resolve(); };
        if (!this.finalized && this.channel?.readyState === "open") {
          try { this.send({ type: "session.close" }); } catch { this.finishClose(); }
          if (immediate) this.finishClose();
        } else this.finishClose();
    });
    const revoke = sessionId ? liveService.close(this.api, sessionId).then(() => true, () => false) : Promise.resolve(true);
    this.closePromise = (async () => {
      await drained;
      if (this.channel) { this.channel.onmessage = null; this.channel.onclose = null; this.channel.onerror = null; this.channel.close(); }
      if (this.pc) { this.pc.ontrack = null; this.pc.onconnectionstatechange = null; this.pc.close(); }
      this.closed = true; this.calls.clear(); this.events.clear(); this.responses.clear(); this.working.clear(); this.startedId = undefined;
      const revoked = await revoke;
      this.publish({ state: failure ? "error" : "idle", closeUnconfirmed: (!!sessionId && !this.finalized) || !revoked });
    })();
    return this.closePromise;
  }
  dispose() { this.notify = () => {}; void this.close(undefined, true); }
}
