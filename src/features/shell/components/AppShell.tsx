"use client";

import { useRef, useState, type ReactNode } from "react";
import { IntelligenceLauncher } from "@/features/intelligence/components/IntelligenceLauncher";
import { AuthGate } from "@/features/auth/components/AuthGate";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import styles from "./Shell.module.css";

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const content = useRef<HTMLElement>(null);
  return (
    <AuthGate>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:p-3">
        Saltar al contenido
      </a>
      <div className={styles.shell}>
        <TopBar menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((open) => !open)} />
        <Sidebar open={menuOpen} onNavigate={() => {
          setMenuOpen(false);
          content.current?.focus();
        }} />
        <main id="main-content" ref={content} tabIndex={-1} className={styles.main}>
          {children}
        </main>
        <IntelligenceLauncher />
      </div>
    </AuthGate>
  );
}
