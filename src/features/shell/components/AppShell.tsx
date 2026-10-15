"use client";

import { useRef, useState, type ReactNode } from "react";
import { AuthGate } from "@/features/auth/components/AuthGate";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const content = useRef<HTMLElement>(null);
  return (
    <AuthGate>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:p-3">
        Saltar al contenido
      </a>
      <div className="grid min-h-svh grid-rows-[auto_auto_1fr] lg:grid-cols-[15rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
        <TopBar menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((open) => !open)} />
        <Sidebar open={menuOpen} onNavigate={() => {
          setMenuOpen(false);
          content.current?.focus();
        }} />
        <main id="main-content" ref={content} tabIndex={-1} className="row-start-3 min-w-0 px-5 py-8 outline-none sm:px-8 lg:col-start-2 lg:row-start-2 lg:p-10">
          {children}
        </main>
      </div>
    </AuthGate>
  );
}
