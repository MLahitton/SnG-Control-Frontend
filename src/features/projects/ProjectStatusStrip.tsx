import { TaskTimingBadge, TaskStatusBadge } from "@/features/tasks/TaskList";
import { taskAreaLabels, taskTypeLabels, type ProjectTask } from "@/features/tasks/types";
import { formatDate } from "@/lib/formatDate";
import styles from "./ProjectDetail.module.css";

export function ProjectStatusStrip({ tasks }: { tasks: ProjectTask[] }) {
  // Selection for presentation only; no workflow transition or timing is inferred.
  const current = tasks.find((task) => task.status === "InProgress") ?? tasks.find((task) => task.status === "Pending") ?? tasks[0];
  return <section className={styles.statusStrip} aria-label="Estado actual del proyecto">
    {current ? <>
      <div className={styles.statusGrid}>
        <div className={styles.statusCell}><p className={styles.statusLabel}>{taskAreaLabels[current.area]}</p><p className={styles.statusTitle}>{taskTypeLabels[current.type]}</p></div>
        <div className={styles.statusCell}><p className={styles.statusLabel}>Estado</p><TaskStatusBadge task={current} technical /></div>
        <div className={styles.statusCell}><p className={styles.statusLabel}>Lead Time</p><TaskTimingBadge task={current} technical /></div>
        <div className={`${styles.statusCell} ${styles.statusDates}`}><p>Inicio: {formatDate(current.startedAt)}</p><p className="font-medium">Vence: {current.deadlineAt ? formatDate(current.deadlineAt) : "Sin fecha asignada"}</p></div>
      </div>
      {!current.deadlineAt && current.LeadTimeStatus === "NotStarted" && <p className={styles.statusNote}>{current.type === "PrepareQuotation" ? "El plazo comienza al asignar el SG." : "La tarea todavía no ha iniciado su plazo."}</p>}
    </> : <div className="section-header"><h2 className={styles.statusTitle}>Preparación documental</h2><p className="metadata">Sin tareas asignadas</p></div>}
  </section>;
}
