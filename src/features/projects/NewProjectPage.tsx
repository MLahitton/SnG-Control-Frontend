"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { clientsService } from "@/features/clients/service";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { useResource } from "@/lib/api/useResource";
import { projectsService } from "./service";
import { productLines, type ProductLine } from "./types";
import { PageHeader } from "@/components/ui/PageHeader";

export function NewProjectPage() {
  const api = useApiClient();
  const router = useRouter();
  const load = useCallback((signal: AbortSignal) => clientsService.list(api, signal), [api]);
  const clients = useResource(load);
  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [productLine, setProductLine] = useState<ProductLine>("Classic");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState<unknown>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || !name.trim() || !city.trim() || !clientId) return;
    locked.current = true; setBusy(true); setError(undefined);
    try {
      const project = await projectsService.create(api, { clientId, name: name.trim(), city: city.trim(), productLine });
      router.push(`/projects/${encodeURIComponent(project.id)}`);
      // Keep the form locked until navigation completes.
    } catch (failure) { setError(failure); locked.current = false; setBusy(false); }
  }
  return <div className="page-stack">
    <Link className="text-link" href="/projects">Volver a proyectos</Link>
    <PageHeader title="Crear proyecto" description="Registra el cliente, la ubicación y la línea del proyecto." />
    {clients.loading && <p role="status">Cargando clientes…</p>}
    <ErrorNotice error={clients.error} retry={clients.refresh} />
    {clients.data?.length === 0 && <div className="panel"><p>Primero debes crear un cliente para registrar el proyecto.</p><Link className="text-link mt-3 inline-block" href="/clients">Crear cliente</Link></div>}
    {!!clients.data?.length && <form onSubmit={submit} className="panel space-y-5">
      <fieldset disabled={busy} className="form-grid">
        <legend className="section-title mb-5">Datos del proyecto</legend>
        <label className="field-label">Cliente *<select className="form-control" required value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Selecciona un cliente</option>{clients.data.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
        <label className="field-label">Nombre del proyecto *<input className="form-control" required value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field-label">Ciudad *<input className="form-control" required value={city} onChange={(e) => setCity(e.target.value)} /></label>
        <label className="field-label">Línea de producto *<select className="form-control" value={productLine} onChange={(e) => setProductLine(e.target.value as ProductLine)}>{productLines.map((line) => <option key={line}>{line}</option>)}</select></label>
      </fieldset>
      <ErrorNotice error={error} />
      <div className="action-bar border-t border-[var(--border)] pt-4"><p className="metadata">* Campos obligatorios</p><button className="button-primary" disabled={busy || !clientId || !name.trim() || !city.trim()}>{busy ? "Creando proyecto…" : "Crear proyecto"}</button></div>
    </form>}
  </div>;
}
