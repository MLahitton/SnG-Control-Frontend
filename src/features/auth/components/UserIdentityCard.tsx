"use client";

import { useState } from "react";
import type { CurrentUser } from "@/features/auth/types/auth";

export function UserIdentityCard({ user }: { user: CurrentUser }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  async function copySubject() {
    try {
      await navigator.clipboard.writeText(user.subject);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <section aria-labelledby="identity-title" className="panel">
      <div className="mb-4 flex items-center gap-3">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-teal-700" />
        <h2 id="identity-title" className="section-title">Sesión iniciada</h2>
      </div>
      <dl className="form-grid">
        <div><dt className="metadata">Nombre</dt><dd className="break-words font-medium">{user.name ?? "No disponible"}</dd></div>
        <div><dt className="metadata">Correo</dt><dd className="break-words font-medium">{user.email ?? "No disponible"}</dd></div>
      </dl>
      <details className="mt-4 metadata"><summary>Identidad técnica de la sesión</summary>
      <p className="mt-3">Google Subject</p><p className="break-all font-mono">{user.subject}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button className="button-secondary" onClick={() => void copySubject()}>Copiar Subject</button>
        {copyState === "copied" && <p role="status" className="text-sm text-teal-800">Subject copiado.</p>}
        {copyState === "error" && <p role="alert" className="text-sm text-red-800">No se pudo copiar. Selecciona el Subject y cópialo manualmente.</p>}
      </div>
      </details>
    </section>
  );
}
