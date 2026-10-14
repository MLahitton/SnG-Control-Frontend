"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GoogleSignInButton } from "@/features/auth/components/GoogleSignInButton";
import { useAuth } from "@/features/auth/hooks/useAuth";

export default function LoginPage() {
  const { status, error } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  return (
    <main className="grid min-h-svh place-items-center px-5 py-12">
      <section aria-labelledby="login-title" className="panel w-full max-w-md border-t-4 border-t-cyan-800 text-center">
        <p className="eyebrow">Steel &amp; Glass</p>
        <h1 id="login-title" className="mt-3 text-3xl font-semibold tracking-tight">SnG Control</h1>
        <p className="mt-3 text-slate-600">Inicia sesión para continuar</p>
        <div className="my-8 h-px bg-slate-200" />
        {error && <p role="alert" className="error-message mb-5">{error}</p>}
        {status === "unauthenticated" ? <GoogleSignInButton /> : <p role="status" className="text-sm text-slate-600">{status === "loading" ? "Validando sesión…" : "Abriendo SnG Control…"}</p>}
        <p className="mt-8 text-xs leading-5 text-slate-500">Acceso con tu cuenta Google.<br />La sesión se guarda en esta pestaña.</p>
      </section>
    </main>
  );
}
