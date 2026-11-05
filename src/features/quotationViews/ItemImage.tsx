"use client";
import { useEffect, useMemo, useState } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { ApiError } from "@/lib/api/apiError";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { quotationViewService } from "./service";
import styles from "./QuotationReadViews.module.css";

export function ItemImage({ projectId, itemId, number }: { projectId: string; itemId: string; number: string }) {
  const api = useApiClient();
  const [attempt, setAttempt] = useState(0);
  const key = useMemo(() => ({ api, projectId, itemId, attempt }), [api, projectId, itemId, attempt]);
  const [result, setResult] = useState<{ key: typeof key; url?: string; error?: unknown }>();
  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    void quotationViewService.image(api, projectId, itemId, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setResult({ key, url });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setResult({ key, error });
    });
    // The effect owns only its URL; a late response cannot revoke a newer item's image.
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [api, projectId, itemId, key]);
  const state = result?.key === key ? result : undefined;
  return <div className={styles.image}>
    {!state && <p role="status">Cargando imagen del ítem {number}…</p>}
    {/* Authenticated blobs bypass the public Next image optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {state?.url && <img src={state.url} alt={`Imagen confirmada del ítem ${number}`}
      onError={() => setResult({ key, error: new Error("Image decode failed") })} />}
    {state?.error instanceof ApiError && state.error.status === 404 ? <p>Sin imagen persistida para el ítem {number}.</p> : !!state?.error && <><p>No se pudo cargar la imagen del ítem {number}.</p>
      <ErrorNotice error={state.error} retry={() => setAttempt(value => value + 1)} /></>}
  </div>;
}
