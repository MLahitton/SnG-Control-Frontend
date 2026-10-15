"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [{ href: "/", label: "Inicio" }];

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <aside id="app-navigation" aria-label="Navegación de SnG Control"
      className={`border-b border-slate-200 bg-white lg:row-span-2 lg:row-start-1 lg:flex lg:flex-col lg:border-r lg:border-b-0 ${open ? "block" : "hidden"}`}>
      <div className="hidden border-b border-slate-100 px-6 py-7 lg:block">
        <p className="text-xl font-semibold tracking-tight">SnG Control</p>
        <p className="eyebrow mt-2">Steel &amp; Glass</p>
      </div>
      <nav aria-label="Principal" className="p-4">
        <ul className="space-y-1">
          {navigation.map(({ href, label }) => (
            <li key={href}>
              <Link href={href} aria-current={pathname === href ? "page" : undefined} onClick={onNavigate}
                className="block rounded-lg px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 aria-[current=page]:bg-cyan-50 aria-[current=page]:text-cyan-900">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
