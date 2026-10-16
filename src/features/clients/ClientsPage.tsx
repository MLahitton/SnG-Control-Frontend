"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { useResource } from "@/lib/api/useResource";
import { formatDate } from "@/lib/formatDate";
import { clientsService } from "./service";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export function ClientsPage() {
  const api = useApiClient();
  const load = useCallback((signal: AbortSignal) => clientsService.list(api, signal), [api]);
  const resource = useResource(load);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || !name.trim()) return;
    locked.current = true;
    setBusy(true); setError(undefined); setNotice("");
    try {
      await clientsService.create(api, name.trim());
      setName(""); setNotice("Cliente creado."); resource.refresh();
    } catch (failure) { setError(failure); }
    finally { locked.current = false; setBusy(false); }
  }
  return <div className="page-stack">
    <PageHeader title="Clientes" description="Registro de clientes para tus proyectos." />
    <div className="split-layout">
    <section className="panel lg:col-start-2 lg:row-start-1" aria-labelledby="create-client-title">
      <h2 id="create-client-title" className="section-title">Crear cliente</h2>
      <form onSubmit={submit} className="mt-4 stack">
        <label className="field-label flex-1">Nombre del cliente *
          <input className="form-control" required value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </label>
        <button className="button-primary" disabled={busy || !name.trim()}>{busy ? "Creando…" : "Crear cliente"}</button>
      </form>
      <div className="mt-4"><ErrorNotice error={error} />{notice && <p role="status" className="success-notice">{notice}</p>}</div>
    </section>
    <section className="panel lg:col-start-1 lg:row-start-1" aria-labelledby="clients-title">
      <h2 id="clients-title" className="section-title">Clientes registrados</h2>
      {resource.loading && <p role="status" className="mt-4">Cargando clientes…</p>}
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.data?.length === 0 && <EmptyState title="Todavía no hay clientes. Crea el primero para registrar proyectos." />}
      {resource.data && resource.data.length > 0 && <ul className="mt-3 dense-list">
        {resource.data.map((client) => <li key={client.id} className="section-header"><p className="font-semibold break-words">{client.name}</p><p className="metadata">Creado: {formatDate(client.createdAt)}</p></li>)}
      </ul>}
    </section>
    </div>
  </div>;
}
