"use client";
import Link from "next/link";
import { useCallback } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { projectsService } from "@/features/projects/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { useResource } from "@/lib/api/useResource";
import { formatDate } from "@/lib/formatDate";
import { clientsService } from "./service";

export function ClientDetailPage({ id }: { id: string }) {
  const { user, activeRole } = useAuth();
  return <ClientDetailContent key={`${id}:${user?.subject}:${activeRole}`} id={id} />;
}
function ClientDetailContent({ id }: { id: string }) {
  const api = useApiClient();
  const load = useCallback(async (signal: AbortSignal) => {
    const client = await clientsService.get(api, id, signal);
    const projects = await projectsService.list(api, signal);
    return { client, projects: projects.filter(p => p.clientId === client.id) };
  }, [api, id]);
  const { data, loading, error, refresh } = useResource(load);
  return <div className="page-stack">
    <Link className="text-link" href="/clients">Volver a clientes</Link>
    <PageHeader title={data?.client.name ?? "Detalle del cliente"} description="Información y proyectos disponibles para tu área." />
    {loading && <p role="status">Cargando cliente…</p>}<ErrorNotice error={error} retry={refresh} />
    {data && <><section className="panel" aria-label="Información del cliente"><dl className="stack">
      <div><dt>Nombre</dt><dd className="break-words">{data.client.name}</dd></div>
      <div><dt>Creado</dt><dd>{formatDate(data.client.createdAt)}</dd></div>
      <div><dt>Actualizado</dt><dd>{formatDate(data.client.updatedAt)}</dd></div>
    </dl></section><section className="panel" aria-labelledby="client-projects-title"><h2 id="client-projects-title" className="section-title">Proyectos disponibles</h2>
      {!data.projects.length ? <EmptyState title="No hay proyectos disponibles para este cliente." /> : <ul className="dense-list">
        {data.projects.map(p => <li key={p.id}><Link className="text-link break-words" href={`/projects/${encodeURIComponent(p.id)}`}>{p.name}</Link><p className="metadata">{p.sgCode ?? "Sin SG"} · {p.city}</p></li>)}
      </ul>}
    </section></>}
  </div>;
}
