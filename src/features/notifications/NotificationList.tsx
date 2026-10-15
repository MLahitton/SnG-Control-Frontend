import Link from "next/link";
import { taskTypeLabels } from "@/features/tasks/types";
import { formatDate } from "@/lib/formatDate";
import type { NotificationState, ProjectNotification } from "./types";

const stateLabels: Record<NotificationState, string> = { Informational: "Informativa", Active: "Activa", Resolved: "Resuelta" };
export function NotificationList({ notifications, projectLinks = false }: { notifications: ProjectNotification[]; projectLinks?: boolean }) {
  if (!notifications.length) return <p>No hay notificaciones para mostrar.</p>;
  return <ul className="space-y-4">{notifications.map((notification) => <li key={notification.id} className={`rounded-xl border p-5 ${notification.kind === "Overdue" && notification.state === "Active" ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="font-semibold break-words">{notification.title}</h3><span className="rounded-md border border-current px-2 py-1 text-xs font-semibold">{stateLabels[notification.state]}</span></div>
    {notification.kind === "Overdue" && <p className="mt-2 font-semibold">{notification.state === "Active" ? "Alerta de atraso activa" : "Historial de atraso"}</p>}
    <p className="mt-2 whitespace-pre-wrap break-words">{notification.message}</p>
    <div className="mt-3 space-y-1 text-sm text-slate-600"><p>{taskTypeLabels[notification.taskType]}</p><p>Creada: {formatDate(notification.createdAt)}</p>{notification.scheduledAt && <p>Programada: {formatDate(notification.scheduledAt)}</p>}{notification.deadlineAt && <p>Vence: {formatDate(notification.deadlineAt)}</p>}{notification.resolvedAt && <p>Resuelta: {formatDate(notification.resolvedAt)}</p>}</div>
    {projectLinks && <Link className="text-link mt-3 inline-block" href={`/projects/${encodeURIComponent(notification.projectId)}`}>Abrir proyecto</Link>}
  </li>)}</ul>;
}
