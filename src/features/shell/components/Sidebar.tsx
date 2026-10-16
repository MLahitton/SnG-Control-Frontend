"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/features/auth/hooks/useAuth";
import styles from "./Shell.module.css";

const navigation = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/clients", label: "Clientes", icon: "clients" },
  { href: "/projects", label: "Proyectos", icon: "projects" },
  { href: "/tasks", label: "Tareas", icon: "tasks" },
  { href: "/notifications", label: "Notificaciones", icon: "notifications" },
] as const;

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  return (
    <aside id="app-navigation" aria-label="Navegación de SnG Control"
      className={styles.sidebar} data-open={open}>
      <div className={styles.brand}>
        <p className={styles.wordmark}>S&amp;G</p>
        <p className={styles.brandControl}>CONTROL</p>
        <p className={styles.brandCompany}>Steel &amp; Glass</p>
      </div>
      <nav aria-label="Principal" className={styles.navigation}>
        <ul className="space-y-1">
          {navigation.map(({ href, label, icon }) => (
            <li key={href}>
              <Link href={href} aria-current={pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)) ? "page" : undefined} onClick={onNavigate}
                className={styles.navLink}>
                <Icon name={icon} />{label}
              </Link>
            </li>
          ))}
        </ul>
        {user?.isManagement === true && <>
          <p className={styles.navSection}>Gerencia</p>
          <ul className="space-y-1">
            <li><Link className={styles.navLink} href="/management" aria-current={pathname === "/management" ? "page" : undefined} onClick={onNavigate}><Icon name="home" />Resumen</Link></li>
            <li><Link className={styles.navLink} href="/management/tasks" aria-current={pathname === "/management/tasks" ? "page" : undefined} onClick={onNavigate}><Icon name="tasks" />Operación</Link></li>
          </ul>
        </>}
      </nav>
      <div className={styles.account}><p className={styles.accountLabel}>Sesión activa</p><p className={styles.accountName}>{user?.name ?? "Cuenta Google"}</p></div>
    </aside>
  );
}
