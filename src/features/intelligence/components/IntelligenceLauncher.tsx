"use client";
import { useRef, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Icon } from "@/components/ui/Icon";
import { IntelligencePanel } from "./IntelligencePanel";
import styles from "./Intelligence.module.css";

export function IntelligenceLauncher() {
  const { status, user, activeRole } = useAuth();
  if (status !== "authenticated" || !user || activeRole !== "Management" || !user.roles.includes("Management")) return null;
  return <Launcher key={`${user.subject}:${activeRole}`} />;
}
function Launcher() {
  const [opened, setOpened] = useState(false);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() { setOpen(false); trigger.current?.focus(); }
  return <>
    <button ref={trigger} type="button" className={styles.launcher} aria-label="Abrir SnG Intelligence" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpened(true); setOpen(true); }}><Icon name="intelligence" /><span>Intelligence</span></button>
    {opened && <IntelligencePanel onClose={close} visible={open} />}
  </>;
}
