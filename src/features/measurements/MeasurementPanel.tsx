"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { documentBatch, documentsService } from "@/features/documents/service";
import type { DocumentUpload, ProjectDocument } from "@/features/documents/types";
import { useResource } from "@/lib/api/useResource";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { ApiError } from "@/lib/api/apiError";
import { saveDownload } from "@/lib/api/saveDownload";
import { formatDate } from "@/lib/formatDate";
import type { MeasurementAction, MeasurementCommand, MeasurementState } from "./contracts";

export function MeasurementPanel({ projectId, onRefresh }: { projectId: string; onRefresh: (signal: AbortSignal) => Promise<void> }) {
  const api = useApiClient(); const { activeRole, user } = useAuth();
  const path = `projects/${projectId}/measurements`;
  const load = useCallback((signal: AbortSignal) => api.get<MeasurementState>(path, { signal }), [api, path]);
  const resource = useResource(load); const data = resource.data;
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(); const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<MeasurementAction | null>(null);
  const [pending, setPending] = useState<MeasurementCommand | null>(null);
  const [description, setDescription] = useState(""); const [width, setWidth] = useState(""); const [height, setHeight] = useState(""); const [note, setNote] = useState("");
  const [uploads, setUploads] = useState<DocumentUpload[]>([]);
  const uploadKey = useRef<string | null>(null);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), [projectId, activeRole]);
  const writable = !!data?.canModify && activeRole === "Installation" && user?.subject === data.responsibleSubject;
  const disabled = busy || !!pending;
  async function run(action: "initialize" | "upload" | MeasurementCommand) {
    if (!writable || operation.current) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError(undefined); setNotice("");
    try {
      if (action === "initialize") await api.post<void>(`${path}/initialize`, {}, { signal: controller.signal });
      else if (action === "upload") {
        if (!uploads.length || uploads.length > 15 || uploads.some(u => !u.file.size || u.file.size > 100_000_000) || uploads.reduce((n, u) => n + u.file.size, 0) > 300_000_000) throw new ApiError(400);
        uploadKey.current ??= crypto.randomUUID();
        await api.upload<unknown>(`${path}/documents/batch`, documentBatch(uploads), { signal: controller.signal, query: new URLSearchParams({ requestKey: uploadKey.current }) });
        if (!controller.signal.aborted) { setUploads([]); uploadKey.current = null; }
      } else { setPending(action); await api.post<void>(`${path}/commands`, action, { signal: controller.signal }); }
      if (controller.signal.aborted) return;
      setPending(null); setConfirmation(null);
      resource.update(await load(controller.signal));
      if (controller.signal.aborted) return;
      setNotice("Operación guardada."); await onRefresh(controller.signal);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure);
      if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500) { setPending(null); setConfirmation(null); resource.refresh(); }
      // Unknown transport outcome: retry the exact command with the same key and revision.
    } finally { if (!controller.signal.aborted) { operation.current = null; setBusy(false); } }
  }
  function command(action: MeasurementAction) {
    if (!data || disabled) return;
    void run({ ...action, requestKey: crypto.randomUUID(), expectedRevision: data.revision });
  }
  async function download(doc: ProjectDocument) {
    if (operation.current) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true);
    try { await saveDownload(() => documentsService.download(api, projectId, doc.id, controller.signal), doc.originalFileName, controller.signal); }
    catch (failure) { if (!controller.signal.aborted) setError(failure); }
    finally { if (!controller.signal.aborted) { operation.current = null; setBusy(false); } }
  }
  if (!data) return <><p role="status">Consultando toma de medidas…</p><ErrorNotice error={resource.error} retry={resource.refresh} /></>;
  const current = data.documents.filter(d => d.isCurrent);
  const groups = Map.groupBy(data.structures, s => s.itemId ?? "added");
  const labels: Record<string, string> = { Initialize: "Checklist iniciado", Add: "Estructura agregada", Retire: "Estructura retirada", Measure: "Marcada como medida", Unmeasure: "Medición desmarcada", Submit: "Medidas radicadas" };
  const messages: Record<string, string> = { MeasurementRevisionConflict: "El checklist cambió en otra sesión. Revisa el estado actualizado antes de continuar.", MeasurementsLocked: "La toma de medidas ya no admite cambios.", MeasurementDocumentsChanged: "Los documentos cambiaron. Revisa los archivos antes de radicar.", MeasurementsIncomplete: "Debe existir al menos una estructura vigente y todas deben estar medidas.", MeasurementRequestConflict: "El reintento no coincide con la operación original." };
  return <section className="panel stack" aria-labelledby="measurements-title">
    <h2 id="measurements-title" className="section-title">Toma de medidas</h2>
    <p>Responsable: {user?.subject === data.responsibleSubject ? user.name ?? "Cuenta de Instalación asignada" : "Cuenta de Instalación asignada"} · {data.taskStatus === "Completed" ? "Completada" : data.taskStatus === "Pending" ? "Pendiente" : "En curso"}</p>
    <p>El checklist indica qué espacios se midieron. Las medidas reales oficiales se encuentran en los documentos radicados.</p>
    <ErrorNotice error={resource.error} />
    {error instanceof ApiError && error.code && messages[error.code] ? <p role="alert">{messages[error.code]}</p> : <ErrorNotice error={error} />}
    {busy && <p role="status">Guardando…</p>}{notice && <p role="status">{notice}</p>}
    {pending && !busy && <button className="button-secondary" onClick={() => void run(pending)}>Reintentar operación pendiente</button>}
    {!data.checklistId ? <>{writable && <button className="button-primary" disabled={busy} onClick={() => void run("initialize")}>Iniciar toma de medidas</button>}<p>El checklist aún no ha sido iniciado.</p></> : <>
      <p>Iniciales: {data.summary.initial} · Vigentes: {data.summary.active} · Medidas: {data.summary.measured} · Pendientes: {data.summary.pending} · Agregadas: {data.summary.added} · Retiradas: {data.summary.retired}</p>
      <label>Avance: {data.summary.progress}% <progress aria-label="Avance de medición" max={100} value={data.summary.progress} /></label>
      {Array.from(groups, ([key, structures]) => <fieldset key={key} className="stack"><legend>{key === "added" ? "Agregadas en obra" : `Ítem ${structures[0].itemNumber ?? ""}`}</legend>
        {structures.map(s => <div key={s.id} className="panel stack">
          <strong>{s.itemId ? `${s.unitOrdinal}/${s.unitCount}` : "Agregada en obra"} · {s.id.slice(0, 8)}</strong>
          {s.description && <p>{s.description}</p>}{s.location && <p>{s.location}</p>}
          <p>{s.itemId ? "Dimensiones cotizadas (consulta)" : "Dimensiones registradas en obra"}: {s.width} × {s.height} m</p>{s.note && <p>{s.note}</p>}
          {s.retiredAt ? <p>Retirada · {formatDate(s.retiredAt)}</p> : <>
            <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", minHeight: 44 }}><input style={{ width: 24, height: 24 }} type="checkbox" aria-label={`Medido ${s.id}`} checked={!!s.measuredAt} disabled={!writable || disabled} onChange={e => command({ action: "Measure", structureId: s.id, measured: e.target.checked })} />Medido</label>
            {s.measuredAt && <p className="metadata">{formatDate(s.measuredAt)}</p>}
            {writable && <button className="button-secondary" disabled={disabled} onClick={() => setConfirmation({ action: "Retire", structureId: s.id })}>Retirar estructura {s.id.slice(0, 8)}</button>}
          </>}
        </div>)}
      </fieldset>)}
      {writable && <form className="stack" onSubmit={e => { e.preventDefault(); if (description.trim() && Number(width) > 0 && Number(height) > 0) command({ action: "Add", description: description.trim(), width: Number(width), height: Number(height), note: note.trim() || null }); }}>
        <h3>Agregar estructura</h3>
        <label>Tipo o descripción<input className="form-control" required maxLength={2000} value={description} disabled={disabled} onChange={e => setDescription(e.target.value)} /></label>
        <label>Ancho (m)<input className="form-control" required type="number" min="0" step="any" value={width} disabled={disabled} onChange={e => setWidth(e.target.value)} /></label>
        <label>Alto (m)<input className="form-control" required type="number" min="0" step="any" value={height} disabled={disabled} onChange={e => setHeight(e.target.value)} /></label>
        <label>Observación<textarea className="form-control" maxLength={4000} value={note} disabled={disabled} onChange={e => setNote(e.target.value)} /></label>
        <button className="button-secondary" disabled={disabled}>Agregar estructura</button>
      </form>}
      <h3>Documentos de medidas</h3>
      {writable && <div className="stack">
        <label>Adjuntar documentos<input type="file" multiple disabled={disabled} onChange={e => { uploadKey.current = null; setUploads(Array.from(e.target.files ?? []).map(file => ({ file, replacesDocumentId: null }))); e.target.value = ""; }} /></label>
        <p className="metadata">Hasta 15 archivos vigentes, 100 MB por archivo y 300 MB por carga.</p>
        {uploads.map((u, index) => <label key={index}>{u.file.name}<select disabled={disabled} value={u.replacesDocumentId ?? ""} onChange={e => { uploadKey.current = null; setUploads(previous => previous.map((item, i) => i === index ? { ...item, replacesDocumentId: e.target.value || null } : item)); }}><option value="">Agregar documento</option>{current.map(d => <option key={d.id} value={d.id}>Sustituir {d.originalFileName}</option>)}</select></label>)}
        <button className="button-secondary" disabled={disabled || !uploads.length} onClick={() => void run("upload")}>Cargar documentos de medidas</button>
      </div>}
      <ul>{data.documents.map(d => <li key={d.id}><button className="text-link" disabled={busy} onClick={() => void download(d)}>{d.originalFileName}</button> · {d.contentType ?? "Archivo"} · {d.sizeBytes} bytes · {d.isCurrent ? "Vigente" : "Sustituido"}</li>)}</ul>
      {writable && <button className="button-primary" disabled={disabled || data.summary.active === 0 || data.summary.pending > 0 || !current.length} onClick={() => setConfirmation({ action: "Submit", documentIds: current.map(d => d.id) })}>Radicar medidas</button>}
      {data.submissionId && <p role="status">Medidas radicadas · {formatDate(data.submittedAt!)} · {data.submissionId}. Checklist y documentos congelados para su consulta por Ingeniería.</p>}
    </>}
    {confirmation && <div role="dialog" aria-modal="true" aria-label={confirmation.action === "Retire" ? "Confirmar retiro" : "Confirmar radicación"} className="panel stack">
      <p>{confirmation.action === "Retire" ? "La estructura se excluirá del total vigente y conservará su historial. ¿Confirmas el retiro?" : "Se congelarán el checklist y los documentos vigentes y se completará la tarea. ¿Confirmas la radicación?"}</p>
      <button className="button-primary" disabled={disabled} onClick={() => command(confirmation)}>Confirmar</button><button className="button-secondary" disabled={busy} onClick={() => setConfirmation(null)}>Cancelar</button>
    </div>}
    <details><summary>Historial de cambios</summary><ol>{data.history.map(event => <li key={event.id}>{labels[event.action] ?? event.action} {event.structureId?.slice(0, 8)} · {event.actor.name ?? event.actor.email ?? "Cuenta de Instalación"} · {formatDate(event.at)}</li>)}</ol></details>
  </section>;
}
