"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { clientDecisionService } from "@/features/clientDecision/service";
import { decisionLabels } from "@/features/clientDecision/contracts";
import { taskStatusLabels, type ProjectTask } from "@/features/tasks/types";
import { useResource } from "@/lib/api/useResource";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { ApiError } from "@/lib/api/apiError";
import { formatDate } from "@/lib/formatDate";
import { quotationRoundsService } from "./service";

export function QuotationRoundsPanel({ projectId, tasks, onRefresh }: {
  projectId: string; tasks: ProjectTask[]; onRefresh: (signal: AbortSignal) => Promise<void>;
}) {
  const api = useApiClient(); const { user, activeRole } = useAuth();
  const hasPresentation = tasks.some(t => t.type === "PresentQuotationToClient");
  const load = useCallback(async (signal: AbortSignal) => {
    const [history, decision] = await Promise.all([quotationRoundsService.read(api, projectId, signal), hasPresentation ? clientDecisionService.read(api, projectId, signal) : Promise.resolve(null)]);
    return { history, decision };
  }, [api, projectId, hasPresentation]);
  const resource = useResource(load); const [changes, setChanges] = useState(""); const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false); const [error, setError] = useState<unknown>();
  const operation = useRef<AbortController | null>(null); useEffect(() => () => operation.current?.abort(), []);
  const current = resource.data?.decision;
  const presentation = tasks.find(t => t.id === current?.presentQuotationTaskId && t.quotationRound === current.quotationRound);
  const canRequest = !saved && activeRole === "CommercialAdvisor" && current?.decision === "ChangesRequested"
    && presentation?.assignedToGoogleSubject === user?.subject && presentation?.status === "Completed"
    && !tasks.some(t => (t.quotationRound ?? 0) > (current.quotationRound ?? 0));
  async function send() {
    if (!canRequest || !confirm || !changes.trim() || changes.length > 4000 || operation.current) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError(undefined);
    try {
      await quotationRoundsService.request(api, projectId, changes.trim(), controller.signal);
      if (controller.signal.aborted) return;
      setSaved(true); setConfirm(false); resource.refresh(); await onRefresh(controller.signal);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure);
      if (failure instanceof ApiError && failure.status === 409) { setConfirm(false); resource.refresh(); await onRefresh(controller.signal).catch(setError); }
    } finally { if (!controller.signal.aborted) { operation.current = null; setBusy(false); } }
  }
  const messages: Record<string, string> = { AlreadyRequested: "La recotización ya fue solicitada.", ClientDecisionRequired: "Primero debe registrarse la respuesta del cliente.", DecisionDoesNotRequestChanges: "La respuesta actual no solicita cambios.", InvalidWorkflowState: "La ronda actual ya no permite esta operación. Actualiza el proyecto." };
  return <section className="stack" aria-labelledby="quotation-history-title">
    <h2 id="quotation-history-title" className="section-title">Historial de cotizaciones</h2>
    {resource.loading && <p role="status">Consultando rondas…</p>}
    <ErrorNotice error={resource.error} retry={resource.refresh} />
    {error instanceof ApiError && error.code && messages[error.code] ? <p role="alert">{messages[error.code]}</p> : <ErrorNotice error={error} />}
    {saved && <p role="status">Recotización solicitada. Enviada a Presupuestos.</p>}
    {resource.data?.history.rounds.map(round => <article key={round.roundNumber} className="panel stack">
      <h3>Ronda {round.roundNumber}</h3>
      {round.requotationRequest && <div><p className="font-medium">Cambios formalizados por el asesor para Presupuestos:</p><p className="whitespace-pre-wrap break-words">{round.requotationRequest.requestedChanges}</p><p>{formatDate(round.requotationRequest.requestedAt)}</p></div>}
      {round.prepareQuotationTask && <p>Presupuestos: {taskStatusLabels[round.prepareQuotationTask.status]}</p>}
      {round.budgetQuotation && <p>Versión de Presupuestos confirmada: {formatDate(round.budgetQuotation.confirmedAt)}</p>}
      {round.reviewQuotationTask && <p>Revisión comercial: {taskStatusLabels[round.reviewQuotationTask.status]}</p>}
      {round.commercialQuotation && <p>Cotización comercial confirmada: {formatDate(round.commercialQuotation.confirmedAt)}</p>}
      {round.presentQuotationTask && <p>Presentación: {taskStatusLabels[round.presentQuotationTask.status]}</p>}
      {round.clientDecision && <p>Cliente: {decisionLabels[round.clientDecision.decision]}{round.clientDecision.note && ` · Nota del asesor: ${round.clientDecision.note}`}</p>}
    </article>)}
    {resource.data?.history.hasMore && <p>Se muestran las primeras {resource.data.history.returned} de {resource.data.history.total} rondas. El historial mostrado es parcial.</p>}
    {canRequest && <form className="stack" onSubmit={e => { e.preventDefault(); setConfirm(true); }}>
      <h3>Nueva cotización</h3><p>El cliente solicitó cambios.</p>
      {current?.note && <p>Nota registrada: {current.note}</p>}
      <label className="field-label">Describe qué debe ajustar Presupuestos<textarea className="form-control" required maxLength={4000} disabled={busy} value={changes} onChange={e => { setChanges(e.target.value); setConfirm(false); }} /></label>
      {!confirm ? <button className="button-primary" disabled={busy || !changes.trim()}>Enviar a Presupuestos</button> : <div className="stack">
        <p>Se abrirá una nueva ronda de cotización y Presupuestos recibirá una nueva tarea.</p>
        <div className="flex flex-wrap gap-3"><button className="button-primary" type="button" disabled={busy} onClick={() => void send()}>{busy ? "Enviando…" : "Confirmar nueva ronda"}</button><button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirm(false)}>Cancelar</button></div>
      </div>}
    </form>}
  </section>;
}
