"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { availableRoleLabels } from "@/features/auth/types/auth";
import { useAuth } from "@/features/auth/hooks/useAuth";

export function AuthGate({ children }: { children: ReactNode }) {
  const { status, activeRole, availableRoles, setActiveRole, logout } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "authenticated") {
    if (activeRole) return children;
    return <main className="grid min-h-svh place-items-center p-6"><section className="panel w-full max-w-lg space-y-5">
      <h1 className="section-title">{availableRoles.length ? "Selecciona el área con la que vas a trabajar" : "Tu cuenta no tiene un área asignada en SnG Control."}</h1>
      <div className="grid gap-3">{availableRoles.map(role => <button key={role} className="button-secondary" onClick={() => setActiveRole(role)}>{availableRoleLabels[role]}</button>)}</div>
      <button className="text-link" onClick={logout}>Cerrar sesión</button>
    </section></main>;
  }
  return <main className="grid min-h-svh place-items-center px-6"><p role="status" className="text-sm text-slate-600">{status === "loading" ? "Validando sesión…" : "Abriendo inicio de sesión…"}</p></main>;
}
