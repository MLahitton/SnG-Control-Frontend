"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import type { ItemValues } from "@/features/budgetQuotation/types";
import type { TechnicalDifference, TechnicalField } from "@/features/commercialQuotation/types";
import { commercialQuotationService } from "@/features/commercialQuotation/service";
import { formatCop } from "@/features/commercialQuotation/validation";
import { useResource } from "@/lib/api/useResource";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import { saveDownload } from "@/lib/api/saveDownload";
import { formatDate } from "@/lib/formatDate";
import { quotationViewService } from "./service";
import styles from "./QuotationReadViews.module.css";

const fields: Record<keyof ItemValues, string> = { itemNumber: "Ítem", location: "Ubicación", system: "Sistema", glass: "Vidrio",
  aluminumFinish: "Acabado", lockType: "Cerradura", observations: "Observaciones", width: "Ancho (m)", height: "Alto (m)", squareMeters: "Superficie (m²)", quantity: "Cantidad" };
function Values({ values }: { values: ItemValues }) {
  return <dl className={styles.fields}>{Object.entries(fields).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{values[key as keyof ItemValues] || "Sin valor"}</dd></div>)}</dl>;
}
function Differences({ differences, budget = false }: { differences: TechnicalDifference[]; budget?: boolean }) {
  if (!differences.length) return null;
  const label = (field: TechnicalField) => fields[`${field[0].toLowerCase()}${field.slice(1)}` as keyof ItemValues];
  return <details className={styles.differences}><summary>{budget ? "Ajustes frente a la extracción original" : "Cambios técnicos frente a Presupuestos"} ({differences.length})</summary>
    {differences.map(d => <div key={d.field}><h4>{label(d.field)}</h4><dl className={styles.fields}>
      <div><dt>{budget ? "Extraído" : "Presupuestos"}</dt><dd>{d.previousValue || "Sin valor"}</dd></div>
      <div><dt>{budget ? "Confirmado" : "Comercial"}</dt><dd>{d.currentValue || "Sin valor"}</dd></div>
    </dl></div>)}
  </details>;
}
function ItemImage({ projectId, itemId, number }: { projectId: string; itemId: string; number: string }) {
  const api = useApiClient();
  const [url, setUrl] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const operation = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);
  useEffect(() => () => { operation.current?.abort(); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  async function load() {
    if (operation.current || url) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError(undefined);
    try {
      const blob = await quotationViewService.image(api, projectId, itemId, controller.signal);
      if (controller.signal.aborted) return;
      objectUrl.current = URL.createObjectURL(blob); setUrl(objectUrl.current);
    } catch (failure) { if (!controller.signal.aborted) setError(failure); }
    finally { if (!controller.signal.aborted) { setBusy(false); operation.current = null; } }
  }
  return <div className={styles.image}>
    {/* Authenticated blob URLs must not go through the public Next image optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {url ? <img src={url} alt={`Imagen confirmada del ítem ${number}`} /> : <button className="button-secondary" disabled={busy} onClick={() => void load()}>{busy ? "Cargando imagen…" : `Ver imagen del ítem ${number}`}</button>}
    <ErrorNotice error={error} />
  </div>;
}
export function BudgetQuotationReadView({ projectId }: { projectId: string }) {
  const api = useApiClient();
  const load = useCallback((signal: AbortSignal) => quotationViewService.budget(api, projectId, signal), [api, projectId]);
  const resource = useResource(load);
  const view = resource.data;
  if (resource.loading) return <p role="status" className={styles.feedback}>Consultando cotización confirmada de Presupuestos…</p>;
  if (resource.error) return <div className={styles.feedback}><p>Cotización confirmada de Presupuestos</p><ErrorNotice error={resource.error} retry={resource.refresh} /></div>;
  if (!view) return null;
  const d = view.document;
  return <section aria-labelledby="budget-read-title" className={styles.panel}>
    <h2 id="budget-read-title">Cotización de Presupuestos confirmada</h2><p className={styles.muted}>Snapshot confirmado · Solo lectura</p>
    <dl className={styles.fields}>{[["Versión", view.versionNumber], ["Confirmada", formatDate(view.confirmedAt)], ["SG", d.sgCode], ["Archivo", d.fileName],
      ["Cliente", d.clientName], ["Proyecto", d.projectName], ["Ubicación", d.location], ["Línea de cliente", d.clientLine], ["Línea de producción", d.productionLine], ["Preparada por", d.preparedBy]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Sin valor"}</dd></div>)}</dl>
    <div className={styles.items}>{view.items.map(item => <article className={styles.item} key={`${item.section}:${item.sourceRow}`}>
      <p className={styles.muted}>{item.section === "Main" ? "Principales" : "Adicionales"} · Fila {item.sourceRow}</p><h3>Ítem {item.confirmed.itemNumber}</h3>
      <Values values={item.confirmed} /><Differences differences={item.technicalDifferences} budget />
      {item.hasImage ? <ItemImage projectId={projectId} itemId={item.id} number={item.confirmed.itemNumber} /> : <p className={styles.muted}>{item.imageStatus === "Ambiguous" ? "Imagen ambigua en el archivo original" : "Sin imagen persistida"}</p>}
    </article>)}</div>
  </section>;
}
function FinalDownload({ projectId }: { projectId: string }) {
  const api = useApiClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  async function download() {
    if (operation.current) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError(undefined);
    try { await saveDownload(() => commercialQuotationService.download(api, projectId, true, controller.signal), "cotizacion-comercial.xlsx", controller.signal); }
    catch (failure) { if (!controller.signal.aborted) setError(failure); }
    finally { if (!controller.signal.aborted) { operation.current = null; setBusy(false); } }
  }
  return <div><button className="button-secondary" disabled={busy} onClick={() => void download()}>{busy ? "Descargando…" : "Descargar cotización final"}</button><ErrorNotice error={error} /></div>;
}
export function CommercialQuotationReadView({ projectId, allowDownload = false }: { projectId: string; allowDownload?: boolean }) {
  const api = useApiClient();
  const load = useCallback((signal: AbortSignal) => quotationViewService.commercial(api, projectId, signal), [api, projectId]);
  const resource = useResource(load);
  const view = resource.data;
  if (resource.loading) return <p role="status" className={styles.feedback}>Consultando cotización comercial confirmada…</p>;
  if (resource.error) return <div className={styles.feedback}><p>Cotización comercial confirmada</p><ErrorNotice error={resource.error} retry={resource.refresh} /></div>;
  if (!view) return null;
  return <section aria-labelledby="commercial-read-title" className={styles.panel}>
    <h2 id="commercial-read-title">Cotización Comercial confirmada</h2><p className={styles.muted}>Snapshot confirmado · Solo lectura</p>
    <dl className={styles.fields}><div><dt>Confirmada</dt><dd>{formatDate(view.confirmedAt)}</dd></div><div><dt>Valor total del proyecto</dt><dd>{formatCop(view.projectTotal)}</dd></div></dl>
    {allowDownload && <FinalDownload projectId={projectId} />}
    <div className={styles.items}>{view.items.map(item => <article className={styles.item} key={`${item.section}:${item.sourceRow}`}>
      <p className={styles.muted}>{item.section === "Main" ? "Principales" : "Adicionales"} · Fila {item.sourceRow}</p><h3>Ítem {item.values.itemNumber}</h3>
      <Values values={item.values} />
      <dl className={styles.fields}><div><dt>Precio unitario</dt><dd>{formatCop(item.unitPrice)}</dd></div><div><dt>Precio total</dt><dd>{formatCop(item.totalPrice)}</dd></div></dl>
      <Differences differences={item.technicalDifferences} />
      {item.hasImage ? <ItemImage projectId={projectId} itemId={item.commercialCatalogItemId} number={item.values.itemNumber} /> : <p className={styles.muted}>{item.imageStatus === "Ambiguous" ? "Imagen ambigua en el archivo original" : "Sin imagen persistida"}</p>}
    </article>)}</div>
  </section>;
}
