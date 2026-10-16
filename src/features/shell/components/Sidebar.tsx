"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

const navigation = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/clients", label: "Clientes", icon: "clients" },
  { href: "/projects", label: "Proyectos", icon: "projects" },
  { href: "/tasks", label: "Tareas", icon: "tasks" },
  { href: "/notifications", label: "Notificaciones", icon: "notifications" },
] as const;

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <aside id="app-navigation" aria-label="Navegación de SnG Control"
      className="app-sidebar" data-open={open}>
      <div className="sidebar-brand">
        <span className="brand-mark" aria-hidden="true">SG</span>
        <div><p className="font-semibold">Steel &amp; Glass</p><p className="metadata">SnG Control</p></div>
      </div>
      <nav aria-label="Principal" className="sidebar-nav">
        <ul className="space-y-1">
          {navigation.map(({ href, label, icon }) => (
            <li key={href}>
              <Link href={href} aria-current={pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)) ? "page" : undefined} onClick={onNavigate}
                className="nav-link">
                <Icon name={icon} />{label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
