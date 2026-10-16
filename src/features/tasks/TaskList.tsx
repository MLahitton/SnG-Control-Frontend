import Link from "next/link";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/formatDate";
import { taskAreaLabels, taskStatusLabels, taskTypeLabels, type LeakTimeStatus, type ProjectTask } from "./types";

export const timingLabels: Record<LeakTimeStatus, string> = {
  NotStarted: "Sin iniciar", OnTrack: "En tiempo", DueSoon: "Vence pronto", DueToday: "Vence hoy",
  Overdue: "Atrasada", CompletedOnTime: "Completada a tiempo", CompletedLate: "Completada con retraso", UntrackedLegacy: "Sin seguimiento histórico",
};
const timingTones: Record<LeakTimeStatus, StatusTone> = {
  NotStarted: "neutral", OnTrack: "info", DueSoon: "warning", DueToday: "warning",
  Overdue: "danger", CompletedOnTime: "success", CompletedLate: "warning", UntrackedLegacy: "neutral",
};

export function TaskStatusBadge({ task }: { task: ProjectTask }) {
  return <StatusBadge tone={task.status === "Completed" ? "success" : task.status === "InProgress" ? "info" : "neutral"}>{taskStatusLabels[task.status]}</StatusBadge>;
}

export function TaskTimingStatus({ task }: { task: ProjectTask }) {
  return <div className="space-y-2">
    <StatusBadge tone={timingTones[task.leakTimeStatus]}>{timingLabels[task.leakTimeStatus]}</StatusBadge>
    <p className="font-medium">Vence: {task.deadlineAt ? formatDate(task.deadlineAt) : "Sin fecha asignada"}</p>
    {!task.deadlineAt && task.leakTimeStatus === "NotStarted" && <p className="metadata">{task.type === "PrepareQuotation" ? "El plazo comienza al asignar el SG." : "La tarea todavía no ha iniciado su plazo."}</p>}
  </div>;
}

export function TaskList({ tasks, projectNames, compact = false }: { tasks: ProjectTask[]; projectNames?: ReadonlyMap<string, string>; compact?: boolean }) {
  if (!tasks.length) return <EmptyState title="No hay tareas para mostrar." />;
  const TimingContainer = compact ? "details" : "div";
  return <ul className="stack">{tasks.map((task) => <li key={task.id} className={`panel ${task.leakTimeStatus === "Overdue" ? "border-l-4 border-l-[var(--danger)]" : ""}`}>
    <div className={compact ? "stack" : "grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"}>
      <div className="stack"><div className="section-header"><h3 className="font-semibold">{taskTypeLabels[task.type]}</h3><TaskStatusBadge task={task} /></div>
        {projectNames && <Link className="text-link break-words" href={`/projects/${encodeURIComponent(task.projectId)}`}>{projectNames.get(task.projectId) ?? "Abrir proyecto"}</Link>}
        <p className="metadata">Área: {taskAreaLabels[task.area]}</p>
      </div>
      <TimingContainer>
        {compact && <summary className="text-link mb-3">Fechas y seguimiento</summary>}
        <TaskTimingStatus task={task} />
        <dl className="metadata-row mt-4 border-t border-[var(--border)] pt-3"><div><dt className="inline">Asignada: </dt><dd className="inline">{formatDate(task.assignedAt)}</dd></div><div><dt className="inline">Inicio: </dt><dd className="inline">{formatDate(task.startedAt)}</dd></div>{task.completedAt && <div><dt className="inline">Completada: </dt><dd className="inline">{formatDate(task.completedAt)}</dd></div>}</dl>
        {task.wasOverdue && <p className="mt-2 metadata">Registró atraso.</p>}
      </TimingContainer>
    </div>
  </li>)}</ul>;
}
