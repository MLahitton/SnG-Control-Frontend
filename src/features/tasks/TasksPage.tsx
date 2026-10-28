"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { clientsService } from "@/features/clients/service";
import { projectsService } from "@/features/projects/service";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { useResource } from "@/lib/api/useResource";
import { tasksService } from "./service";
import { TaskList } from "./TaskList";
import { taskStatusLabels, type TaskStatus } from "./types";
import { taskInboxByRole, type TaskInbox } from "./inbox";
import { EmptyState } from "@/components/ui/EmptyState";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";

export function TasksPage() {
  const { user, activeRole } = useAuth();
  const inbox = activeRole && user?.roles.includes(activeRole) ? taskInboxByRole[activeRole] : null;
  if (!inbox) return <div className="page-stack"><PageHeader title="Tareas" description="Esta área no tiene una bandeja operacional personal." />
    {activeRole === "Management" && user?.roles.includes("Management") && <Link className="text-link" href="/management/tasks">Consultar operación de Gerencia</Link>}
  </div>;
  return <TaskInboxContent key={`${user?.subject}:${activeRole}`} inbox={inbox} />;
}

function TaskInboxContent({ inbox }: { inbox: TaskInbox }) {
  const api = useApiClient();
  const area = inbox.area;
  const [status, setStatus] = useState<TaskStatus>(inbox.defaultStatus);
  const loadProjects = useCallback(async (signal: AbortSignal) => {
    const [projects, clients] = await Promise.all([projectsService.list(api, signal), area === "Accounting" ? clientsService.list(api, signal) : Promise.resolve([])]);
    return { names: new Map(projects.map(project => [project.id, project.name])), context: new Map(projects.map(project => [project.id,
      { sgCode: project.sgCode, clientName: clients.find(client => client.id === project.clientId)?.name ?? null }])) };
  }, [api, area]);
  const loadTasks = useCallback((signal: AbortSignal) => tasksService.list(api, area, status, signal), [api, area, status]);
  const projects = useResource(loadProjects);
  const tasks = useResource(loadTasks);
  return <div className="page-stack">
    <PageHeader title="Tareas" description={`Trabajo asignado a ${inbox.label}`} />
    <div className="toolbar" role="group" aria-label="Filtros de tareas">
      <label className="field-label">Estado<select className="form-control" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>{Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <p className="text-sm text-slate-600">Fechas y horas de Colombia (America/Bogota).</p>
    {(tasks.loading || projects.loading) && <p role="status">Cargando tareas…</p>}
    <ErrorNotice error={projects.error} retry={projects.refresh} /><ErrorNotice error={tasks.error} retry={tasks.refresh} />
    {tasks.data && projects.data && <section aria-labelledby="task-results-title"><h2 id="task-results-title" className="sr-only">Tareas consultadas</h2>{tasks.data.length ? <TaskList tasks={tasks.data} projectNames={projects.data.names} projectContext={area === "Accounting" ? projects.data.context : undefined} /> : <EmptyState title={inbox.empty} />}</section>}
  </div>;
}
