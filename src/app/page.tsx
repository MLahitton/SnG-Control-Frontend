"use client";

import { AuthGate } from "@/features/auth/components/AuthGate";
import { UserIdentityCard } from "@/features/auth/components/UserIdentityCard";
import { useAuth } from "@/features/auth/hooks/useAuth";

export default function Home() {
  const { user, logout } = useAuth();
  return (
    <AuthGate>
      <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col px-5 py-10 sm:px-8 sm:py-16">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="eyebrow">Steel &amp; Glass</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">SnG Control</h1>
          </div>
          <button className="button-secondary" onClick={logout}>Cerrar sesión</button>
        </header>
        {user && <UserIdentityCard user={user} />}
        <p className="mt-6 text-sm text-slate-600">Esta sesión permanece en la pestaña actual.</p>
      </main>
    </AuthGate>
  );
}
