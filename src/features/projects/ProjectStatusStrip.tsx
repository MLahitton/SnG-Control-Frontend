import { TaskTimingStatus, TaskStatusBadge } from "@/features/tasks/TaskList";
import { taskAreaLabels, taskTypeLabels, type ProjectTask } from "@/features/tasks/types";
import { formatDate } from "@/lib/formatDate";

export function ProjectStatusStrip({ tasks }: { tasks: ProjectTask[] }) {
  // Selection for presentation only; no workflow transition or timing is inferred.
  const current = tasks.find((task) => task.status === "InProgress") ?? tasks.find((task) => task.status === "Pending") ?? tasks[0];
  return <section className="panel" aria-label="Estado actual del proyecto">
    {current ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]">
      <div className="space-y-2"><p className="eyebrow">{taskAreaLabels[current.area]}</p><p className="font-semibold">{taskTypeLabels[current.type]}</p><TaskStatusBadge task={current} /></div>
      <div><p className="metadata mb-2">Leak Time</p><TaskTimingStatus task={current} /></div>
      <div><p className="metadata">Inicio</p><p className="mt-1">{formatDate(current.startedAt)}</p></div>
    </div> : <div className="section-header"><h2 className="section-title">Preparación documental</h2><p className="metadata">Sin tareas asignadas</p></div>}
  </section>;
}
