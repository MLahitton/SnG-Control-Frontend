"use client";
import { type ReactNode, useEffect, useState } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { quotationViewService } from "@/features/quotationViews/service";
import { formatDate } from "@/lib/formatDate";
import type { MeasurementAction, Structure } from "./contracts";
import { metresToMm, mmToMetres } from "./units";
import { TechnicalFields } from "./TechnicalFields";
import { SketchPanel } from "./SketchPanel";
import styles from "./MeasurementPanel.module.css";

type ImageState = { url?: string; failed?: boolean };
export function useMeasurementImages(projectId: string, structures: Structure[]) {
  const api = useApiClient();
  const ids = [...new Set(structures.map(s => s.imageCatalogItemId).filter((id): id is string => !!id))].sort().join(",");
  const [attempt, setAttempt] = useState(0);
  const key = `${projectId}:${ids}:${attempt}`;
  const [result, setResult] = useState<{ key: string; images: Record<string, ImageState> }>();
  useEffect(() => {
    const controller = new AbortController(); const urls: string[] = [];
    for (const itemId of ids ? ids.split(",") : []) {
      void quotationViewService.image(api, projectId, itemId, controller.signal).then(blob => {
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob); urls.push(url);
        setResult(previous => ({ key, images: { ...(previous?.key === key ? previous.images : {}), [itemId]: { url } } }));
      }).catch(() => {
        if (!controller.signal.aborted) setResult(previous => ({ key, images: { ...(previous?.key === key ? previous.images : {}), [itemId]: { failed: true } } }));
      });
    }
    return () => { controller.abort(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [api, projectId, ids, key]);
  return { images: result?.key === key ? result.images : {}, retry: () => setAttempt(value => value + 1) };
}

export function StructureCard({ structure: s, projectId, sketchFeedback, writable, disabled, saving, image, retryImage, onCommand, onRetire, onDirty }: {
  sketchFeedback?: ReactNode; projectId: string; structure: Structure; writable: boolean; disabled: boolean; saving: boolean; image?: ImageState; retryImage: () => void;
  onCommand: (action: MeasurementAction) => void; onRetire: () => void; onDirty: (id: string, dirty: boolean) => void;
}) {
  const [extraDirty, setExtraDirty] = useState<string | null>(null);
  function extraChanged(id: string, dirty: boolean) { setExtraDirty(dirty ? id : null); onDirty(id, dirty); }
  const [width, setWidth] = useState((s.actualWidth == null ? undefined : metresToMm(s.actualWidth).toString()) ?? "");
  const [height, setHeight] = useState((s.actualHeight == null ? undefined : metresToMm(s.actualHeight).toString()) ?? "");
  const [system, setSystem] = useState(s.actualSystemText ?? "");
  const dirty = width !== ((s.actualWidth == null ? undefined : metresToMm(s.actualWidth).toString()) ?? "") || height !== ((s.actualHeight == null ? undefined : metresToMm(s.actualHeight).toString()) ?? "") || system !== (s.actualSystemText ?? "");
  function change(field: "width" | "height" | "system", value: string) {
    const values = { width, height, system, [field]: value };
    if (field === "width") setWidth(value); else if (field === "height") setHeight(value); else setSystem(value);
    onDirty(s.id, values.width !== ((s.actualWidth == null ? undefined : metresToMm(s.actualWidth).toString()) ?? "") || values.height !== ((s.actualHeight == null ? undefined : metresToMm(s.actualHeight).toString()) ?? "") || values.system !== (s.actualSystemText ?? ""));
  }
  const valid = Number.isFinite(Number(width)) && Number(width) > 0 && Number.isFinite(Number(height)) && Number(height) > 0 && !!system.trim() && system.length <= 2000;
  return <article className={`panel stack ${styles.card}`} aria-label={`Estructura ${s.id}`}>
    <strong>{s.itemId ? `Ítem ${s.itemNumber ?? ""} · ${s.unitOrdinal}/${s.unitCount}` : "Agregada en obra"} · {s.id.slice(0, 8)}</strong>
    {s.location && <p>{s.location}</p>}
    <p className="metadata">{s.itemId ? "Cotizado" : "Registro inicial"}: {s.description || "Sin sistema"} · {metresToMm(s.width)} × {metresToMm(s.height)} mm</p>
    <form className="stack" onSubmit={event => { event.preventDefault(); if (writable && !disabled && dirty && valid) onCommand({ action: "RecordActual", structureId: s.id, actualWidth: mmToMetres(Number(width)), actualHeight: mmToMetres(Number(height)), actualSystemText: system.trim() }); }}>
      <div className={styles.drawing}>
        <div className={styles.picture}>
          {image?.url ? <>
            {/* Private authenticated blobs must never use the public image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={`Dibujo del ítem ${s.itemNumber ?? ""}`} />
          </> : <p>{s.imageCatalogItemId ? image?.failed ? "No se pudo cargar el dibujo." : "Cargando dibujo…" : "Sin imagen persistida"}</p>}
          {image?.failed && <button type="button" className="text-link" onClick={retryImage}>Reintentar imagen</button>}
        </div>
        <label className={styles.width}>Ancho en obra (mm)<input aria-label={`Ancho en obra ${s.id}`} className="form-control" type="number" inputMode="decimal" min="0" step="any" required value={width} disabled={!writable || disabled || !!extraDirty} onChange={e => change("width", e.target.value)} /></label>
        <label className={styles.height}>Alto en obra (mm)<input aria-label={`Alto en obra ${s.id}`} className="form-control" type="number" inputMode="decimal" min="0" step="any" required value={height} disabled={!writable || disabled || !!extraDirty} onChange={e => change("height", e.target.value)} /></label>
      </div>
      <label>Sistema en obra<input aria-label={`Sistema en obra ${s.id}`} className="form-control" type="text" required maxLength={2000} value={system} disabled={!writable || disabled || !!extraDirty} onChange={e => change("system", e.target.value)} /></label>
      {writable && <button className="button-primary" disabled={disabled || !!extraDirty || !dirty || !valid}>{saving ? "Guardando medidas…" : "Guardar medidas"}</button>}
      {dirty && <p role="status">Cambios sin guardar en esta estructura.</p>}
    </form>
    <TechnicalFields key={JSON.stringify(s.technical)} structure={s} disabled={disabled || dirty || !!extraDirty?.startsWith("sketch:")} writable={writable} onCommand={onCommand} onDirty={extraChanged} />
    <p>Vista guardada: {s.technical?.viewSide === "Inside" ? "Por dentro" : s.technical?.viewSide === "Outside" ? "Por fuera" : "Sin registrar"} · Apertura: {s.technical?.openingType ? ({ NotApplicable: "No aplica", HingedDoor: "Puerta batiente", HingedWindow: "Ventana batiente", Other: "Otro" })[s.technical.openingType] : "Sin registrar"}</p>
    <SketchPanel feedback={sketchFeedback} key={s.sketchVersionId ?? "empty"} projectId={projectId} structure={s} disabled={disabled || dirty || !!extraDirty?.startsWith("technical:")} writable={writable} onCommand={onCommand} onDirty={extraChanged} />
    {!s.technicalComplete && <p className="metadata">Completa y guarda medidas y detalles técnicos antes de marcar Medido. Los checks históricos se conservan.</p>}
    <label className={styles.measured}><input type="checkbox" aria-label={`Medido ${s.id}`} checked={!!s.measuredAt} disabled={!writable || disabled || dirty || !!extraDirty} onChange={e => onCommand({ action: "Measure", structureId: s.id, measured: e.target.checked })} />Medido</label>
    {s.measuredAt && <p className="metadata">{formatDate(s.measuredAt)}</p>}
    {writable && <button className="button-secondary" disabled={disabled || dirty || !!extraDirty} onClick={onRetire}>Retirar estructura {s.id.slice(0, 8)}</button>}
  </article>;
}
