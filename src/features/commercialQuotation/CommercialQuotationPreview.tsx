import { formatProposalValue as formatTechnicalValue } from "@/features/quotationViews/proposalFormat";
import { ProposalTotals, ItemSurface, ItemPrices } from "@/features/quotationViews/ProposalSummary";
import { ItemImage } from "@/features/quotationViews/ItemImage";
import type { CommercialQuotationPreviewResponse, TechnicalField, TechnicalDifference } from "./types";
import styles from "./CommercialQuotation.module.css";

const labels: Record<TechnicalField, string> = { ItemNumber: "Número", Location: "Ubicación", System: "Sistema", Glass: "Cristal",
  AluminumFinish: "Acabado", LockType: "Cerradura", Observations: "Observaciones", Width: "Ancho (mm)", Height: "Alto (mm)", SquareMeters: "Superficie total del ítem (m²)", Quantity: "Cantidad" };

function Differences({ differences }: { differences: TechnicalDifference[] }) {
  if (!differences.length) return <p className={styles.muted}>Sin cambios técnicos frente a Presupuestos.</p>;
  return <div className={styles.differences}><h5>Cambios frente a Presupuestos</h5>
    {differences.map((d) => <div key={d.field} className={styles.change}><h6>{labels[d.field]}</h6>
      <dl className={styles.comparison}><div><dt>Antes (Presupuestos)</dt><dd>{formatTechnicalValue(d.field, d.previousValue) || "Sin valor"}</dd></div>
        <div><dt>Ahora (Comercial)</dt><dd>{formatTechnicalValue(d.field, d.currentValue) || "Sin valor"}</dd></div></dl>
    </div>)}
  </div>;
}
export function CommercialQuotationPreview({ preview }: { preview: CommercialQuotationPreviewResponse }) {
  return <section aria-labelledby="commercial-preview-title" className={styles.stack}>
    <h3 id="commercial-preview-title">Resumen de propuesta</h3><p>Propuesta comercial para revisión · Ronda {preview.quotationRound} · Pendiente de confirmación</p><p className={styles.muted}>Solo lectura. Para cambiar valores, edita el archivo en Excel y genera un nuevo preview.</p>
    <dl className={styles.summary}>
      <div><dt>Ítems</dt><dd>{preview.items.length}</dd></div><div><dt>Cambios técnicos</dt><dd>{preview.technicalDifferencesCount}</dd></div></dl>
    <ProposalTotals items={preview.items.map(item => item.values)} projectTotal={preview.projectTotal} />
    <div className={styles.items}>{preview.items.map((item, index) => <article key={`${item.section}:${item.sourceRow}`} aria-labelledby={`commercial-item-${index}`} className={styles.item}>
      <p className={styles.muted}>{item.section === "Main" ? "Principales" : "Adicionales"} · Fila {item.sourceRow}</p>
      <h4 id={`commercial-item-${index}`}>Ítem {item.values.itemNumber}</h4>
      <dl className={styles.values}>{Object.entries(labels).filter(([field]) => field !== "SquareMeters").map(([field, label]) => {
        const key = `${field[0].toLowerCase()}${field.slice(1)}` as keyof typeof item.values;
        return <div key={field}><dt>{label}</dt><dd>{item.values[key] === "" ? "Sin valor" : formatTechnicalValue(field, item.values[key])}</dd></div>;
      })}</dl>
      <ItemSurface {...item.values} /><ItemPrices unitPrice={item.unitPrice} totalPrice={item.totalPrice} />
      <ItemImage projectId={preview.projectId} itemId={item.commercialCatalogItemId} number={item.values.itemNumber} />
      <Differences differences={item.technicalDifferences} />
    </article>)}</div>
  </section>;
}
