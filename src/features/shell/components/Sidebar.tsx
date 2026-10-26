"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { navigationFor } from "../navigation";
import styles from "./Shell.module.css";

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  const { user, activeRole } = useAuth();
  const links = navigationFor(activeRole, user?.roles ?? []);
  const selected = links.filter(link => pathname === link.href || (link.href !== "/" && pathname.startsWith(`${link.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
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
          {links.map(({ href, label, icon }) => (
            <li key={href}>
              <Link href={href} aria-current={selected === href ? "page" : undefined} onClick={onNavigate}
                className={styles.navLink}>
                <Icon name={icon} />{label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className={styles.account}><p className={styles.accountLabel}>Sesión activa</p><p className={styles.accountName}>{user?.name ?? "Cuenta Google"}</p></div>
    </aside>
  );
}
