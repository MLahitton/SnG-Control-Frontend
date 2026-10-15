import Link from "next/link";
import { formatDate } from "@/lib/formatDate";
import { taskAreaLabels, taskStatusLabels, taskTypeLabels, type LeakTimeStatus, type ProjectTask } from "./types";

export const timingLabels: Record<LeakTimeStatus, string> = {
  NotStarted: "Sin iniciar", OnTrack: "En tiempo", DueSoon: "Vence pronto", DueToday: "Vence hoy",
  Overdue: "Atrasada", CompletedOnTime: "Completada a tiempo", CompletedLate: "Completada con retraso", UntrackedLegacy: "Sin seguimiento histórico",
};
const timingColors: Record<LeakTimeStatus, string> = {
  NotStarted: "bg-slate-100 text-slate-700", OnTrack: "bg-cyan-50 text-cyan-900",
  DueSoon: "bg-amber-50 text-amber-900", DueToday: "bg-amber-100 text-amber-950",
  Overdue: "bg-red-100 text-red-900", CompletedOnTime: "bg-emerald-50 text-emerald-900",
  CompletedLate: "bg-orange-100 text-orange-900", UntrackedLegacy: "bg-slate-100 text-slate-700",
};

export function TaskTimingStatus({ task }: { task: ProjectTask }) {
  return <div className="space-y-2">
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${timingColors[task.leakTimeStatus]}`}>{timingLabels[task.leakTimeStatus]}</span>
    <p>Vence: {task.deadlineAt ? formatDate(task.deadlineAt) : "Sin fecha asignada"}</p>
    {!task.deadlineAt && task.leakTimeStatus === "NotStarted" && <p className="text-slate-600">{task.type === "PrepareQuotation" ? "El plazo comienza al asignar el SG." : "La tarea todavía no ha iniciado su plazo."}</p>}
  </div>;
}

export function TaskList({ tasks, projectNames }: { tasks: ProjectTask[]; projectNames?: ReadonlyMap<string, string> }) {
  if (!tasks.length) return <p>No hay tareas para mostrar.</p>;
  return <ul className="grid gap-4 xl:grid-cols-2">{tasks.map((task) => <li key={task.id} className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold text-base">{taskTypeLabels[task.type]}</h3><span className="rounded-md bg-slate-100 px-2 py-1">{taskStatusLabels[task.status]}</span></div>
    {projectNames && <Link className="text-link mb-3 inline-block" href={`/projects/${encodeURIComponent(task.projectId)}`}>{projectNames.get(task.projectId) ?? "Abrir proyecto"}</Link>}
    <p className="mb-3">Área: {taskAreaLabels[task.area]}</p>
    <TaskTimingStatus task={task} />
    <dl className="mt-4 space-y-1 text-slate-600"><div><dt className="inline">Asignada: </dt><dd className="inline">{formatDate(task.assignedAt)}</dd></div><div><dt className="inline">Inicio: </dt><dd className="inline">{formatDate(task.startedAt)}</dd></div>{task.completedAt && <div><dt className="inline">Completada: </dt><dd className="inline">{formatDate(task.completedAt)}</dd></div>}</dl>
    {task.wasOverdue && <p className="mt-2 font-medium text-orange-900">Registró atraso.</p>}
  </li>)}</ul>;
}
