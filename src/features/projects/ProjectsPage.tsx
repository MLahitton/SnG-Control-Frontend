"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { clientsService } from "@/features/clients/service";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { useResource } from "@/lib/api/useResource";
import { formatDate } from "@/lib/formatDate";
import { projectsService } from "./service";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";

export function ProjectsPage() {
  const { user } = useAuth();
  return <ProjectsContent key={user?.subject} />;
}

function ProjectsContent() {
  const { user } = useAuth();
  const showCreation = user?.isManagement === false;
  const api = useApiClient();
  const load = useCallback(async (signal: AbortSignal) => {
    const [projects, clients] = await Promise.all([projectsService.list(api, signal), clientsService.list(api, signal)]);
    return { projects, clients: new Map(clients.map((client) => [client.id, client.name])) };
  }, [api]);
  const { data, loading, error, refresh } = useResource(load);
  return <div className="page-stack">
    <PageHeader title="Proyectos" description="Seguimiento de proyectos comerciales y operativos." action={showCreation && <Link className="button-primary" href="/projects/new">Crear proyecto</Link>} />
    {loading && <p role="status" className="loading-notice">Cargando proyectos…</p>}
    <ErrorNotice error={error} retry={refresh} />
    {data?.projects.length === 0 && <EmptyState title="Todavía no hay proyectos." description={showCreation ? "Crea el primer proyecto para comenzar." : undefined} />}
    {data && data.projects.length > 0 && <div className="table-scroll" role="region" aria-label="Lista de proyectos" tabIndex={0}>
      <table className="data-table"><caption className="sr-only">Proyectos registrados. Fechas en hora de Colombia.</caption>
        <thead><tr>{["Proyecto", "Cliente", "Ciudad", "Línea", "SG", "Creación"].map((title) => <th key={title} scope="col">{title}</th>)}</tr></thead>
        <tbody>{data.projects.map((project) => <tr key={project.id}>
          <td><Link className="text-link" href={`/projects/${encodeURIComponent(project.id)}`}>{project.name}</Link></td>
          <td>{data.clients.get(project.clientId) ?? "Cliente no disponible"}</td><td>{project.city}</td><td><StatusBadge>{project.productLine}</StatusBadge></td><td><StatusBadge code tone={project.sgCode ? "info" : "neutral"}>{project.sgCode ?? "Sin SG"}</StatusBadge></td><td className="whitespace-nowrap metadata">{formatDate(project.createdAt)}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </div>;
}
