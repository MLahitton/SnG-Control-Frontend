"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { latestQuotationTask, type ProjectTask } from "@/features/tasks/types";
import { documentsService } from "@/features/documents/service";
import type { DocumentUpload, ProjectDocument } from "@/features/documents/types";
import { useResource } from "@/lib/api/useResource";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { ApiError } from "@/lib/api/apiError";
import { saveDownload } from "@/lib/api/saveDownload";
import { formatDate } from "@/lib/formatDate";
import { canonicalAmount, formatDeposit } from "./contracts";
import { verificationService } from "./verification";

export function AccountingPanel({ projectId, tasks, onRefresh }: { projectId: string; tasks: ProjectTask[]; onRefresh: (signal: AbortSignal) => Promise<void> }) {
  const api = useApiClient(); const { user, activeRole } = useAuth();
  const load = useCallback((signal: AbortSignal) => verificationService.read(api, projectId, signal), [api, projectId]);
  const resource = useResource(load); const data = resource.data;
  const [uploads, setUploads] = useState<DocumentUpload[]>([]); const [selected, setSelected] = useState<string[] | null>(null);
  const [amount, setAmount] = useState(""); const [received, setReceived] = useState(""); const [note, setNote] = useState("");
  const [confirmation, setConfirmation] = useState<"send" | "approve" | "reject" | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(); const [notice, setNotice] = useState("");
  const operation = useRef<AbortController | null>(null); const requestKey = useRef<string | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const presentation = latestQuotationTask(tasks, "PresentQuotationToClient");
  const ownPresentation = presentation?.assignedToGoogleSubject === user?.subject && presentation?.status === "Completed";
  const canManage = data?.canManage && activeRole === "CommercialAdvisor" && ownPresentation;
  const canReview = data?.canReview && activeRole === "Accounting" && tasks.some(t => t.type === "RegisterInitialDeposit" && t.status === "Pending" && t.assignedToGoogleSubject === user?.subject);
  const current = data?.documents.filter(d => d.isCurrent) ?? [];
  const ids = selected ?? current.map(d => d.id);
  const pending = data?.reviews.find(r => r.status === "Pending");
  const canonical = canonicalAmount(amount);
  const receivedAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(received) ? received + ":00-05:00" : "";
  const valid = !!canonical && !!receivedAt && Number.isFinite(Date.parse(receivedAt)) && note.length <= 2000;
  async function run(action: "upload" | "send" | "approve" | "reject") {
    if (operation.current || !data || (action === "upload" || action === "send" ? !canManage : !canReview)) return;
    if (action !== "upload" && confirmation !== action) return;
    if (action === "send" && (!data.canSubmit || !ids.length)) return;
    if ((action === "approve" && !valid) || (action === "reject" && !note.trim()) || ((action === "approve" || action === "reject") && !pending)) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError(undefined); setNotice("");
    try {
      if (action === "upload") {
        if (!uploads.length || uploads.length > 15 || uploads.some(u => !u.file.size || u.file.size > 100_000_000) || uploads.reduce((n, u) => n + u.file.size, 0) > 300_000_000) throw new ApiError(400);
        await verificationService.upload(api, projectId, uploads, controller.signal); if (controller.signal.aborted) return; setUploads([]); setSelected(null); requestKey.current = null;
      } else if (action === "send") {
        requestKey.current ??= crypto.randomUUID();
        await verificationService.submit(api, projectId, requestKey.current, ids, controller.signal);
      } else {
        await verificationService.decide(api, projectId, pending!.id, action === "approve", action === "approve" ? canonical : null, action === "approve" ? receivedAt : null, note.trim() || null, controller.signal);
      }
      if (controller.signal.aborted) return;
      setConfirmation(null); resource.update(await load(controller.signal)); setNotice(action === "upload" ? "Comprobantes cargados. Falta enviarlos a revisión." : "Operación registrada.");
      await onRefresh(controller.signal);
    } catch (failure) {
      if (controller.signal.aborted) return; setError(failure);
      if (failure instanceof ApiError && failure.status === 409) { setConfirmation(null); resource.refresh(); await onRefresh(controller.signal).catch(setError); }
    } finally { if (!controller.signal.aborted) { operation.current = null; setBusy(false); } }
  }
  async function download(doc: ProjectDocument) {
    if (operation.current) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError(undefined);
    try { await saveDownload(() => documentsService.download(api, projectId, doc.id, controller.signal), doc.originalFileName, controller.signal); }
    catch (e) { if (!controller.signal.aborted) setError(e); }
    finally { if (!controller.signal.aborted) { operation.current = null; setBusy(false); } }
  }
  const messages: Record<string, string> = { VerificationAlreadyDecided: "La revisión ya fue resuelta. Se actualizó el estado.", VerificationDocumentsLocked: "Hay una revisión pendiente o un anticipo registrado. Actualiza el proyecto.", InvalidDeposit: "Revisa el valor positivo y la fecha de recepción; no puede ser futura.", InstallationAssigneeNotConfigured: "Falta configurar la cuenta de Instalación para aprobar el anticipo.", InvalidVerificationDocuments: "Selecciona comprobantes vigentes de este proyecto.", VerificationRequestConflict: "El envío cambió. Actualiza el proyecto antes de volver a enviarlo." };
  if (!data?.available) return <>{resource.loading && <p role="status">Consultando etapa de anticipo…</p>}<ErrorNotice error={resource.error} retry={resource.refresh} /></>;
  return <section className="panel stack" aria-labelledby="accounting-title">
    <h2 id="accounting-title" className="section-title">Verificación del anticipo</h2>
    <p>Los comprobantes son evidencia para revisión; su carga no confirma la recepción del dinero.</p>
    {data.accounting.accountingHandoff.available && <p>Cotización aprobada · Ronda {data.accounting.accountingHandoff.quotationRound}. Consulta la cotización comercial en este expediente.</p>}
    <ErrorNotice error={resource.error} retry={resource.refresh} />
    {error instanceof ApiError && error.code && messages[error.code] ? <p role="alert">{messages[error.code]}</p> : <ErrorNotice error={error} retry={resource.refresh} />}
    {busy && <p role="status">Procesando…</p>}{notice && <p role="status">{notice}</p>}
    {canManage && <div className="stack">
      <label className="field-label">Adjuntar comprobantes<input type="file" multiple disabled={busy} onChange={e => { setUploads(Array.from(e.target.files ?? []).map(file => ({ file, replacesDocumentId: null }))); setConfirmation(null); e.target.value = ""; }} /></label>
      <p className="metadata">Máximo 15 comprobantes vigentes; 100 MB por archivo y 300 MB por carga.</p>
      {uploads.map((u, index) => <label className="field-label" key={index}>{u.file.name}<select className="form-control" disabled={busy} value={u.replacesDocumentId ?? ""} onChange={e => setUploads(previous => previous.map((item, i) => i === index ? { ...item, replacesDocumentId: e.target.value || null } : item))}>
        <option value="">Agregar comprobante</option>{current.map(d => <option key={d.id} value={d.id}>Sustituir {d.originalFileName}</option>)}
      </select></label>)}
      <button className="button-secondary" disabled={busy || !uploads.length} onClick={() => void run("upload")}>Cargar comprobantes</button>
    </div>}
    <h3>Comprobantes</h3>
    {!data.documents.length && <p>No hay comprobantes cargados.</p>}
    <ul className="stack">{data.documents.map(doc => <li key={doc.id}>
      {canManage && doc.isCurrent && <input aria-label={`Incluir ${doc.originalFileName}`} type="checkbox" disabled={busy} checked={ids.includes(doc.id)} onChange={e => { setSelected(e.target.checked ? [...ids, doc.id] : ids.filter(id => id !== doc.id)); requestKey.current = null; setConfirmation(null); }} />}
      <button className="text-link" disabled={busy} onClick={() => void download(doc)}>{doc.originalFileName}</button> · {doc.isCurrent ? "Vigente" : "Histórico"} · {formatDate(doc.uploadedAt)}
    </li>)}</ul>
    {canManage && data.canSubmit && <button className="button-primary" disabled={busy || !ids.length} onClick={() => setConfirmation("send")}>Enviar a Contabilidad</button>}
    {pending && <p>Revisión pendiente de Contabilidad.</p>}
    {canReview && <div className="stack">
      <label className="field-label">Valor recibido (COP)<input className="form-control" inputMode="decimal" maxLength={21} disabled={busy} value={amount} onChange={e => { setAmount(e.target.value); setConfirmation(null); }} /></label>
      <label className="field-label">Fecha/hora de recepción (Colombia)<input className="form-control" type="datetime-local" disabled={busy} value={received} onChange={e => { setReceived(e.target.value); setConfirmation(null); }} /></label>
      <label className="field-label">Observaciones<textarea className="form-control" maxLength={2000} disabled={busy} value={note} onChange={e => { setNote(e.target.value); setConfirmation(null); }} /></label>
      <p>Las observaciones son obligatorias para rechazar. Registra el total efectivamente verificado, sin sumar automáticamente comprobantes.</p>
      <button className="button-primary" disabled={busy || !valid} onClick={() => setConfirmation("approve")}>Aprobar anticipo</button>
      <button className="button-secondary" disabled={busy || !note.trim()} onClick={() => setConfirmation("reject")}>Rechazar anticipo</button>
    </div>}
    {confirmation && <div className="stack" role="group" aria-label="Confirmar operación contable">
      <p>{confirmation === "send" ? `Enviar ${ids.length} comprobantes a revisión.` : confirmation === "approve" ? `Aprobar ${formatDeposit(canonical!)} y crear la tarea de Toma de medidas.` : "Rechazar esta solicitud y conservar sus comprobantes y observaciones."}</p>
      <button className="button-primary" disabled={busy} onClick={() => void run(confirmation)}>Confirmar {confirmation === "send" ? "envío a Contabilidad" : confirmation === "approve" ? "aprobación" : "rechazo"}</button>
      <button className="button-secondary" disabled={busy} onClick={() => setConfirmation(null)}>Cancelar</button>
    </div>}
    {data.accounting.deposit.available && <div className="stack"><h3>Anticipo registrado</h3><p>{formatDeposit(data.accounting.deposit.amount!)}</p><p>Recibido: {formatDate(data.accounting.deposit.receivedAt)}</p><p>Registrado: {formatDate(data.accounting.deposit.recordedAt)}</p>{data.accounting.deposit.note && <p>{data.accounting.deposit.note}</p>}<p>Este registro no implica pago total ni define un saldo contractual.</p></div>}
    {!!data.reviews.length && <><h3>Historial de revisiones</h3><ol className="stack">{data.reviews.map(review => <li key={review.id}>
      <p>{review.status === "Pending" ? "Pendiente" : review.status === "Approved" ? "Aprobada" : "Rechazada"} · Enviada {formatDate(review.submittedAt)}</p>
      {review.decidedAt && <p>Decisión: {formatDate(review.decidedAt)} · {review.decidedBy?.name ?? review.decidedBy?.email ?? "Contabilidad"}</p>}
      {review.note && <p className="whitespace-pre-wrap break-words">{review.note}</p>}
      <ul>{review.documentIds.map(id => { const doc = data.documents.find(d => d.id === id)!; return <li key={id}><button className="text-link" disabled={busy} onClick={() => void download(doc)}>{doc.originalFileName}</button></li>; })}</ul>
    </li>)}</ol></>}
  </section>;
}
