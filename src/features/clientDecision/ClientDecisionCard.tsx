"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { useAuth } from "@/features/auth/hooks/useAuth";
import type { ProjectTask } from "@/features/tasks/types";
import { useResource } from "@/lib/api/useResource";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { ApiError } from "@/lib/api/apiError";
import { formatDate } from "@/lib/formatDate";
import { clientDecisionService } from "./service";
import { decisionLabels, type ClientDecision } from "./contracts";

export function ClientDecisionCard({ projectId, tasks, onRefresh }: {
  projectId: string; tasks: ProjectTask[]; onRefresh: (signal: AbortSignal) => Promise<void>;
}) {
  const api = useApiClient();
  const { user, activeRole } = useAuth();
  const load = useCallback((signal: AbortSignal) => clientDecisionService.read(api, projectId, signal), [api, projectId]);
  const resource = useResource(load);
  const [decision, setDecision] = useState<ClientDecision | "">("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [saved, setSaved] = useState(false);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const presentations = tasks.filter(t => t.type === "PresentQuotationToClient");
  const task = presentations.length === 1 ? presentations[0] : undefined;
  const canRecord = !saved && resource.data?.available === false && activeRole === "CommercialAdvisor"
    && task?.assignedToGoogleSubject === user?.subject && task?.area === "Commercial"
    && task?.status === "InProgress" && !!task.startedAt && task.completedAt === null;
  async function save() {
    if (operation.current || !canRecord || !decision || !confirm) return;
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError(undefined);
    try {
      await clientDecisionService.record(api, projectId, decision, note.trim() ? note : null, controller.signal);
      if (controller.signal.aborted) return;
      setSaved(true); setConfirm(false);
      const current = await clientDecisionService.read(api, projectId, controller.signal);
      if (controller.signal.aborted) return;
      resource.update(current);
      await onRefresh(controller.signal);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure);
      if (failure instanceof ApiError && failure.status === 409) { setConfirm(false); resource.refresh(); }
    } finally { if (!controller.signal.aborted) { operation.current = null; setBusy(false); } }
  }
  const conflict = error instanceof ApiError ? error.code === "AlreadyRecorded" ? "La respuesta ya fue registrada. Se actualizará la información."
    : error.code === "InvalidWorkflowState" ? "La presentación ya no permite registrar una respuesta. Actualiza el proyecto."
    : error.status === 403 ? "Solo el asesor asignado puede registrar esta respuesta." : null : null;
  return <section className="stack" aria-labelledby="client-decision-title">
    <h2 id="client-decision-title" className="section-title">Respuesta del cliente</h2>
    {resource.loading && <p role="status">Consultando respuesta del cliente…</p>}
    <ErrorNotice error={resource.error} retry={resource.refresh} />
    {conflict ? <p role="alert" className="error-message">{conflict}</p> : <ErrorNotice error={error} retry={() => { resource.refresh(); void onRefresh(new AbortController().signal).catch(setError); }} />}
    {saved && <p role="status">Respuesta registrada.</p>}
    {resource.data?.available && <div className="stack">
      <p className="font-medium">{decisionLabels[resource.data.decision!]}</p>
      <p>Registrada: {formatDate(resource.data.recordedAt)}</p>
      {resource.data.note && <p className="whitespace-pre-wrap break-words">Nota: {resource.data.note}</p>}
    </div>}
    {resource.data?.available === false && !canRecord && !saved && <p>No hay una respuesta del cliente registrada todavía.</p>}
    {canRecord && <form className="stack" onSubmit={e => { e.preventDefault(); setConfirm(true); }}>
      <fieldset disabled={busy} className="stack"><legend>¿Cómo respondió el cliente a la cotización presentada?</legend>
        {Object.entries(decisionLabels).map(([value, label]) => <label className="flex gap-2 items-center" key={value}>
          <input type="radio" name="client-decision" required value={value} checked={decision === value}
            onChange={() => { setDecision(value as ClientDecision); setConfirm(false); }} />{label}</label>)}
        <label className="field-label">Nota opcional<textarea className="form-control" maxLength={2000} value={note}
          onChange={e => { setNote(e.target.value); setConfirm(false); }} /></label>
      </fieldset>
      {!confirm ? <button className="button-primary" disabled={busy || !decision}>Registrar respuesta</button> : <div className="stack">
        <p>Esta respuesta quedará registrada en el proyecto y no podrá editarse: {decision && decisionLabels[decision]}.</p>
        <div className="flex flex-wrap gap-3"><button className="button-primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? "Guardando…" : "Confirmar respuesta"}</button>
          <button className="button-secondary" type="button" disabled={busy} onClick={() => setConfirm(false)}>Cancelar</button></div>
      </div>}
    </form>}
  </section>;
}
