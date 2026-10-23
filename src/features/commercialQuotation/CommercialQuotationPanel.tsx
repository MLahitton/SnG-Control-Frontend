"use client";

import { useEffect, useRef, useState } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import type { ProjectTask } from "@/features/tasks/types";
import { ApiError } from "@/lib/api/apiError";
import { saveDownload } from "@/lib/api/saveDownload";
import { commercialQuotationService } from "./service";
import { commercialQuotationError, formatCop } from "./validation";
import type { CommercialQuotationPreviewResponse, CommercialQuotationConfirmationResponse } from "./types";
import { CommercialQuotationPreview } from "./CommercialQuotationPreview";
import styles from "./CommercialQuotation.module.css";

export function CommercialQuotationPanel({ projectId, reviewStatus, disabled, onBusyChange, onTasksUpdated, onRefreshRelated }: {
  projectId: string; reviewStatus: "InProgress" | "Completed"; disabled: boolean;
  onBusyChange: (busy: boolean) => void; onTasksUpdated: (tasks: ProjectTask[]) => void;
  onRefreshRelated: (signal: AbortSignal) => Promise<void>;
}) {
  const api = useApiClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ file: File; data: CommercialQuotationPreviewResponse } | null>(null);
  const [confirmed, setConfirmed] = useState<CommercialQuotationConfirmationResponse | null>(null);
  const [prompt, setPrompt] = useState(false);
  const [busy, setBusy] = useState<"preview" | "confirm" | "download" | "refresh" | null>(null);
  const [error, setError] = useState<unknown>();
  const [validation, setValidation] = useState("");
  const [refreshError, setRefreshError] = useState<unknown>();
  const [conflicted, setConflicted] = useState(false);
  const operation = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => { operation.current?.abort(); onBusyChange(false); }, [onBusyChange]);
  const completed = reviewStatus === "Completed" || confirmed?.reviewTask.status === "Completed";
  const blocked = disabled || !!busy;
  function select(files: FileList | null) {
    if (locked.current || disabled || completed || conflicted) return;
    setFile(null); setPreview(null); setPrompt(false); setError(undefined); setValidation("");
    if (!files?.length) return;
    if (files.length !== 1 || !/\.xlsx$/i.test(files[0].name)) { setValidation("Selecciona un solo archivo .xlsx."); return; }
    setFile(files[0]);
  }
  async function refresh(signal: AbortSignal) {
    try { await onRefreshRelated(signal); }
    catch (failure) { if (!signal.aborted) setRefreshError(failure); }
  }
  async function run(action: NonNullable<typeof busy>) {
    if (locked.current || disabled) return;
    if ((action === "preview" || action === "confirm") && (completed || conflicted || !file)) return;
    if (action === "confirm" && (!prompt || !preview || preview.file !== file)) return;
    locked.current = true; setBusy(action); onBusyChange(true); setError(undefined); setRefreshError(undefined);
    const controller = new AbortController(); operation.current = controller;
    const { signal } = controller;
    try {
      if (action === "download") {
        await saveDownload(() => commercialQuotationService.download(api, projectId, completed, signal), completed ? "cotizacion-comercial.xlsx" : "cotizacion.xlsx", signal);
      } else if (action === "refresh") { await refresh(signal); }
      else if (action === "preview") {
        setPreview(null); setPrompt(false);
        const selected = file!;
        const data = await commercialQuotationService.preview(api, projectId, selected, signal);
        if (!signal.aborted) setPreview({ file: selected, data });
      } else {
        const response = await commercialQuotationService.confirm(api, projectId, preview!.file, signal);
        if (signal.aborted) return;
        setConfirmed(response); setPreview(null); setFile(null); setPrompt(false);
        if (fileInput.current) fileInput.current.value = "";
        onTasksUpdated([response.reviewTask, response.presentQuotationToClientTask]);
        await refresh(signal);
      }
    } catch (failure) {
      if (signal.aborted) return;
      setError(failure); setPrompt(false);
      if (failure instanceof ApiError && failure.code === "AlreadyConfirmed") {
        setConflicted(true); setPreview(null); setFile(null);
        if (fileInput.current) fileInput.current.value = "";
        await refresh(signal);
      }
    } finally { if (!signal.aborted) { locked.current = false; setBusy(null); onBusyChange(false); } }
  }
  return <section className={styles.panel} aria-labelledby="commercial-quotation-title">
    <h2 id="commercial-quotation-title">Revisión Comercial</h2>
    {!!busy && <p role="status">{busy === "preview" ? "Generando preview comercial…" : busy === "confirm" ? "Confirmando cotización comercial…" : busy === "download" ? "Descargando cotización…" : "Actualizando actividad…"}</p>}
    {validation && <p role="alert" className="error-message">{validation}</p>}
    {!!error && <div role="alert" className="error-message"><p>{commercialQuotationError(error)}</p>
      {error instanceof ApiError && error.code === "StructuralMismatch" && (["missingItems", "unexpectedItems"] as const).map((key) => error[key]?.length ? <div key={key}>
        <p>{key === "missingItems" ? "Filas faltantes" : "Filas inesperadas"}</p><ul>{error[key]!.map((item) => <li key={`${item.section}:${item.sourceRow}`}>{item.section === "Main" ? "Principales" : "Adicionales"}: fila {item.sourceRow}</li>)}</ul>
      </div> : null)}
    </div>}
    {!!refreshError && <div role="alert" className="error-message"><p>No se pudo actualizar toda la actividad del proyecto.</p><p>{commercialQuotationError(refreshError)}</p>
      <button className="button-secondary" disabled={blocked} onClick={() => void run("refresh")}>Actualizar actividad</button></div>}
    {completed ? <>
      {confirmed && <p role="status" className="success-notice">Cotización comercial confirmada.</p>}
      <h3>Revisión Comercial completada</h3>
      {confirmed && <dl className={styles.summary}><div><dt>Valor final</dt><dd>{formatCop(confirmed.projectTotal)}</dd></div><div><dt>Cambios técnicos</dt><dd>{confirmed.technicalDifferencesCount}</dd></div></dl>}
      <p>La propuesta está lista para ser presentada al cliente.</p>
      {confirmed?.commercialFileAvailable !== false && <div><button className="button-secondary" disabled={blocked} onClick={() => void run("download")}>Descargar cotización final</button></div>}
    </> : conflicted ? <p role="status">La revisión ya fue confirmada. Actualiza la actividad para consultar las tareas oficiales.</p> : <>
      <p>La cotización preparada por Presupuestos está lista para revisión.</p>
      <div><button className="button-secondary" disabled={blocked} onClick={() => void run("download")}>Descargar cotización</button></div>
      <p className={styles.muted}>Edita este archivo en Excel y vuelve a subirlo para revisar los valores comerciales.</p>
      <label className="field-label">Seleccionar XLSX comercial<input ref={fileInput} className="form-control" type="file" accept=".xlsx" disabled={blocked} onChange={(e) => select(e.target.files)} /></label>
      <div><button className="button-primary" disabled={blocked || !file} onClick={() => void run("preview")}>Generar preview</button></div>
      {preview && <><CommercialQuotationPreview preview={preview.data} />
        {prompt ? <div role="group" aria-label="Confirmar cotización comercial" className={styles.confirmation}>
          <h3>¿Confirmas esta cotización comercial?</h3><p>Al confirmar, la revisión Comercial finalizará y el proyecto pasará al asesor responsable para presentar la propuesta al cliente.</p>
          <div className={styles.buttons}><button className="button-primary" disabled={blocked} onClick={() => void run("confirm")}>Confirmar</button>
            <button className="button-secondary" disabled={blocked} onClick={() => setPrompt(false)}>Cancelar</button></div>
        </div> : <div><button className="button-primary" disabled={blocked} onClick={() => setPrompt(true)}>Confirmar cotización comercial</button></div>}
      </>}
    </>}
  </section>;
}
