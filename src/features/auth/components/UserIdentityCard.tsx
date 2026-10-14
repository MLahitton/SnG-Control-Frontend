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
      <div className="mb-6 flex items-center gap-3">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-teal-700" />
        <h2 id="identity-title" className="text-xl font-semibold">Sesión iniciada</h2>
      </div>
      <dl className="space-y-6">
        <div><dt className="text-sm text-slate-600">Name</dt><dd className="mt-1 break-words font-medium">{user.name ?? "No disponible"}</dd></div>
        <div><dt className="text-sm text-slate-600">Email</dt><dd className="mt-1 break-words font-medium">{user.email ?? "No disponible"}</dd></div>
        <div><dt className="text-sm text-slate-600">Google Subject</dt><dd className="mt-2 break-all rounded-lg bg-slate-100 p-3 font-mono text-sm">{user.subject}</dd></div>
      </dl>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button className="button-secondary" onClick={() => void copySubject()}>Copiar Subject</button>
        {copyState === "copied" && <p role="status" className="text-sm text-teal-800">Subject copiado.</p>}
        {copyState === "error" && <p role="alert" className="text-sm text-red-800">No se pudo copiar. Selecciona el Subject y cópialo manualmente.</p>}
      </div>
    </section>
  );
}
