"use client";

import Link from "next/link";
import { useCallback } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { TaskStatusBadge, TaskTimingBadge } from "@/features/tasks/TaskList";
import { taskAreaLabels, taskTypeLabel } from "@/features/tasks/types";
import { formatDate } from "@/lib/formatDate";
import { useResource } from "@/lib/api/useResource";
import { ManagementAccess, ManagementError } from "./ManagementAccess";
import { managementService } from "./service";
import styles from "./Management.module.css";

export function ManagementOverviewPage() {
  return <ManagementAccess><OverviewContent /></ManagementAccess>;
}

function OverviewContent() {
  const api = useApiClient();
  const load = useCallback((signal: AbortSignal) => managementService.overview(api, signal), [api]);
  const { data, loading, error, refresh } = useResource(load);
  return <div className="page-stack">
    <PageHeader title="Resumen ejecutivo" description="Gerencia · Estado actual de proyectos y operación." action={<Link className="button-secondary" href="/management/tasks">Ver operación</Link>} />
    {loading && <p role="status" className="loading-notice">Cargando resumen…</p>}
    <ManagementError error={error} retry={refresh} />
    {data && <>
      <dl className={styles.kpis} aria-label="Indicadores de operación">
        <div className="panel"><dt>Total de proyectos</dt><dd>{data.totalProjects}</dd></div>
        <div className="panel"><dt>Tareas activas</dt><dd><span>{data.tasks.pending + data.tasks.inProgress}</span><p className="metadata font-normal">Pendientes + en curso</p></dd></div>
        <div className={`panel ${styles.overdue}`}><dt>Tareas atrasadas</dt><dd>{data.leakTime.overdue}</dd></div>
        <div className={`panel ${styles.due}`}><dt>Vencen hoy</dt><dd>{data.leakTime.dueToday}</dd></div>
      </dl>
      {data.totalProjects === 0 && <EmptyState title="Todavía no hay proyectos." />}
      <section className="panel" aria-labelledby="management-work-title">
        <h2 id="management-work-title" className="section-title">Estado del trabajo</h2>
        <dl className={styles.work}>
          <div><dt>Pendientes</dt><dd>{data.tasks.pending}</dd></div>
          <div><dt>En curso</dt><dd>{data.tasks.inProgress}</dd></div>
          <div><dt>Completadas</dt><dd>{data.tasks.completed}</dd></div>
          <div><dt>Vencen pronto</dt><dd>{data.leakTime.dueSoon}</dd></div>
        </dl>
        {data.tasks.pending + data.tasks.inProgress + data.tasks.completed === 0 && <p className="metadata mt-3">Todavía no hay tareas registradas.</p>}
      </section>
      <section className="stack" aria-labelledby="management-areas-title">
        <h2 id="management-areas-title" className="section-title">Operación por área</h2>
        {data.areas.length === 0 ? <EmptyState title="Todavía no hay áreas con tareas." /> : <div className="table-scroll" role="region" aria-label="Resumen por área" tabIndex={0}>
          <table className="data-table"><caption className="sr-only">Estado de tareas por área</caption>
            <thead><tr>{["Área", "Pendientes", "En curso", "Completadas", "Atrasadas", "Vencen hoy", "Vencen pronto"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{data.areas.map((area) => <tr key={area.area}><th scope="row">{taskAreaLabels[area.area]}</th><td>{area.pending}</td><td>{area.inProgress}</td><td>{area.completed}</td><td>{area.overdue}</td><td>{area.dueToday}</td><td>{area.dueSoon}</td></tr>)}</tbody>
          </table>
        </div>}
      </section>
      <section className="panel" aria-labelledby="management-attention-title">
        <div className="section-header"><h2 id="management-attention-title" className="section-title">Requieren atención</h2><Link className="text-link" href="/management/tasks">Ver toda la operación</Link></div>
        {data.attention.total > data.attention.items.length && <p className="metadata mt-3">Mostrando {data.attention.items.length} de {data.attention.total} tareas que requieren atención.</p>}
        {data.attention.items.length === 0 ? <EmptyState title="No hay tareas que requieran atención en este momento." /> : <ol className={styles.attention}>
          {data.attention.items.map((item) => <li key={item.taskId}>
            <div className="stack"><Link className="text-link" href={`/projects/${encodeURIComponent(item.projectId)}`}>{item.projectName}</Link><p>{item.clientName} · {item.sgCode ?? "Sin SG"}</p><p className="metadata">{taskAreaLabels[item.area]} · {taskTypeLabel(item.taskType)}</p></div>
            <div className="stack"><div className="metadata-row"><TaskTimingBadge task={item} /><TaskStatusBadge task={{ status: item.taskStatus }} /></div><p className="metadata">Vencimiento: {item.deadlineAt ? formatDate(item.deadlineAt) : "Sin vencimiento"}</p><p className="metadata">Inicio: {item.startedAt ? formatDate(item.startedAt) : "Sin iniciar"}</p></div>
          </li>)}
        </ol>}
      </section>
    </>}
  </div>;
}
