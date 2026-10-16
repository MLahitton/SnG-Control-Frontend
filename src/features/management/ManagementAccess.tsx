"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { ApiError } from "@/lib/api/apiError";
import { ErrorNotice } from "@/lib/api/ErrorNotice";

export function ManagementDenied() {
  return <div className="page-stack"><p role="alert" className="error-message">No tienes acceso a la vista de Gerencia.</p><Link className="text-link" href="/">Volver al inicio</Link></div>;
}

// This is a presentation gate; backend authorization remains authoritative.
// Remount all permission-dependent resources when the validated identity changes.
export function ManagementAccess({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  if (status === "loading") return <p role="status">Validando sesión…</p>;
  if (status !== "authenticated" || user?.isManagement !== true) return <ManagementDenied />;
  return <Fragment key={user.subject}>{children}</Fragment>;
}

export function ManagementError({ error, retry }: { error: unknown; retry: () => void }) {
  if (error instanceof ApiError && error.status === 403) return <ManagementDenied />;
  return <ErrorNotice error={error} retry={retry} />;
}
