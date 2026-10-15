"use client";

import { useCallback } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { useResource } from "@/lib/api/useResource";
import { notificationsService } from "./service";
import { NotificationList } from "./NotificationList";

export function NotificationsPage() {
  const api = useApiClient();
  const load = useCallback((signal: AbortSignal) => notificationsService.list(api, signal), [api]);
  const { data, loading, error, refresh } = useResource(load);
  return <div className="space-y-6">
    <h1 className="page-title">Notificaciones</h1>
    <p className="text-sm text-slate-600">Notificaciones personales e historial de alertas. Fechas y horas de Colombia (America/Bogota).</p>
    {loading && <p role="status">Cargando notificaciones…</p>}
    <ErrorNotice error={error} retry={refresh} />
    {data && <NotificationList notifications={data} projectLinks />}
  </div>;
}
