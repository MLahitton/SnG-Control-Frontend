"use client";
import { useRef, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Icon } from "@/components/ui/Icon";
import { IntelligencePanel } from "./IntelligencePanel";
import styles from "./Intelligence.module.css";

export function IntelligenceLauncher() {
  const { status, user } = useAuth();
  if (status !== "authenticated" || user?.isManagement !== true) return null;
  return <Launcher key={user.subject} />;
}
function Launcher() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() { setOpen(false); trigger.current?.focus(); }
  return <>
    <button ref={trigger} type="button" className={styles.launcher} aria-label="Abrir SnG Intelligence" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="intelligence" /><span>Intelligence</span></button>
    {open && <IntelligencePanel onClose={close} />}
  </>;
}
