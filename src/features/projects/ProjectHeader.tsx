import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/formatDate";
import type { Project } from "./types";

export function ProjectHeader({ project, clientName }: { project: Project; clientName: string }) {
  return <header className="page-header" aria-label="Resumen del proyecto">
    <div className="stack">
      <div><h1 className="page-title">{project.name}</h1><p className="page-description"><span>{clientName}</span> · {project.city}</p></div>
      <div className="flex flex-wrap gap-2"><StatusBadge>{project.productLine}</StatusBadge><StatusBadge tone={project.sgCode ? "info" : "neutral"} code>{project.sgCode ?? "Sin SG"}</StatusBadge></div>
    </div>
    <dl className="stack metadata">
      <div><dt>Responsable comercial</dt><dd className="font-medium text-[var(--ink)]">{[project.createdBy?.name, project.createdBy?.email].filter(Boolean).join(" · ") || "No disponible"}</dd></div>
      <div><dt>Creación</dt><dd>{formatDate(project.createdAt)}</dd></div>
    </dl>
  </header>;
}
