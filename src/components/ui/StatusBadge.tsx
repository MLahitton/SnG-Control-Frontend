import type { ReactNode } from "react";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";
export function StatusBadge({ children, tone = "neutral", code = false }: { children: ReactNode; tone?: StatusTone; code?: boolean }) {
  return <span className={`badge badge-${tone}${code ? " badge-code" : ""}`}>{children}</span>;
}
