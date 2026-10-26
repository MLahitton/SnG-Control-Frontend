import Link from "next/link";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/formatDate";
import { taskAreaLabels, taskStatusLabels, taskTypeLabels, type LeadTimeStatus, type ProjectTask } from "./types";
import styles from "./TaskList.module.css";

export const timingLabels: Record<LeadTimeStatus, string> = {
  NotStarted: "Sin iniciar", OnTrack: "En tiempo", DueSoon: "Vence pronto", DueToday: "Vence hoy",
  Overdue: "Atrasada", CompletedOnTime: "Completada a tiempo", CompletedLate: "Completada con retraso", UntrackedLegacy: "Sin seguimiento histórico",
};
const timingTones: Record<LeadTimeStatus, StatusTone> = {
  NotStarted: "neutral", OnTrack: "info", DueSoon: "warning", DueToday: "warning",
  Overdue: "danger", CompletedOnTime: "success", CompletedLate: "warning", UntrackedLegacy: "neutral",
};

export function TaskStatusBadge({ task, technical = false }: { task: Pick<ProjectTask, "status">; technical?: boolean }) {
  return <StatusBadge tone={task.status === "Completed" ? "success" : task.status === "InProgress" && !technical ? "info" : "neutral"}>{taskStatusLabels[task.status]}</StatusBadge>;
}

export function TaskTimingBadge({ task, technical = false }: { task: Pick<ProjectTask, "LeadTimeStatus">; technical?: boolean }) {
  return <StatusBadge tone={technical && task.LeadTimeStatus === "OnTrack" ? "success" : timingTones[task.LeadTimeStatus]}>{timingLabels[task.LeadTimeStatus]}</StatusBadge>;
}

export function TaskTimingStatus({ task, technical = false }: { task: ProjectTask; technical?: boolean }) {
  return <div className="space-y-2">
    <TaskTimingBadge task={task} technical={technical} />
    <p className="font-medium">Vence: {task.deadlineAt ? formatDate(task.deadlineAt) : "Sin fecha asignada"}</p>
    {!task.deadlineAt && task.LeadTimeStatus === "NotStarted" && <p className="metadata">{task.type === "PrepareQuotation" ? "El plazo comienza al asignar el SG." : "La tarea todavía no ha iniciado su plazo."}</p>}
  </div>;
}

export function TaskList({ tasks, projectNames, compact = false }: { tasks: ProjectTask[]; projectNames?: ReadonlyMap<string, string>; compact?: boolean }) {
  if (compact) return tasks.length ? <ul className={styles.list}>{tasks.map((task) => <li key={task.id} className={`${styles.task} ${task.LeadTimeStatus === "Overdue" ? styles.overdue : ""}`}>
    <div className={styles.heading}><h3>{taskTypeLabels[task.type]}</h3><TaskStatusBadge task={task} technical /></div>
    <p className={styles.area}>Área: {taskAreaLabels[task.area]}</p>
    {projectNames && <Link className="text-link" href={`/projects/${encodeURIComponent(task.projectId)}`}>{projectNames.get(task.projectId) ?? "Abrir proyecto"}</Link>}
    <div className={styles.timing}><TaskTimingStatus task={task} technical /></div>
    <dl className={styles.dates}>
      <div><dt className="inline">Inicio: </dt><dd className="inline">{formatDate(task.startedAt)}</dd></div>
      <div><dt className="inline">Asignada: </dt><dd className="inline">{formatDate(task.assignedAt)}</dd></div>
      {task.completedAt && <div><dt className="inline">Completada: </dt><dd className="inline">{formatDate(task.completedAt)}</dd></div>}
    </dl>
    {task.wasOverdue && <p className="metadata mt-2">Registró atraso.</p>}
  </li>)}</ul> : <p className={styles.empty}>No hay tareas para mostrar.</p>;
  if (!tasks.length) return <EmptyState title="No hay tareas para mostrar." />;
  return <ul className="stack">{tasks.map((task) => <li key={task.id} className={`panel ${task.LeadTimeStatus === "Overdue" ? "border-l-4 border-l-[var(--danger)]" : ""}`}>
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="stack"><div className="section-header"><h3 className="font-semibold">{taskTypeLabels[task.type]}</h3><TaskStatusBadge task={task} /></div>
        {projectNames && <Link className="text-link break-words" href={`/projects/${encodeURIComponent(task.projectId)}`}>{projectNames.get(task.projectId) ?? "Abrir proyecto"}</Link>}
        <p className="metadata">Área: {taskAreaLabels[task.area]}</p>
      </div>
      <div>
        <TaskTimingStatus task={task} />
        <dl className="metadata-row mt-4 border-t border-[var(--border)] pt-3"><div><dt className="inline">Asignada: </dt><dd className="inline">{formatDate(task.assignedAt)}</dd></div><div><dt className="inline">Inicio: </dt><dd className="inline">{formatDate(task.startedAt)}</dd></div>{task.completedAt && <div><dt className="inline">Completada: </dt><dd className="inline">{formatDate(task.completedAt)}</dd></div>}</dl>
        {task.wasOverdue && <p className="mt-2 metadata">Registró atraso.</p>}
      </div>
    </div>
  </li>)}</ul>;
}
