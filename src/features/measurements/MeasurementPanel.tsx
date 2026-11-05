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
import { StructureCard, useMeasurementImages } from "./StructureCard";
import { metresToMm, mmToMetres } from "./units";
import { technicalText } from "./technicalText";
import styles from "./MeasurementPanel.module.css";
import type { MeasurementAction, MeasurementCommand, MeasurementState, SketchDrawing } from "./contracts";

export function MeasurementPanel({ projectId, onRefresh }: { projectId: string; onRefresh: (signal: AbortSignal) => Promise<void> }) {
  const api = useApiClient(); const { activeRole, user } = useAuth();
  const path = `projects/${projectId}/measurements`;
  const load = useCallback((signal: AbortSignal) => api.get<MeasurementState>(path, { signal }), [api, path]);
  const resource = useResource(load); const data = resource.data;
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(); const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<MeasurementAction | null>(null);
  const [savedSketch, setSavedSketch] = useState<{ structureId: string; versionId: string; drawing: SketchDrawing }>();
  const [target, setTarget] = useState<{ action: string; structureId?: string }>();
  const [pending, setPending] = useState<MeasurementCommand | null>(null);
  const [description, setDescription] = useState(""); const [width, setWidth] = useState(""); const [height, setHeight] = useState("");
  const [uploads, setUploads] = useState<DocumentUpload[]>([]);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const drawings = useMeasurementImages(projectId, data?.structures ?? []);
  const dirtyChanged = useCallback((id: string, dirty: boolean) => { setDirtyIds(previous => { if (previous.has(id) === dirty) return previous; const next = new Set(previous); if (dirty) next.add(id); else next.delete(id); return next; }); }, []);
  useEffect(() => {
    if (!dirtyIds.size) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyIds.size]);
  const uploadKey = useRef<string | null>(null);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), [projectId, activeRole]);
  const writable = !!data?.canModify && activeRole === "Installation" && user?.subject === data.responsibleSubject;
  const disabled = busy || !!pending;
  async function run(action: "initialize" | "upload" | MeasurementCommand) {
    if (!writable || operation.current) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError(undefined); setNotice("");
    if (typeof action !== "string") setTarget(action); else setTarget(undefined);
    try {
      if (action === "initialize") await api.post<void>(`${path}/initialize`, {}, { signal: controller.signal });
      else if (action === "upload") {
        if (!uploads.length || uploads.length > 15 || uploads.some(u => !u.file.size || u.file.size > 100_000_000) || uploads.reduce((n, u) => n + u.file.size, 0) > 300_000_000) throw new ApiError(400);
        uploadKey.current ??= crypto.randomUUID();
        await api.upload<unknown>(`${path}/documents/batch`, documentBatch(uploads), { signal: controller.signal, query: new URLSearchParams({ requestKey: uploadKey.current }) });
        if (!controller.signal.aborted) { setUploads([]); uploadKey.current = null; }
      } else { setPending(action); await api.post<void>(`${path}/commands`, action, { signal: controller.signal }); }
      if (controller.signal.aborted) return;
      const refreshed = await load(controller.signal);
      if (controller.signal.aborted) return;
      resource.update(refreshed);
      if (typeof action !== "string" && action.action === "RecordSketch" && action.sketch) {
        const versionId = refreshed.structures.find(s => s.id === action.structureId)?.sketchVersionId;
        if (versionId) setSavedSketch({ structureId: action.structureId!, versionId, drawing: action.sketch.drawing });
      }
      setPending(null); setConfirmation(null);
      if (typeof action !== "string" && action.action === "Retire") for (const prefix of ["", "technical:", "sketch:", "comparison:", "modification:"]) dirtyChanged(`${prefix}${action.structureId}`, false);
      if (controller.signal.aborted) return;
      setNotice("Operación guardada."); await onRefresh(controller.signal);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure);
      if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500) {
        setPending(null); setConfirmation(null);
        try { resource.update(await load(controller.signal)); } catch { /* Keep mounted drafts and the original error if reread fails. */ }
      }
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
  async function downloadReport() {
    if (operation.current || !data?.submissionId) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError(undefined);
    try { await saveDownload(() => api.downloadStream(`${path}/submissions/${data.submissionId}/report`, { signal: controller.signal }), "Radicacion de medidas.pdf", controller.signal, { serverFilename: true }); }
    catch (failure) { if (!controller.signal.aborted) setError(failure); }
    finally { if (!controller.signal.aborted) { operation.current = null; setBusy(false); } }
  }
  if (!data) return <><p role="status">Consultando toma de medidas…</p><ErrorNotice error={resource.error} retry={resource.refresh} /></>;
  const current = data.documents.filter(d => d.isCurrent);

  const labels: Record<string, string> = { Initialize: "Checklist iniciado", Add: "Estructura agregada", Retire: "Estructura retirada", Reinstate: "Estructura reintegrada", Measure: "Marcada como medida", Unmeasure: "Medición desmarcada", Submit: "Medidas radicadas", RecordTechnical: "Ficha técnica guardada", RecordSketch: "Croquis guardado", RecordActual: "Medidas de obra guardadas", ResolveComparison: "Comparación revisada", RecordModification: "Modificación registrada" };
  const messages: Record<string, string> = { MeasurementReportUnavailable: "No se pudo generar el expediente PDF. La radicación no se completó; revisa los croquis y reintenta.", MeasurementReportIntegrity: "El reporte no superó la verificación de integridad. Contacta al administrador.", InvalidMeasurementAssessment: "Revisa el motivo, la descripción y el croquis asociado. Guarda primero las medidas y el tipo de medida.", MeasurementRevisionConflict: "El checklist cambió en otra sesión. Revisa el estado actualizado antes de continuar.", MeasurementsLocked: "La toma de medidas ya no admite cambios.", MeasurementDocumentsChanged: "Los documentos cambiaron. Revisa los archivos antes de radicar.", MeasurementsIncomplete: "Completa las medidas y detalles técnicos antes de marcar Medido. Para radicar, todas las estructuras vigentes deben estar medidas.", InvalidMeasurementTechnical: "Revisa los campos técnicos y sus unidades; la altura de manija no puede superar el alto real.", InvalidMeasurementSketch: "El croquis excede los límites o su formato no es válido.", MeasurementSketchRateLimit: "Espera dos segundos antes de guardar otra versión del croquis.", MeasurementRequestConflict: "El reintento no coincide con la operación original." };
  return <section className="panel stack" aria-labelledby="measurements-title">
    <h2 id="measurements-title" className="section-title">Toma de medidas</h2>
    <p>Responsable: {user?.subject === data.responsibleSubject ? user.name ?? "Cuenta de Instalación asignada" : "Cuenta de Instalación asignada"} · {data.taskStatus === "Completed" ? "Completada" : data.taskStatus === "Pending" ? "Pendiente" : "En curso"}</p>
    <p>Registra ancho, alto y sistema en obra y guarda cada tarjeta. El check Medido y los documentos completan la toma de medidas.</p>
    <ErrorNotice error={resource.error} />
    {error instanceof ApiError && error.code && messages[error.code] ? <p role="alert">{messages[error.code]}</p> : <ErrorNotice error={error} />}
    {busy && <p role="status">Guardando…</p>}{notice && <p role="status">{notice}</p>}
    {pending && !busy && <button className="button-secondary" onClick={() => void run(pending)}>Reintentar operación pendiente</button>}
    {!data.checklistId ? <>{writable && <button className="button-primary" disabled={busy} onClick={() => void run("initialize")}>Iniciar toma de medidas</button>}<p>El checklist aún no ha sido iniciado.</p></> : <>
      <p>Iniciales: {data.summary.initial} · Vigentes: {data.summary.active} · Medidas: {data.summary.measured} · Pendientes: {data.summary.pending} · Agregadas: {data.summary.added} · Retiradas: {data.summary.retired}</p>
      <label>Avance: {data.summary.progress}% <progress aria-label="Avance de medición" max={100} value={data.summary.progress} /></label>
      <div className={styles.cards}>{data.structures.filter(s => !s.retiredAt).map(s => <StructureCard
        key={s.id} structure={s} projectId={projectId} writable={writable} disabled={disabled}
        saving={busy && pending?.action === "RecordActual" && pending.structureId === s.id}
        image={s.imageCatalogItemId ? drawings.images[s.imageCatalogItemId] : undefined} retryImage={drawings.retry}
        savedSketch={savedSketch?.structureId === s.id ? savedSketch : undefined}
        sectionAction={target?.structureId === s.id ? target.action : undefined}
        sectionFeedback={target?.structureId === s.id && <>{busy ? <p role="status">Guardando esta sección…</p> : notice ? <p role="status">{labels[target.action] ?? "Sección guardada"}.</p> : error instanceof ApiError && error.code && messages[error.code] ? <p role="alert">{messages[error.code]}</p> : <ErrorNotice error={error} />}</>}
        sketchFeedback={target?.structureId === s.id && target.action === "RecordSketch" && <>{error instanceof ApiError && error.code && messages[error.code] ? <p role="alert">{messages[error.code]}</p> : <ErrorNotice error={error} />}{pending && error && <button type="button" disabled={busy} onClick={() => void run(pending)}>Reintentar guardado de croquis</button>}</>}
        onCommand={command} onRetire={() => setConfirmation({ action: "Retire", structureId: s.id })} onDirty={dirtyChanged}
      />)}</div>
      {dirtyIds.size > 0 && <p role="status">Guarda las tarjetas editadas antes de radicar medidas.</p>}
      {writable && <form className="stack" onSubmit={e => { e.preventDefault(); if (description.trim() && Number(width) > 0 && Number(height) > 0) command({ action: "Add", description: description.trim(), width: mmToMetres(Number(width)), height: mmToMetres(Number(height)) }); }}>
        <h3>Agregar estructura</h3>
        <label>Sistema de la nueva estructura<input className="form-control" required maxLength={2000} value={description} disabled={disabled} onChange={e => setDescription(e.target.value)} /></label>
        <label>Ancho (mm)<input className="form-control" required type="number" min="0" step="any" value={width} disabled={disabled} onChange={e => setWidth(e.target.value)} /></label>
        <label>Alto (mm)<input className="form-control" required type="number" min="0" step="any" value={height} disabled={disabled} onChange={e => setHeight(e.target.value)} /></label>
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
      {writable && <button className="button-primary" disabled={disabled || dirtyIds.size > 0 || data.summary.active === 0 || data.summary.pending > 0 || !current.length} onClick={() => setConfirmation({ action: "Submit", documentIds: current.map(d => d.id) })}>Radicar medidas</button>}
      {data.submissionId && <p role="status">Medidas radicadas · {formatDate(data.submittedAt!)} · {data.submissionId}. Checklist y documentos congelados para su consulta por Ingeniería.</p>}
      {data.snapshot?.report && <button className="button-secondary" disabled={busy} onClick={() => void downloadReport()}>Descargar reporte PDF de Instalación</button>}
    </>}
    {confirmation && <MeasurementConfirmation hasDrafts={confirmation.action === "Retire" && ["", "technical:", "sketch:", "comparison:", "modification:"].some(prefix => dirtyIds.has(`${prefix}${confirmation.structureId}`))} action={confirmation} data={data} onCancel={() => setConfirmation(null)} onConfirm={() => { setConfirmation(null); command(confirmation); }} />}
    {data.structures.some(s => s.retiredAt) && <details><summary>Estructuras retiradas</summary><ul>{data.structures.filter(s => s.retiredAt).map(s => <li key={s.id}>
      {s.itemId ? `Ítem ${s.itemNumber ?? ""} · Unidad ${s.unitOrdinal}/${s.unitCount}` : "Agregada en obra"} · {s.id} · {s.description} {s.location} · Retirada {formatDate(s.retiredAt!)} · {data.history.filter(e => e.structureId === s.id && e.action === "Retire").at(-1)?.actor.name ?? "Cuenta de Instalación"}
      {writable && <button className="button-secondary" disabled={disabled} onClick={() => setConfirmation({ action: "Reinstate", structureId: s.id })}>Reintegrar {s.id.slice(0, 8)}</button>}
    </li>)}</ul></details>}
    <details><summary>Historial de cambios</summary><ol>{data.history.map(event => <li key={event.id}>{labels[event.action] ?? event.action} {event.structureId?.slice(0, 8)} · {event.actor.name ?? event.actor.email ?? "Cuenta de Instalación"} · {formatDate(event.at)}{event.assessment && <p>Revisión: {event.assessment.comparisonAfter?.reason ?? "Sin cambio"} · Modificación: {event.assessment.modificationAfter?.versionId ?? "Sin modificación"} · {event.assessment.modificationAfter?.reason} · {event.assessment.modificationAfter?.description}</p>}{event.technical && <p>Ficha anterior: {technicalText(event.technical.before)} · Ficha guardada: {technicalText(event.technical.after)}</p>}{event.sketch && <p>Versión anterior: {event.sketch.before ?? "Sin croquis"} · Versión guardada: {event.sketch.after}</p>}{event.details && <p>Anterior: {event.details.before.width == null ? "—" : metresToMm(event.details.before.width)} × {event.details.before.height == null ? "—" : metresToMm(event.details.before.height)} mm · {event.details.before.systemText ?? "Sin registrar"}. Guardado: {event.details.after.width == null ? "—" : metresToMm(event.details.after.width)} × {event.details.after.height == null ? "—" : metresToMm(event.details.after.height)} mm · {event.details.after.systemText} · Tipo: {event.details.after.measurementType ?? "Sin clasificar"} · Ubicación: {event.details.before.actualLocation ?? "Sin registrar"} → {event.details.after.actualLocation ?? "Sin registrar"} · Observaciones anteriores: {event.details.before.installationObservations ?? "Sin contenido"} · Observaciones guardadas: {event.details.after.installationObservations ?? "Sin contenido"}</p>}</li>)}</ol></details>
  </section>;
}

function MeasurementConfirmation({ action, data, hasDrafts, onCancel, onConfirm }: { hasDrafts: boolean; action: MeasurementAction; data: MeasurementState; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null); const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current!; const previous = document.activeElement;
    element.showModal(); cancel.current?.focus();
    return () => { element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  const structure = action.action === "Retire" || action.action === "Reinstate" ? data.structures.find(s => s.id === action.structureId) : null;
  return <dialog ref={dialog} aria-labelledby="measurement-confirmation-title" className={`panel stack ${styles.confirmation}`} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h3 id="measurement-confirmation-title">{action.action === "Reinstate" ? "Confirmar reintegración" : action.action === "Retire" ? "Confirmar retiro" : "Confirmar radicación"}</h3>
    {structure && <p>{structure.itemId ? `Ítem ${structure.itemNumber ?? ""} · Unidad ${structure.unitOrdinal}/${structure.unitCount}` : "Agregada en obra"}<br />{structure.id}<br />{structure.description} {structure.location}</p>}
    <p>{action.action === "Reinstate" ? "La estructura recuperará sus datos y posición. Deberás confirmar de nuevo Medido. ¿Confirmas la reintegración?" : action.action === "Retire" ? "La estructura se excluirá del total vigente y conservará su historial. ¿Confirmas el retiro?" : "Se congelarán el checklist y los documentos vigentes y se completará la tarea. ¿Confirmas la radicación?"}</p>
    {hasDrafts && <p role="alert">Retirar esta estructura descartará sus borradores sin guardar. Cancela para conservarlos y guardarlos primero.</p>}
    <button type="button" className="button-primary" onClick={onConfirm}>Confirmar</button>
    <button ref={cancel} type="button" className="button-secondary" onClick={onCancel}>Cancelar</button>
  </dialog>;
}
