"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { clientDecisionService } from "@/features/clientDecision/service";
import { latestQuotationTask, type ProjectTask } from "@/features/tasks/types";
import { useResource } from "@/lib/api/useResource";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { ApiError } from "@/lib/api/apiError";
import { formatDate } from "@/lib/formatDate";
import { accountingService } from "./service";
import { canonicalAmount, formatDeposit } from "./contracts";

export function AccountingPanel({ projectId, tasks, onRefresh }: { projectId: string; tasks: ProjectTask[]; onRefresh: (signal: AbortSignal) => Promise<void> }) {
  const api = useApiClient(); const { user, activeRole } = useAuth();
  const presentation = latestQuotationTask(tasks, "PresentQuotationToClient");
  const readDecision = activeRole === "CommercialAdvisor" && !!presentation;
  const load = useCallback(async (signal: AbortSignal) => {
    const [state, decision] = await Promise.all([accountingService.read(api, projectId, signal), readDecision ? clientDecisionService.read(api, projectId, signal) : Promise.resolve(null)]);
    return { state, decision };
  }, [api, projectId, readDecision]);
  const resource = useResource(load); const data = resource.data;
  const [amount, setAmount] = useState(""); const [received, setReceived] = useState(""); const [reference, setReference] = useState(""); const [note, setNote] = useState("");
  const [confirmation, setConfirmation] = useState<"send" | "record" | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(); const [saved, setSaved] = useState(false);
  const operation = useRef<AbortController | null>(null); useEffect(() => () => operation.current?.abort(), []);
  const task = tasks.find(t => t.type === "RegisterInitialDeposit" && t.assignedToGoogleSubject === user?.subject && t.status === "Pending");
  const canSend = !saved && data?.state.accountingHandoff.available === false && data.decision?.decision === "Approved"
    && presentation?.quotationRound === data.decision.quotationRound && presentation?.status === "Completed" && presentation.assignedToGoogleSubject === user?.subject && activeRole === "CommercialAdvisor";
  const canRecord = !saved && data?.state.accountingHandoff.available && !data.state.deposit.available && activeRole === "Accounting" && !!task;
  const canonical = canonicalAmount(amount);
  const receivedAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(received) ? received + ":00-05:00" : "";
  const valid = canonical && receivedAt && Number.isFinite(Date.parse(receivedAt)) && reference.length <= 200 && note.length <= 2000;
  async function submit(kind: "send" | "record") {
    if (operation.current || confirmation !== kind || !data || (kind === "send" ? !canSend : !canRecord || !valid)) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError(undefined);
    try {
      const result = kind === "send" ? await accountingService.send(api, projectId, controller.signal) : await accountingService.record(api, projectId,
        { amount: canonical!, receivedAt, reference: reference.trim() || null, note: note.trim() || null }, controller.signal);
      if (controller.signal.aborted) return;
      resource.update({ ...data, state: result.state }); setSaved(true); setConfirmation(null);
      await onRefresh(controller.signal);
    } catch (failure) {
      if (controller.signal.aborted) return; setError(failure);
      if (failure instanceof ApiError && failure.status === 409) { setConfirmation(null); resource.refresh(); await onRefresh(controller.signal).catch(setError); }
    } finally { if (!controller.signal.aborted) { operation.current = null; setBusy(false); } }
  }
  const messages: Record<string, string> = { AlreadyRecorded: "El anticipo ya está registrado. Actualiza para consultarlo.", AlreadySentToAccounting: "La cotización ya fue enviada a Contabilidad.", ClientDecisionRequired: "Primero debe registrarse la aprobación del cliente.", DecisionNotApproved: "La decisión vigente no es una aprobación.", AccountingHandoffRequired: "La cotización todavía no fue enviada a Contabilidad.", InvalidDeposit: "Revisa el valor y la fecha de recepción; no puede ser futura.", InvalidWorkflowState: "El estado cambió. Actualiza el proyecto." };
  return <section className="panel stack" aria-labelledby="accounting-title">
    <h2 id="accounting-title" className="section-title">Anticipo inicial</h2>
    {resource.loading && <p role="status">Consultando Contabilidad…</p>}
    <ErrorNotice error={resource.error} retry={resource.refresh} />
    {error instanceof ApiError && error.code && messages[error.code] ? <p role="alert">{messages[error.code]}</p> : <ErrorNotice error={error} retry={resource.refresh} />}
    {data && !data.state.accountingHandoff.available && <p>{data.decision?.decision === "Approved" ? "Cotización aprobada. " : ""}Sin envío a Contabilidad registrado.</p>}
    {data?.state.accountingHandoff.available && <><p>Enviado a Contabilidad · Ronda {data.state.accountingHandoff.quotationRound}</p><p>{formatDate(data.state.accountingHandoff.sentAt)}</p>
      {!data.state.deposit.available && <p>Esperando registro del anticipo. Esto no confirma si el cliente ya realizó un pago.</p>}</>}
    {canSend && (confirmation !== "send" ? <button className="button-primary" onClick={() => setConfirmation("send")}>Enviar a Contabilidad</button> : <div className="stack">
      <p>Se creará una tarea para Contabilidad asociada a la ronda {data?.decision?.quotationRound} aprobada.</p>
      <button className="button-primary" disabled={busy} onClick={() => void submit("send")}>Confirmar envío a Contabilidad</button><button className="button-secondary" disabled={busy} onClick={() => setConfirmation(null)}>Cancelar</button></div>)}
    {canRecord && <form className="stack" onSubmit={e => { e.preventDefault(); if (valid) setConfirmation("record"); }}>
      <label className="field-label">Valor recibido (COP)<input className="form-control" inputMode="decimal" required maxLength={21} disabled={busy} value={amount} onChange={e => { setAmount(e.target.value); setConfirmation(null); }} /></label>
      <label className="field-label">Fecha/hora de recepción (Colombia)<input className="form-control" type="datetime-local" required disabled={busy} value={received} onChange={e => { setReceived(e.target.value); setConfirmation(null); }} /></label>
      <label className="field-label">Referencia opcional<input className="form-control" maxLength={200} disabled={busy} value={reference} onChange={e => { setReference(e.target.value); setConfirmation(null); }} /></label>
      <label className="field-label">Nota opcional<textarea className="form-control" maxLength={2000} disabled={busy} value={note} onChange={e => { setNote(e.target.value); setConfirmation(null); }} /></label>
      <p>No existe un porcentaje requerido ni un plazo formal definido. El registro no podrá editarse en esta versión.</p>
      {confirmation !== "record" ? <button className="button-primary" disabled={busy || !valid}>Registrar anticipo</button> : <div className="stack">
        <p>Registrar anticipo de {formatDeposit(canonical!)} recibido el {formatDate(receivedAt)}.</p>
        <button className="button-primary" type="button" disabled={busy} onClick={() => void submit("record")}>Confirmar registro</button><button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirmation(null)}>Cancelar</button></div>}
    </form>}
    {data?.state.deposit.available && <div className="stack"><h3>Anticipo registrado</h3><p className="text-lg font-semibold">{formatDeposit(data.state.deposit.amount!)}</p>
      <p>Recibido: {formatDate(data.state.deposit.receivedAt)}</p><p>Registrado: {formatDate(data.state.deposit.recordedAt)}</p>
      {data.state.deposit.reference && <p className="break-words">Referencia: {data.state.deposit.reference}</p>}{data.state.deposit.note && <p className="whitespace-pre-wrap break-words">Nota de Contabilidad: {data.state.deposit.note}</p>}
      <p>Este registro no implica pago total del proyecto ni define un saldo contractual.</p></div>}
  </section>;
}
