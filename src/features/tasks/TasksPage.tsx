"use client";

import { useCallback, useState } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { projectsService } from "@/features/projects/service";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { useResource } from "@/lib/api/useResource";
import { tasksService } from "./service";
import { TaskList } from "./TaskList";
import { taskAreaLabels, taskStatusLabels, type TaskArea, type TaskStatus } from "./types";

export function TasksPage() {
  const api = useApiClient();
  const [area, setArea] = useState<TaskArea>("Commercial");
  const [status, setStatus] = useState<TaskStatus>("Pending");
  const loadProjects = useCallback(async (signal: AbortSignal) => {
    const projects = await projectsService.list(api, signal);
    return new Map(projects.map((project) => [project.id, project.name]));
  }, [api]);
  const loadTasks = useCallback((signal: AbortSignal) => tasksService.list(api, area, status, signal), [api, area, status]);
  const projects = useResource(loadProjects);
  const tasks = useResource(loadTasks);
  return <div className="space-y-6">
    <h1 className="page-title">Tareas</h1>
    <div className="panel flex flex-wrap gap-4">
      <label className="field-label min-w-48">Área<select className="form-control" value={area} onChange={(e) => setArea(e.target.value as TaskArea)}>{Object.entries(taskAreaLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field-label min-w-48">Estado<select className="form-control" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>{Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <p className="text-sm text-slate-600">Fechas y horas de Colombia (America/Bogota).</p>
    {(tasks.loading || projects.loading) && <p role="status">Cargando tareas…</p>}
    <ErrorNotice error={projects.error} retry={projects.refresh} /><ErrorNotice error={tasks.error} retry={tasks.refresh} />
    {tasks.data && projects.data && <TaskList tasks={tasks.data} projectNames={projects.data} />}
  </div>;
}
