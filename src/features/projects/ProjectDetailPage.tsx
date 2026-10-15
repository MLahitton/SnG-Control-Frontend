"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { clientsService } from "@/features/clients/service";
import { notificationsService } from "@/features/notifications/service";
import { NotificationList } from "@/features/notifications/NotificationList";
import { tasksService } from "@/features/tasks/service";
import { TaskList } from "@/features/tasks/TaskList";
import { ApiError } from "@/lib/api/apiError";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { useResource } from "@/lib/api/useResource";
import { formatDate } from "@/lib/formatDate";
import { projectsService } from "./service";

export function ProjectDetailPage({ id }: { id: string }) {
  const api = useApiClient();
  const load = useCallback(async (signal: AbortSignal) => {
    const [project, tasks, notifications] = await Promise.all([
      projectsService.get(api, id, signal), tasksService.forProject(api, id, signal), notificationsService.forProject(api, id, signal),
    ]);
    const client = await clientsService.get(api, project.clientId, signal);
    return { project, client, tasks, notifications };
  }, [api, id]);
  const resource = useResource(load);
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
  const canAssign = preparation?.status === "Pending" && data?.project.sgCode === null;
  const canCorrect = preparation?.status === "InProgress" && !!data?.project.sgCode;

  async function mutate(action: "send" | "sg") {
    if (locked.current || !data) return;
    if (action === "send" && (!confirmSend || preparation)) return;
    const normalizedSg = sgCode.trim().toUpperCase();
    if (action === "sg") {
      if (!canAssign && !canCorrect) return;
      if (!/^SG[0-9]+$/.test(normalizedSg)) {
        setValidation("Usa SG seguido de dígitos del 0 al 9, sin espacios ni guiones. Ejemplo: SG001.");
        return;
      }
    }
    locked.current = true; setBusy(true); setError(undefined); setRefreshError(undefined); setValidation(""); setConflict(""); setNotice("");
    try {
      if (action === "send") {
        const task = await projectsService.sendToBudgets(api, id);
        const updated = { ...data, tasks: [...data.tasks, task] };
        resource.update(updated);
        setConfirmSend(false); setNotice("Proyecto enviado a Presupuestos.");
        try {
          const [tasks, notifications] = await Promise.all([tasksService.forProject(api, id), notificationsService.forProject(api, id)]);
          resource.update({ ...updated, tasks, notifications });
        } catch (failure) { setRefreshError(failure); }
      } else {
        const response = await projectsService.assignSg(api, id, normalizedSg);
        const updated = {
          ...data, project: response.project,
          tasks: data.tasks.map((task) => task.id === response.prepareQuotationTask.id ? response.prepareQuotationTask : task),
        };
        resource.update(updated);
        setSgCode(""); setNotice(canCorrect ? "SG corregido." : "SG asignado.");
        try {
          const notifications = await notificationsService.forProject(api, id);
          resource.update({ ...updated, notifications });
        } catch (failure) { setRefreshError(failure); }
      }
    } catch (failure) {
      setError(failure);
      if (failure instanceof ApiError && failure.status === 409) {
        if (action === "sg") setConflict("No fue posible asignar el SG. El código puede estar en uso o el proyecto ya no permite esta operación.");
        setConfirmSend(false); resource.refresh();
      }
    } finally { locked.current = false; setBusy(false); }
  }
  function submitSg(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void mutate("sg"); }

  return <div className="space-y-6">
    <Link className="text-link" href="/projects">Volver a proyectos</Link>
    <h1 className="page-title">{data?.project.name ?? "Detalle del proyecto"}</h1>
    {resource.loading && <p role="status">Cargando proyecto…</p>}
    {resource.error instanceof ApiError && resource.error.status === 404
      ? <p role="alert" className="error-message">No se encontró el proyecto o uno de sus recursos asociados.</p>
      : <ErrorNotice error={resource.error} retry={resource.refresh} />}
    {conflict ? <div role="alert" className="error-message"><p>{conflict}</p>{error instanceof ApiError && error.code && <p>Código: {error.code}</p>}</div> : <ErrorNotice error={error} />}
    {notice && <p role="status" className="rounded-lg border border-cyan-200 bg-cyan-50 p-4">{notice}</p>}
    {!!refreshError && <div className="space-y-2"><p>La operación se guardó, pero no se pudo actualizar toda la información relacionada.</p><ErrorNotice error={refreshError} retry={() => { setRefreshError(undefined); resource.refresh(); }} /></div>}
    {data && <>
      <section className="panel" aria-labelledby="project-info-title">
        <h2 id="project-info-title" className="section-title">Datos del proyecto</h2>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Cliente", data.client.name], ["Ciudad", data.project.city], ["Línea", data.project.productLine], ["SG", data.project.sgCode ?? "Sin asignar"],
            ["Responsable comercial", [data.project.createdBy?.name, data.project.createdBy?.email].filter(Boolean).join(" · ") || "No disponible"],
            ["Creación", formatDate(data.project.createdAt)],
          ].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-600">{label}</dt><dd className="mt-1 font-medium break-words">{value}</dd></div>)}
        </dl>
      </section>
      {!preparation && <section className="panel" aria-labelledby="send-title">
        <h2 id="send-title" className="section-title">Presupuestos</h2>
        <p className="my-3">El envío asigna la preparación de la cotización. El plazo comienza con la primera asignación de SG.</p>
        {confirmSend ? <div role="group" aria-label="Confirmar envío a Presupuestos" className="space-y-3">
          <p>¿Confirmas el envío de este proyecto a Presupuestos?</p>
          <div className="flex flex-wrap gap-3"><button className="button-primary" disabled={busy} onClick={() => void mutate("send")}>{busy ? "Enviando…" : "Confirmar envío"}</button><button className="button-secondary" disabled={busy} onClick={() => setConfirmSend(false)}>Cancelar</button></div>
        </div> : <button className="button-primary" disabled={busy} onClick={() => setConfirmSend(true)}>Enviar a Presupuestos</button>}
      </section>}
      {(canAssign || canCorrect) && <section className="panel" aria-labelledby="sg-title">
        <h2 id="sg-title" className="section-title">{canCorrect ? "Corregir SG" : "Asignar SG"}</h2>
        <p className="my-3 text-sm text-slate-600">{canCorrect ? "La corrección conserva el inicio y vencimiento de la tarea." : "La primera asignación inicia el plazo de preparación de la cotización."}</p>
        <form onSubmit={submitSg} className="flex flex-wrap items-end gap-4">
          <label className="field-label">Código SG<input className="form-control" required value={sgCode} disabled={busy} aria-invalid={!!validation} aria-describedby={validation ? "sg-error" : undefined} onChange={(e) => { setSgCode(e.target.value); setValidation(""); }} placeholder={data.project.sgCode ?? "SG001"} /></label>
          <button className="button-primary" disabled={busy || !sgCode.trim()}>{busy ? "Guardando…" : canCorrect ? "Guardar corrección" : "Asignar SG"}</button>
        </form>
        {validation && <p id="sg-error" role="alert" className="error-message mt-3">{validation}</p>}
      </section>}
      <p className="text-sm text-slate-600">Fechas y horas de Colombia (America/Bogota).</p>
      <section aria-labelledby="project-tasks-title" className="space-y-4"><h2 id="project-tasks-title" className="section-title">Tareas del proyecto</h2><TaskList tasks={data.tasks} /></section>
      <section aria-labelledby="project-notifications-title" className="space-y-4"><h2 id="project-notifications-title" className="section-title">Historial de notificaciones</h2><NotificationList notifications={data.notifications} /></section>
    </>}
  </div>;
}
