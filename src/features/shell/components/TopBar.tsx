"use client";

import { useAuth } from "@/features/auth/hooks/useAuth";

export function TopBar({ menuOpen, onToggleMenu }: { menuOpen: boolean; onToggleMenu: () => void }) {
  const { user, logout } = useAuth();
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-8 lg:col-start-2">
      <div className="flex items-center gap-3">
        <button className="button-secondary lg:hidden" aria-expanded={menuOpen} aria-controls="app-navigation" onClick={onToggleMenu}>
          {menuOpen ? "Cerrar menú" : "Abrir menú"}
        </button>
        <div className="lg:hidden">
          <p className="font-semibold">SnG Control</p>
          <p className="text-xs text-slate-600">Steel &amp; Glass</p>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-4">
        <div className="min-w-0 text-right" aria-label="Usuario actual">
          <p className="break-words text-sm font-semibold">{user?.name ?? "Cuenta Google"}</p>
          {user?.email && <p className="break-all text-xs text-slate-600">{user.email}</p>}
        </div>
        <button className="button-secondary shrink-0" onClick={logout}>Cerrar sesión</button>
      </div>
    </header>
  );
}
