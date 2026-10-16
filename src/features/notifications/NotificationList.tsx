import Link from "next/link";
import { taskTypeLabels } from "@/features/tasks/types";
import { formatDate } from "@/lib/formatDate";
import type { NotificationState, ProjectNotification } from "./types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import styles from "./NotificationList.module.css";

const stateLabels: Record<NotificationState, string> = { Informational: "Informativa", Active: "Activa", Resolved: "Resuelta" };
export function NotificationList({ notifications, projectLinks = false, variant = "default" }: { notifications: ProjectNotification[]; projectLinks?: boolean; variant?: "default" | "activity" }) {
  if (variant === "activity") return notifications.length ? <ul className={styles.activity}>{[...notifications].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map((notification) => <li key={notification.id} className={`${styles.event} ${notification.kind === "Overdue" && notification.state === "Active" ? styles.overdue : ""}`}>
    <time className={styles.date} dateTime={notification.createdAt}>{formatDate(notification.createdAt)}</time>
    <div className={styles.heading}><h3>{notification.title}</h3><StatusBadge tone={notification.kind === "Overdue" && notification.state === "Active" ? "danger" : notification.state === "Resolved" ? "success" : notification.state === "Active" ? "warning" : "neutral"}>{stateLabels[notification.state]}</StatusBadge></div>
    {notification.kind === "Overdue" && <p className={styles.alert}>{notification.state === "Active" ? "Alerta de atraso activa" : "Historial de atraso"}</p>}
    <p className={styles.message}>{notification.message}</p>
    <div className={styles.metadata}><p>{taskTypeLabels[notification.taskType]}</p>{notification.scheduledAt && <p>Programada: {formatDate(notification.scheduledAt)}</p>}{notification.deadlineAt && <p>Vence: {formatDate(notification.deadlineAt)}</p>}{notification.resolvedAt && <p>Resuelta: {formatDate(notification.resolvedAt)}</p>}</div>
    {projectLinks && <Link className="text-link mt-2 inline-block" href={`/projects/${encodeURIComponent(notification.projectId)}`}>Abrir proyecto</Link>}
  </li>)}</ul> : <p className={styles.empty}>No hay notificaciones para mostrar.</p>;
  if (!notifications.length) return <EmptyState title="No hay notificaciones para mostrar." />;
  return <ul className="stack">{[...notifications].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map((notification) => <li key={notification.id} className={`border-l-2 py-3 pl-4 pr-2 ${notification.kind === "Overdue" && notification.state === "Active" ? "border-[var(--danger)] bg-[var(--danger-soft)]" : "border-[var(--border-strong)]"}`}>
    <div className="section-header"><h3 className="flex min-w-0 items-center gap-2 font-semibold break-words"><Icon name={notification.kind === "ProjectDocumentsUpdated" ? "file" : "notifications"} />{notification.title}</h3><StatusBadge tone={notification.kind === "Overdue" && notification.state === "Active" ? "danger" : notification.state === "Resolved" ? "success" : notification.state === "Active" && ["DueSoon", "DueToday"].includes(notification.kind) ? "warning" : "info"}>{stateLabels[notification.state]}</StatusBadge></div>
    {notification.kind === "Overdue" && <p className="mt-2 font-semibold">{notification.state === "Active" ? "Alerta de atraso activa" : "Historial de atraso"}</p>}
    <p className="mt-2 whitespace-pre-wrap break-words">{notification.message}</p>
    <div className="metadata-row mt-2"><p>{taskTypeLabels[notification.taskType]}</p><p>Creada: {formatDate(notification.createdAt)}</p>{notification.scheduledAt && <p>Programada: {formatDate(notification.scheduledAt)}</p>}{notification.deadlineAt && <p>Vence: {formatDate(notification.deadlineAt)}</p>}{notification.resolvedAt && <p>Resuelta: {formatDate(notification.resolvedAt)}</p>}</div>
    {projectLinks && <Link className="text-link mt-3 inline-block" href={`/projects/${encodeURIComponent(notification.projectId)}`}>Abrir proyecto</Link>}
  </li>)}</ul>;
}
