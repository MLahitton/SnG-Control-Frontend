"use client";

import { availableRoleLabels } from "@/features/auth/types/auth";
import { UserIdentityCard } from "@/features/auth/components/UserIdentityCard";
import { useAuth } from "@/features/auth/hooks/useAuth";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { navigationFor } from "@/features/shell/navigation";
import { Icon } from "@/components/ui/Icon";

export default function Home() {
  const { user, activeRole } = useAuth();
  return (
    <div className="page-stack">
      <PageHeader title="SnG Control" description={activeRole ? `Área actual: ${availableRoleLabels[activeRole]}` : "Control operativo de proyectos Steel & Glass."} />
      <nav aria-label="Accesos rápidos" className="quick-links">{navigationFor(activeRole, user?.roles ?? []).filter(item => item.href !== "/").map(item => <Link key={item.href} href={item.href} className="quick-link"><Icon name={item.icon} /><div><p className="font-semibold">{item.label}</p><p className="metadata">{item.description}</p></div></Link>)}</nav>
      {user && <UserIdentityCard user={user} />}
      <p className="metadata">Esta sesión permanece en la pestaña actual.</p>
    </div>
  );
}
