"use client";

import { useCallback } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { useResource } from "@/lib/api/useResource";
import { notificationsService } from "./service";
import { NotificationList } from "./NotificationList";
import { PageHeader } from "@/components/ui/PageHeader";

export function NotificationsPage() {
  const api = useApiClient();
  const load = useCallback((signal: AbortSignal) => notificationsService.list(api, signal), [api]);
  const { data, loading, error, refresh } = useResource(load);
  return <div className="page-stack">
    <PageHeader title="Notificaciones" description="Notificaciones personales e historial de alertas. Fechas y horas de Colombia (America/Bogota)." />
    {loading && <p role="status">Cargando notificaciones…</p>}
    <ErrorNotice error={error} retry={refresh} />
    {data && <section aria-labelledby="notification-results-title"><h2 id="notification-results-title" className="sr-only">Historial de notificaciones</h2><NotificationList notifications={data} projectLinks /></section>}
  </div>;
}
