"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/useAuth";

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "authenticated") return children;
  return <main className="grid min-h-svh place-items-center px-6"><p role="status" className="text-sm text-slate-600">{status === "loading" ? "Validando sesión…" : "Abriendo inicio de sesión…"}</p></main>;
}
