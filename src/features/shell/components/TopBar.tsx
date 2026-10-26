"use client";

import { availableRoleLabels, isSystemRole } from "@/features/auth/types/auth";
import { useAuth } from "@/features/auth/hooks/useAuth";
import styles from "./Shell.module.css";

export function TopBar({ menuOpen, onToggleMenu }: { menuOpen: boolean; onToggleMenu: () => void }) {
  const { user, logout, activeRole, availableRoles, setActiveRole } = useAuth();
  return (
    <header className={styles.topbar}>
      <div className={styles.mobileContext}>
        <button className={styles.menu} aria-expanded={menuOpen} aria-controls="app-navigation" onClick={onToggleMenu}>
          {menuOpen ? "Cerrar menú" : "Abrir menú"}
        </button>
        <p className={styles.productName}>SnG Control</p>
      </div>
      {activeRole && <label className={styles.role}>Trabajando como
        {availableRoles.length > 1 ? <select className="form-control" value={activeRole} onChange={event => { if (isSystemRole(event.target.value)) setActiveRole(event.target.value); }}>
          {availableRoles.map(role => <option key={role} value={role}>{availableRoleLabels[role]}</option>)}
        </select> : <span>{availableRoleLabels[activeRole]}</span>}
      </label>}
      <div className={styles.user}>
        <span className={styles.avatar} aria-hidden="true">{(user?.name ?? "G").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
        <div className={styles.identity} aria-label="Usuario actual">
          <p className="font-medium">{user?.name ?? "Cuenta Google"}</p>
          {user?.email && <p>{user.email}</p>}
        </div>
        <button className={styles.logout} onClick={logout}>Cerrar sesión</button>
      </div>
    </header>
  );
}
