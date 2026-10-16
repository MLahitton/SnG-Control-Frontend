import { formatDate } from "@/lib/formatDate";
import type { Project } from "./types";
import styles from "./ProjectDetail.module.css";

export function ProjectHeader({ project, clientName }: { project: Project; clientName: string }) {
  return <header className={styles.projectHeader} aria-label="Resumen del proyecto">
    <div>
      <h1 className={styles.projectTitle}>{project.name}</h1>
      <p className={styles.projectContext}><span>{clientName}</span><span>{project.city}</span><span>{project.productLine}</span></p>
    </div>
    <p className={styles.sgCode} aria-label="Código SG actual">{project.sgCode ?? "Sin SG"}</p>
    <dl className={styles.projectFacts}>
      <div><dt>Responsable comercial</dt><dd>{[project.createdBy?.name, project.createdBy?.email].filter(Boolean).join(" · ") || "No disponible"}</dd></div>
      <div><dt>Creación</dt><dd>{formatDate(project.createdAt)}</dd></div>
    </dl>
  </header>;
}
