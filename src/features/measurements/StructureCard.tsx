"use client";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { quotationViewService } from "@/features/quotationViews/service";
import { formatDate } from "@/lib/formatDate";
import type { MeasurementAction, Structure } from "./contracts";
import { metresToMm, mmToMetres } from "./units";
import { useSectionDraft } from "./useSectionDraft";
import { missingMeasurementFields } from "./completeness";
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

type ActualDraft = { width: string; height: string; system: string };
const actualKey = (value: ActualDraft) => JSON.stringify({ width: value.width.trim() === "" ? "" : Number(value.width), height: value.height.trim() === "" ? "" : Number(value.height), system: value.system.trim() });
export function StructureCard({ structure: s, projectId, sketchFeedback, writable, disabled, saving, image, retryImage, onCommand, onRetire, onDirty }: {
  sketchFeedback?: ReactNode; projectId: string; structure: Structure; writable: boolean; disabled: boolean; saving: boolean; image?: ImageState; retryImage: () => void;
  onCommand: (action: MeasurementAction) => void; onRetire: () => void; onDirty: (id: string, dirty: boolean) => void;
}) {
  const [technicalDirty, setTechnicalDirty] = useState(false);
  const [sketchDirty, setSketchDirty] = useState(false);
  const sectionChanged = useCallback((id: string, changed: boolean) => {
    if (id.startsWith("technical:")) setTechnicalDirty(changed); else setSketchDirty(changed);
    onDirty(id, changed);
  }, [onDirty]);
  const actual = useSectionDraft({ width: s.actualWidth == null ? "" : metresToMm(s.actualWidth).toString(), height: s.actualHeight == null ? "" : metresToMm(s.actualHeight).toString(), system: s.actualSystemText ?? "" }, actualKey, s.id, onDirty);
  const { width, height, system } = actual.value;
  const dirty = actual.dirty;
  const hasDrafts = dirty || technicalDirty || sketchDirty;
  const canEdit = writable && !s.retiredAt;
  const missing = missingMeasurementFields(s);
  function change(field: keyof ActualDraft, value: string) { actual.setValue({ ...actual.value, [field]: value }); }
  const handleConflict = s.technical?.handleHeightMm != null && Number(height) > 0 && Number(height) < s.technical.handleHeightMm;
  const valid = Number.isFinite(Number(width)) && Number(width) > 0 && Number.isFinite(Number(height)) && Number(height) > 0 && !!system.trim() && system.length <= 2000;
  return <article className={`panel stack ${styles.card}`} aria-label={`Estructura ${s.id}`}>
    <strong>{s.itemId ? `Ítem ${s.itemNumber ?? ""} · ${s.unitOrdinal}/${s.unitCount}` : "Agregada en obra"} · {s.id.slice(0, 8)}</strong>
    {s.location && <p>{s.location}</p>}
    <p className="metadata">{s.itemId ? "Cotizado" : "Registro inicial"}: {s.description || "Sin sistema"} · {metresToMm(s.width)} × {metresToMm(s.height)} mm</p>
    <form className="stack" onSubmit={event => { event.preventDefault(); if (canEdit && !disabled && dirty && valid && !handleConflict) onCommand({ action: "RecordActual", structureId: s.id, actualWidth: mmToMetres(Number(width)), actualHeight: mmToMetres(Number(height)), actualSystemText: system.trim() }); }}>
      <div className={styles.drawing}>
        <div className={styles.picture}>
          {image?.url ? <>
            {/* Private authenticated blobs must never use the public image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={`Dibujo del ítem ${s.itemNumber ?? ""}`} />
          </> : <p>{s.imageCatalogItemId ? image?.failed ? "No se pudo cargar el dibujo." : "Cargando dibujo…" : "Sin imagen persistida"}</p>}
          {image?.failed && <button type="button" className="text-link" onClick={retryImage}>Reintentar imagen</button>}
        </div>
        <label className={styles.width}>Ancho en obra (mm)<input aria-label={`Ancho en obra ${s.id}`} className="form-control" type="number" inputMode="decimal" min="0" step="any" required value={width} disabled={!canEdit} onChange={e => change("width", e.target.value)} /></label>
        <label className={styles.height}>Alto en obra (mm)<input aria-label={`Alto en obra ${s.id}`} className="form-control" type="number" inputMode="decimal" min="0" step="any" required value={height} disabled={!canEdit} onChange={e => change("height", e.target.value)} /></label>
      </div>
      <label>Sistema en obra<input aria-label={`Sistema en obra ${s.id}`} className="form-control" type="text" required maxLength={2000} value={system} disabled={!canEdit} onChange={e => change("system", e.target.value)} /></label>
      {canEdit && <button className="button-primary" disabled={disabled || !dirty || !valid || handleConflict}>{saving ? "Guardando medidas…" : "Guardar medidas"}</button>}
      {dirty && <p role="status">Cambios sin guardar en esta estructura.</p>}
      {handleConflict && <p role="status">El alto propuesto es menor que la altura de manija guardada. Guarda primero la corrección de manija en Detalles técnicos; puedes seguir editando la ficha.</p>}
    </form>
    <TechnicalFields structure={s} disabled={disabled} writable={canEdit} onCommand={onCommand} onDirty={sectionChanged} />
    <p>Vista guardada: {s.technical?.viewSide === "Inside" ? "Por dentro" : s.technical?.viewSide === "Outside" ? "Por fuera" : "Sin registrar"} · Apertura: {s.technical?.openingType ? ({ NotApplicable: "No aplica", HingedDoor: "Puerta batiente", HingedWindow: "Ventana batiente", Other: "Otro" })[s.technical.openingType] : "Sin registrar"}</p>
    <SketchPanel feedback={sketchFeedback} projectId={projectId} structure={s} disabled={disabled} writable={canEdit} onCommand={onCommand} onDirty={sectionChanged} />
    {hasDrafts && <p role="status">Antes de marcar Medido, guarda los cambios pendientes de { [dirty && "Medidas en obra", technicalDirty && "Detalles técnicos", sketchDirty && "Croquis"].filter(Boolean).join(", ") }.</p>}
    {!s.measuredAt && missing.length > 0 && <div className="metadata"><p>Pendiente de guardar o validar:</p><ul>{missing.map(field => <li key={field}>{field}</li>)}</ul></div>}
    {s.measuredAt && !s.technicalComplete && <p className="metadata">Medición histórica conservada. Si la desmarcas, deberás completar la ficha para volver a marcarla.</p>}
    <label className={styles.measured}><input type="checkbox" aria-label={`Medido ${s.id}`} checked={!!s.measuredAt} disabled={!canEdit || disabled || (!s.measuredAt && (hasDrafts || missing.length > 0 || s.technicalComplete === false))} onChange={e => onCommand({ action: "Measure", structureId: s.id, measured: e.target.checked })} />Medido</label>
    {s.measuredAt && <p className="metadata">{formatDate(s.measuredAt)}</p>}
    {canEdit && <button className="button-secondary" disabled={disabled} onClick={onRetire}>Retirar estructura {s.id.slice(0, 8)}</button>}
  </article>;
}
