"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { clientsService } from "@/features/clients/service";
import { notificationsService } from "@/features/notifications/service";
import { NotificationList } from "@/features/notifications/NotificationList";
import { tasksService } from "@/features/tasks/service";
import { TaskList } from "@/features/tasks/TaskList";
import { ApiError } from "@/lib/api/apiError";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { useResource } from "@/lib/api/useResource";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectStatusStrip } from "./ProjectStatusStrip";
import styles from "./ProjectDetail.module.css";
import { projectsService } from "./service";
import { DocumentsPanel } from "@/features/documents/DocumentsPanel";
import { useProjectDocuments } from "@/features/documents/useProjectDocuments";
import { documentErrorMessage } from "@/features/documents/validation";

export function ProjectDetailPage({ id }: { id: string }) {
  const { user } = useAuth();
  // Remount every permission-dependent resource and action on identity changes,
  // even when AuthProvider keeps the same API client and the URL stays unchanged.
  return user ? <ProjectDetailContent key={`${id}:${user.subject}`} id={id} /> : <p role="status">Validando sesión…</p>;
}

function ProjectDetailContent({ id }: { id: string }) {
  const api = useApiClient();
  const { user } = useAuth();
  const load = useCallback(async (signal: AbortSignal) => {
    const [project, tasks, notifications] = await Promise.all([
      projectsService.get(api, id, signal), tasksService.forProject(api, id, signal), notificationsService.forProject(api, id, signal),
    ]);
    const client = await clientsService.get(api, project.clientId, signal);
    return { project, client, tasks, notifications };
  }, [api, id]);
  const resource = useResource(load);
  const documents = useProjectDocuments(api, id);
  const [documentBusy, setDocumentBusy] = useState(false);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const { data } = resource;
  const [confirmSend, setConfirmSend] = useState(false);
  const [sgCode, setSgCode] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState<unknown>();
  const [refreshError, setRefreshError] = useState<unknown>();
  const [validation, setValidation] = useState("");
  const [conflict, setConflict] = useState("");
  const [notice, setNotice] = useState("");
  const preparation = data?.tasks.find((task) => task.type === "PrepareQuotation");
  // Presentation only; the backend's BudgetsAssignee policy authorizes the PUT.
  const isPreparationAssignee = !!user && user.subject === preparation?.assignedToGoogleSubject;
  const pendingSg = preparation?.status === "Pending" && data?.project.sgCode === null;
  const canAssign = isPreparationAssignee && pendingSg;
  const canCorrect = isPreparationAssignee && preparation?.status === "InProgress" && !!data?.project.sgCode;

  async function mutate(action: "send" | "sg") {
    if (locked.current || documentBusy || !data) return;
    if (action === "send" && (!confirmSend || !documents.data?.canSendToBudgets)) return;
    const normalizedSg = sgCode.trim().toUpperCase();
    if (action === "sg") {
      if (!canAssign && !canCorrect) return;
      if (!/^SG[0-9]+$/.test(normalizedSg)) {
        setValidation("Usa SG seguido de dígitos del 0 al 9, sin espacios ni guiones. Ejemplo: SG001.");
        return;
      }
    }
    locked.current = true; setBusy(true); setError(undefined); setRefreshError(undefined); setValidation(""); setConflict(""); setNotice("");
    const controller = new AbortController();
    operation.current = controller;
    const signal = controller.signal;
    try {
      if (action === "send") {
        const task = await projectsService.sendToBudgets(api, id, signal);
        if (signal.aborted) return;
        const updated = { ...data, tasks: [...data.tasks, task] };
        resource.update(updated);
        documents.refresh();
        setConfirmSend(false); setNotice("Proyecto enviado a Presupuestos.");
        try {
          const [tasks, notifications] = await Promise.all([tasksService.forProject(api, id, signal), notificationsService.forProject(api, id, signal)]);
          if (!signal.aborted) resource.update({ ...updated, tasks, notifications });
        } catch (failure) { if (!signal.aborted) setRefreshError(failure); }
      } else {
        const response = await projectsService.assignSg(api, id, normalizedSg, signal);
        if (signal.aborted) return;
        const updated = {
          ...data, project: response.project,
          tasks: data.tasks.map((task) => task.id === response.prepareQuotationTask.id ? response.prepareQuotationTask : task),
        };
        resource.update(updated);
        setSgCode(""); setNotice(canCorrect ? "SG corregido." : "SG asignado.");
        try {
          const notifications = await notificationsService.forProject(api, id, signal);
          if (!signal.aborted) resource.update({ ...updated, notifications });
        } catch (failure) { if (!signal.aborted) setRefreshError(failure); }
      }
    } catch (failure) {
      if (signal.aborted) return;
      setError(failure);
      if (failure instanceof ApiError && failure.status === 409) {
        if (action === "sg") setConflict("No fue posible asignar el SG. El código puede estar en uso o el proyecto ya no permite esta operación.");
        if (action === "send") {
          documents.refresh();
          if (failure.code === "DocumentsRequired") setConflict(documentErrorMessage(failure));
        }
        setConfirmSend(false); resource.refresh();
      }
    } finally { if (!signal.aborted) { locked.current = false; setBusy(false); } }
  }
  function submitSg(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void mutate("sg"); }
  async function refreshDocumentNotifications(signal: AbortSignal) {
    const notifications = await notificationsService.forProject(api, id, signal);
    if (data && !signal.aborted) resource.update({ ...data, notifications });
  }

  return <div className={styles.projectSurface}>
    <Link className={styles.backLink} href="/projects">Volver a proyectos</Link>
    <div className={styles.feedback}>
    {!data && <h1 className="page-title">Detalle del proyecto</h1>}
    {resource.loading && <p role="status" className="loading-notice">Cargando proyecto…</p>}
    {resource.error instanceof ApiError && resource.error.status === 404
      ? <p role="alert" className="error-message">No se encontró el proyecto o uno de sus recursos asociados.</p>
      : <ErrorNotice error={resource.error} retry={resource.refresh} />}
    {conflict ? <div role="alert" className="error-message"><p>{conflict}</p>{error instanceof ApiError && error.code && <p>Código: {error.code}</p>}</div> : <ErrorNotice error={error} />}
    {notice && <p role="status" className="success-notice">{notice}</p>}
    {!!refreshError && <div className="space-y-2"><p>La operación se guardó, pero no se pudo actualizar toda la información relacionada.</p><ErrorNotice error={refreshError} retry={() => { setRefreshError(undefined); resource.refresh(); }} /></div>}
    </div>
    {data && <>
      <ProjectHeader project={data.project} clientName={data.client.name} />
      <ProjectStatusStrip tasks={data.tasks} />
      {pendingSg && !isPreparationAssignee && <p role="status" className={styles.waiting}>Pendiente de asignación de SG por Presupuestos.</p>}
      <div className={styles.workspace}>
      <div className={styles.documents}><DocumentsPanel projectId={id} resource={documents} hasPreparation={!!preparation} disabled={busy}
        onBusyChange={setDocumentBusy} onUpdated={refreshDocumentNotifications} /></div>
      <div className={styles.actions}>
      {documents.data?.canModify && !documents.data.documents.some((document) => document.isCurrent) && <section className={styles.actionArea} aria-labelledby="upload-action-title"><p className={styles.actionLabel}>Acción actual</p><h2 id="upload-action-title" className={styles.actionTitle}>Cargar documentación</h2><p role="status" className={styles.actionText}>Debes cargar al menos un documento del proyecto antes de enviarlo a Presupuestos.</p><a className="text-link" href="#documents-title">Ir a documentos</a></section>}
      {documents.data?.canSendToBudgets && <section className={styles.actionArea} aria-labelledby="send-title">
        <p className={styles.actionLabel}>Siguiente acción</p><h2 id="send-title" className={styles.actionTitle}>Enviar a Presupuestos</h2>
        <p className={styles.actionText}>El plazo de Presupuestos comenzará cuando se asigne el SG.</p>
        {confirmSend ? <div role="group" aria-label="Confirmar envío a Presupuestos" className="space-y-3">
          <p>¿Confirmas el envío de este proyecto a Presupuestos?</p>
          <div className="flex flex-wrap gap-3"><button className="button-primary" disabled={busy || documentBusy} onClick={() => void mutate("send")}>{busy ? "Enviando…" : "Confirmar envío"}</button><button className="button-secondary" disabled={busy || documentBusy} onClick={() => setConfirmSend(false)}>Cancelar</button></div>
        </div> : <button className="button-primary" disabled={busy || documentBusy} onClick={() => setConfirmSend(true)}>Enviar a Presupuestos</button>}
      </section>}
      {(canAssign || canCorrect) && <section className={styles.actionArea} aria-labelledby="sg-title">
        <p className={styles.actionLabel}>Acción actual</p>
        <h2 id="sg-title" className={styles.actionTitle}>{canCorrect ? "Corregir SG" : "Asignar SG"}</h2>
        <p className={styles.actionText}>{canCorrect ? "La corrección conserva el inicio y vencimiento de la tarea." : "La primera asignación inicia el plazo de preparación de la cotización."}</p>
        <form onSubmit={submitSg} className="stack">
          <label className="field-label">Código SG<input className="form-control" required value={sgCode} disabled={busy} aria-invalid={!!validation} aria-describedby={validation ? "sg-error" : undefined} onChange={(e) => { setSgCode(e.target.value); setValidation(""); }} placeholder={data.project.sgCode ?? "SG001"} /></label>
          <button className="button-primary" disabled={busy || documentBusy || !sgCode.trim()}>{busy ? "Guardando…" : canCorrect ? "Guardar corrección" : "Asignar SG"}</button>
        </form>
        {validation && <p id="sg-error" role="alert" className="error-message mt-3">{validation}</p>}
      </section>}
      </div>
      <section aria-labelledby="project-notifications-title" className={styles.activity}><h2 id="project-notifications-title" className={styles.sectionLabel}>Actividad del proyecto</h2><NotificationList notifications={data.notifications} variant="activity" /></section>
      <section aria-labelledby="project-tasks-title" className={styles.tasks}><h2 id="project-tasks-title" className={styles.sectionLabel}>Tareas del proyecto</h2><TaskList tasks={data.tasks} compact /></section>
      </div>
      <p className={styles.footer}>Fechas y horas de Colombia (America/Bogota).</p>
    </>}
  </div>;
}
