"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { TaskStatusBadge, TaskTimingBadge, timingLabels } from "@/features/tasks/TaskList";
import { taskAreaLabels, taskStatusLabels, taskTypeLabel } from "@/features/tasks/types";
import { formatDate } from "@/lib/formatDate";
import { useResource } from "@/lib/api/useResource";
import { ManagementAccess, ManagementError } from "./ManagementAccess";
import { managementService } from "./service";
import styles from "./Management.module.css";

export function ManagementTasksPage() {
  return <ManagementAccess><TasksContent /></ManagementAccess>;
}

function TasksContent() {
  const api = useApiClient();
  const load = useCallback((signal: AbortSignal) => managementService.tasks(api, signal), [api]);
  const { data, loading, error, refresh } = useResource(load);
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("");
  const [timing, setTiming] = useState("");
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("es-CO");
  const tasks = data?.filter((task) => (!area || task.area === area) && (!status || task.status === status)
    && (!timing || task.LeadTimeStatus === timing)
    && (!query || [task.projectName, task.clientName, task.sgCode ?? "", task.city].some((text) => text.toLocaleLowerCase("es-CO").includes(query))));
  return <div className="page-stack">
    <PageHeader title="Operación" description="Gerencia · Tareas actuales e históricas de todas las áreas." action={<Link className="text-link" href="/management">Ver resumen</Link>} />
    {loading && <p role="status" className="loading-notice">Cargando operación…</p>}
    <ManagementError error={error} retry={refresh} />
    {data && <>
      <section className={`toolbar ${styles.filters}`} aria-label="Filtros de operación">
        <label className="field-label">Buscar proyecto, cliente, SG o ciudad<input type="search" className="form-control" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label className="field-label">Área<select className="form-control" value={area} onChange={(event) => setArea(event.target.value)}><option value="">Todas</option>{Object.entries(taskAreaLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field-label">Estado<select className="form-control" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option>{Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field-label">Situación<select className="form-control" value={timing} onChange={(event) => setTiming(event.target.value)}><option value="">Todas</option>{Object.entries(timingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button className="button-secondary" onClick={() => { setArea(""); setStatus(""); setTiming(""); setSearch(""); }}>Restablecer filtros</button>
      </section>
      <p role="status" className="metadata">Mostrando {tasks?.length} de {data.length} tareas. Fechas en hora de Colombia.</p>
      {data.length === 0 ? <EmptyState title="Todavía no hay tareas registradas." /> : tasks?.length === 0 ? <EmptyState title="No hay tareas que coincidan con los filtros." /> : <div className="table-scroll" role="region" aria-label="Tareas de toda la operación" tabIndex={0}>
        <table className="data-table"><caption className="sr-only">Tareas actuales e históricas, en el orden de la operación</caption>
          <thead><tr>{["Proyecto", "Cliente", "SG", "Área", "Tarea", "Estado", "Situación", "Inicio", "Vencimiento", "Finalización"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{tasks?.map((task) => <tr key={task.taskId}>
            <td><Link className="text-link" href={`/projects/${encodeURIComponent(task.projectId)}`}>{task.projectName}</Link><p className="metadata">{task.city} · {task.productLine}</p></td>
            <td>{task.clientName}</td><td className="whitespace-nowrap">{task.sgCode ?? "Sin SG"}</td><td>{taskAreaLabels[task.area]}</td><td>{taskTypeLabel(task.type)}</td>
            <td><TaskStatusBadge task={task} /></td><td><TaskTimingBadge task={task} />{task.wasOverdue === true && <p className="metadata mt-2">Registró atraso.</p>}</td>
            <td>{task.startedAt ? formatDate(task.startedAt) : "Sin iniciar"}</td><td>{task.deadlineAt ? formatDate(task.deadlineAt) : "Sin vencimiento"}</td><td>{task.completedAt ? formatDate(task.completedAt) : "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </>}
  </div>;
}
