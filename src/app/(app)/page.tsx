"use client";

import { UserIdentityCard } from "@/features/auth/components/UserIdentityCard";
import { useAuth } from "@/features/auth/hooks/useAuth";

export default function Home() {
  const { user } = useAuth();
  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Inicio</h1>
      <p className="mb-8 text-sm text-slate-600">Consulta la identidad de tu sesión actual.</p>
      {user && <UserIdentityCard user={user} />}
      <p className="mt-6 text-sm text-slate-600">Esta sesión permanece en la pestaña actual.</p>
    </div>
  );
}
