"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { ApiError } from "@/lib/api/apiError";
import { saveDownload } from "@/lib/api/saveDownload";
import type { ApiStreamDownload } from "@/lib/api/types";
import { formatDate } from "@/lib/formatDate";
import { formatBytes } from "@/lib/formatBytes";
import { documentsService } from "./service";
import { documentErrorMessage, validateDocumentBatch } from "./validation";
import type { DocumentActor, ProjectDocument } from "./types";
import type { useProjectDocuments } from "./useProjectDocuments";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Icon } from "@/components/ui/Icon";
import styles from "./DocumentsPanel.module.css";

const actorName = (actor: DocumentActor) => [actor.name, actor.email].filter(Boolean).join(" · ") || "No disponible";

interface Props {
  projectId: string;
  resource: ReturnType<typeof useProjectDocuments>;
  hasPreparation: boolean;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onUpdated: (signal: AbortSignal) => Promise<void>;
}

export function DocumentsPanel({ projectId, resource, hasPreparation, disabled, onBusyChange, onUpdated }: Props) {
  const api = useApiClient();
  const { data } = resource;
  const [files, setFiles] = useState<File[]>([]);
  const [replacement, setReplacement] = useState<ProjectDocument | null>(null);
  const [removal, setRemoval] = useState<ProjectDocument | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const operation = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const selectFiles = useRef<HTMLInputElement>(null);
  const replaceFile = useRef<HTMLInputElement>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const current = data?.documents.filter((document) => document.isCurrent) ?? [];
  const historical = data?.documents.filter((document) => !document.isCurrent) ?? [];
  const operations = files.map((file) => ({ file, replacesDocumentId: replacement?.id ?? null }));
  const validation = files.length ? validateDocumentBatch(operations, current.length) : null;
  const blocked = !!busy || disabled;

  function choose(selected: File[], replace = replacement) {
    if (blocked || !data?.canModify) return;
    setFiles(selected); setReplacement(replace); setError(""); setNotice("");
  }

  function clearSelection() {
    setFiles([]); setReplacement(null);
    if (selectFiles.current) selectFiles.current.value = "";
    if (replaceFile.current) replaceFile.current.value = "";
  }

  async function run(label: string, action: (signal: AbortSignal) => Promise<void>) {
    if (locked.current || disabled) return;
    locked.current = true;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(label); onBusyChange(true); setError(""); setNotice("");
    try { await action(controller.signal); }
    catch (failure) {
      if (!controller.signal.aborted) {
        setError(documentErrorMessage(failure));
        if (failure instanceof ApiError && [403, 409].includes(failure.status)) resource.refresh();
      }
    } finally {
      if (!controller.signal.aborted) { locked.current = false; setBusy(""); onBusyChange(false); }
    }
  }

  async function afterMutation(signal: AbortSignal, message: string) {
    if (signal.aborted) return;
    setNotice(message); resource.refresh();
    if (data?.initialHandoff || hasPreparation) {
      try { await onUpdated(signal); }
      catch (failure) {
        if (!signal.aborted) setError(`Los documentos se guardaron, pero no se pudo actualizar el historial de notificaciones. ${documentErrorMessage(failure)}`);
      }
    }
  }

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data?.canModify || !files.length || validation || (replacement && files.length !== 1)) return;
    void run("Subiendo...", async (signal) => {
      await documentsService.uploadBatch(api, projectId, operations, signal);
      if (signal.aborted) return;
      clearSelection();
      await afterMutation(signal, "Documentos guardados.");
    });
  }

  function remove() {
    if (!data?.canRemove || !removal?.isCurrent) return;
    void run("Quitando documento...", async (signal) => {
      await documentsService.remove(api, projectId, removal.id, signal);
      if (signal.aborted) return;
      setRemoval(null);
      await afterMutation(signal, "Documento quitado del proyecto.");
    });
  }

  function download(name: string, load: (signal: AbortSignal) => Promise<ApiStreamDownload>) {
    void run("Descargando...", async (signal) => {
      if (await saveDownload(() => load(signal), name, signal)) setNotice("Descarga completada.");
    });
  }

  function documentRow(document: ProjectDocument) {
    const successor = data?.documents.find((item) => item.id === document.replacedByDocumentId);
    return <li key={document.id} className={styles.row}>
      <div className={styles.file}><Icon name="file" /><div>
      <h4 className="font-semibold break-words">{document.originalFileName}</h4>
      <div className="mt-1 space-y-1 metadata">
        <p>{formatBytes(document.sizeBytes)} · Cargado: {formatDate(document.uploadedAt)}</p>
        <p>Subido por: {actorName(document.uploadedBy)}</p>
        {document.inInitialHandoff && <StatusBadge>Incluido en el envío inicial</StatusBadge>}
        {!document.isCurrent && <><p>Reemplazado: {formatDate(document.replacedAt)}</p><p>Reemplazado por: {successor?.originalFileName ?? "No disponible"}</p></>}
      </div>
      </div></div>
      <div className={styles.actions}>
        <button className={styles.rowAction} disabled={blocked} onClick={() => download(document.originalFileName, (signal) => documentsService.download(api, projectId, document.id, signal))}>Descargar</button>
        {document.isCurrent && data?.canModify && <button className={styles.rowAction} disabled={blocked} onClick={() => {
          setReplacement(document); setFiles([]); setRemoval(null); setError(""); setNotice("");
          if (replaceFile.current) { replaceFile.current.value = ""; replaceFile.current.click(); }
        }}>Reemplazar</button>}
        {document.isCurrent && data?.canRemove && <button className={`${styles.rowAction} ${styles.removeAction}`} disabled={blocked} onClick={() => { setRemoval(document); setError(""); }}>Quitar</button>}
      </div>
    </li>;
  }

  return <section className={styles.documents} aria-labelledby="documents-title">
    <div className={styles.heading}><div><h2 id="documents-title" tabIndex={-1} className={styles.sectionTitle}>Documentos del proyecto</h2>{data && <p className={styles.sectionCount}>{current.length} vigente(s) · {historical.length} en historial</p>}</div>
      {current.length > 0 && <button className={styles.downloadAll} disabled={blocked} onClick={() => download("current.zip", (signal) => documentsService.downloadCurrentZip(api, projectId, signal))}>Descargar documentos actuales</button>}
    </div>
    {resource.loading && <p role="status" className="loading-notice">Cargando documentos…</p>}
    {!!resource.error && <div role="alert" className="error-message"><p>{documentErrorMessage(resource.error)}</p><button className="button-secondary mt-3" disabled={blocked} onClick={resource.refresh}>Volver a cargar documentos</button></div>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {notice && <p role="status" className="success-notice">{notice}</p>}
    {busy && <p role="status" className="loading-notice">{busy}</p>}
    {data && <>
      {data.canModify && <form onSubmit={upload} className="space-y-4">
        <div role="group" aria-label="Carga de documentos" className={styles.dropzone}
          onDragOver={(event) => { event.preventDefault(); }} onDrop={(event) => {
            event.preventDefault(); choose(Array.from(event.dataTransfer.files), null);
          }}>
          <div className={styles.dropzoneHeader}><div><p className="font-medium">Arrastra archivos aquí</p><p className={styles.limits}>Hasta 15 documentos vigentes · 100 MB por archivo · 300 MB por carga</p></div><button type="button" className="button-secondary" disabled={blocked} onClick={() => selectFiles.current?.click()}>Seleccionar archivos</button></div>
          <input ref={selectFiles} type="file" multiple hidden aria-label="Archivos del proyecto" disabled={blocked} onChange={(event) => choose(Array.from(event.target.files ?? []), null)} />
          <input ref={replaceFile} type="file" hidden aria-label="Archivo de reemplazo" disabled={blocked} onChange={(event) => choose(Array.from(event.target.files ?? []))} />
        {replacement && <div className={styles.confirmation}><p className="metadata">Reemplazando</p><p className="font-semibold break-all">{replacement.originalFileName}</p><p className="metadata mt-2">El documento anterior se conservará en el historial.</p></div>}
        {files.length > 0 && <div className={styles.selection}>
          {replacement && <p className="metadata">Nuevo archivo</p>}
          <ul>{files.map((file, index) => <li key={index}><span>{file.name}</span><span className="metadata">{formatBytes(file.size)}</span></li>)}</ul>
          <p className="metadata mt-2">{files.length} archivo(s) seleccionado(s) · Total: {formatBytes(files.reduce((sum, file) => sum + file.size, 0))}</p>
        </div>}
        </div>
        {validation && <p role="alert" className="error-message">{validation}</p>}
        <div className="flex flex-wrap gap-3">
          <button className="button-primary" disabled={blocked || !files.length || !!validation}>{replacement ? "Confirmar reemplazo" : "Subir documentos"}</button>
          {(files.length > 0 || replacement) && <button type="button" className="button-secondary" disabled={blocked} onClick={clearSelection}>Cancelar selección</button>}
        </div>
      </form>}
      {removal && data.canRemove && <div role="group" aria-label="Confirmar quitar documento" className={`${styles.confirmation} space-y-3`}>
        <p>¿Quitar del proyecto «{removal.originalFileName}»?</p>
        <div className="flex flex-wrap gap-3"><button className="button-danger" disabled={blocked} onClick={remove}>Confirmar quitar</button><button className="button-secondary" disabled={blocked} onClick={() => setRemoval(null)}>Cancelar</button></div>
      </div>}
      <div><h3 className={styles.groupTitle}>Documentos vigentes</h3>
        {current.length === 0 ? <p className={styles.empty}>No hay documentos vigentes.</p> : <ul>{current.map(documentRow)}</ul>}
      </div>
      <div className={styles.history}><h3 className="font-semibold">Historial documental</h3>
        {historical.length ? <ul>{historical.map(documentRow)}</ul> : <p className="metadata mt-2">No hay documentos reemplazados.</p>}
      </div>
      {data.initialHandoff ? <div className={styles.handoff}>
        <div className={styles.handoffHeader}><h3 className={styles.sectionTitle}>Envío inicial a Presupuestos</h3>
        <button className={styles.downloadAll} disabled={blocked} onClick={() => download("initial-handoff.zip", (signal) => documentsService.downloadInitialZip(api, projectId, signal))}>Descargar documentos del envío inicial</button></div>
        <div className={styles.audit}><p>Enviado: {formatDate(data.initialHandoff.sentAt)}</p><p>Por: {actorName(data.initialHandoff.sentBy)}</p>
        <p>{data.initialHandoff.documentIds.length} documento(s) en el envío inicial.</p>
        </div>
      </div> : hasPreparation && <p className="metadata">Este proyecto fue enviado antes de habilitar el historial documental inicial.</p>}
    </>}
  </section>;
}
