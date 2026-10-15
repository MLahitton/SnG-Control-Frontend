"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { useResource } from "@/lib/api/useResource";
import { formatDate } from "@/lib/formatDate";
import { clientsService } from "./service";

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
  return <div className="space-y-6">
    <h1 className="page-title">Clientes</h1>
    <section className="panel" aria-labelledby="create-client-title">
      <h2 id="create-client-title" className="section-title">Crear cliente</h2>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-4">
        <label className="field-label flex-1">Nombre del cliente *
          <input className="form-control" required value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </label>
        <button className="button-primary" disabled={busy || !name.trim()}>{busy ? "Creando…" : "Crear cliente"}</button>
      </form>
      <div className="mt-4"><ErrorNotice error={error} />{notice && <p role="status">{notice}</p>}</div>
    </section>
    <section className="panel" aria-labelledby="clients-title">
      <h2 id="clients-title" className="section-title">Clientes registrados</h2>
      {resource.loading && <p role="status" className="mt-4">Cargando clientes…</p>}
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.data?.length === 0 && <p className="mt-4">Todavía no hay clientes. Crea el primero para registrar proyectos.</p>}
      {resource.data && resource.data.length > 0 && <ul className="mt-4 divide-y divide-slate-200">
        {resource.data.map((client) => <li key={client.id} className="py-3"><p className="font-semibold break-words">{client.name}</p><p className="text-sm text-slate-600">Creado: {formatDate(client.createdAt)}</p></li>)}
      </ul>}
    </section>
  </div>;
}
