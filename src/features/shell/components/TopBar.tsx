"use client";

import { useAuth } from "@/features/auth/hooks/useAuth";

export function TopBar({ menuOpen, onToggleMenu }: { menuOpen: boolean; onToggleMenu: () => void }) {
  const { user, logout } = useAuth();
  return (
    <header className="topbar">
      <div className="flex items-center gap-3">
        <button className="button-secondary lg:hidden" aria-expanded={menuOpen} aria-controls="app-navigation" onClick={onToggleMenu}>
          {menuOpen ? "Cerrar menú" : "Abrir menú"}
        </button>
        <div>
          <p className="font-semibold">SnG Control</p>
          <p className="metadata">Control operativo</p>
        </div>
      </div>
      <div className="topbar-user">
        <span className="avatar" aria-hidden="true">{(user?.name ?? "G").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
        <div className="topbar-identity" aria-label="Usuario actual">
          <p className="break-words text-sm font-semibold">{user?.name ?? "Cuenta Google"}</p>
          {user?.email && <p className="break-all text-xs text-slate-600">{user.email}</p>}
        </div>
        <button className="button-ghost shrink-0" onClick={logout}>Cerrar sesión</button>
      </div>
    </header>
  );
}
