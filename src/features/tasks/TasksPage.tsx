"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { projectsService } from "@/features/projects/service";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { useResource } from "@/lib/api/useResource";
import { tasksService } from "./service";
import { TaskList } from "./TaskList";
import { taskAreaLabels, taskStatusLabels, type TaskArea, type TaskStatus } from "./types";
import { PageHeader } from "@/components/ui/PageHeader";

export function TasksPage() {
  const api = useApiClient();
  const { activeRole } = useAuth();
  const [area, setArea] = useState<TaskArea>(activeRole === "Budgets" ? "Budgets" : "Commercial");
  const [status, setStatus] = useState<TaskStatus>("Pending");
  const loadProjects = useCallback(async (signal: AbortSignal) => {
    const projects = await projectsService.list(api, signal);
    return new Map(projects.map((project) => [project.id, project.name]));
  }, [api]);
  const loadTasks = useCallback((signal: AbortSignal) => tasksService.list(api, area, status, signal), [api, area, status]);
  const projects = useResource(loadProjects);
  const tasks = useResource(loadTasks);
  return <div className="page-stack">
    <PageHeader title="Tareas" description="Seguimiento operativo por área, estado y vencimiento." />
    <div className="toolbar" role="group" aria-label="Filtros de tareas">
      <label className="field-label">Área<select className="form-control" value={area} onChange={(e) => setArea(e.target.value as TaskArea)}>{Object.entries(taskAreaLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field-label">Estado<select className="form-control" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>{Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <p className="text-sm text-slate-600">Fechas y horas de Colombia (America/Bogota).</p>
    {(tasks.loading || projects.loading) && <p role="status">Cargando tareas…</p>}
    <ErrorNotice error={projects.error} retry={projects.refresh} /><ErrorNotice error={tasks.error} retry={tasks.refresh} />
    {tasks.data && projects.data && <section aria-labelledby="task-results-title"><h2 id="task-results-title" className="sr-only">Tareas consultadas</h2><TaskList tasks={tasks.data} projectNames={projects.data} /></section>}
  </div>;
}
