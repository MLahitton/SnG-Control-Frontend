"use client";

import { UserIdentityCard } from "@/features/auth/components/UserIdentityCard";
import { useAuth } from "@/features/auth/hooks/useAuth";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";

const shortcuts = [
  { href: "/projects", name: "Proyectos", description: "Documentación y seguimiento", icon: "projects" },
  { href: "/clients", name: "Clientes", description: "Registro comercial", icon: "clients" },
  { href: "/tasks", name: "Tareas", description: "Estado y vencimientos", icon: "tasks" },
  { href: "/notifications", name: "Notificaciones", description: "Actividad y alertas", icon: "notifications" },
] as const;

export default function Home() {
  const { user } = useAuth();
  return (
    <div className="page-stack">
      <PageHeader title="SnG Control" description="Control operativo de proyectos Steel & Glass." />
      {user?.isManagement === true && <Link href="/management" className="quick-link"><Icon name="home" /><div><p className="font-semibold">Gerencia</p><p className="metadata">Resumen ejecutivo y operación transversal</p></div></Link>}
      <nav aria-label="Accesos rápidos" className="quick-links">{shortcuts.map((item) => <Link key={item.href} href={item.href} className="quick-link"><Icon name={item.icon} /><div><p className="font-semibold">{item.name}</p><p className="metadata">{item.description}</p></div></Link>)}</nav>
      {user && <UserIdentityCard user={user} />}
      <p className="metadata">Esta sesión permanece en la pestaña actual.</p>
    </div>
  );
}
