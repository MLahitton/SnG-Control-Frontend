import type { CommercialQuotationPreviewResponse, TechnicalField, TechnicalDifference } from "./types";
import { formatCop } from "./validation";
import styles from "./CommercialQuotation.module.css";

const labels: Record<TechnicalField, string> = { ItemNumber: "Número", Location: "Ubicación", System: "Sistema", Glass: "Cristal",
  AluminumFinish: "Acabado", LockType: "Cerradura", Observations: "Observaciones", Width: "Ancho (m)", Height: "Alto (m)", SquareMeters: "Superficie (m²)", Quantity: "Cantidad" };

function Differences({ differences }: { differences: TechnicalDifference[] }) {
  if (!differences.length) return <p className={styles.muted}>Sin cambios técnicos frente a Presupuestos.</p>;
  return <div className={styles.differences}><h5>Cambios frente a Presupuestos</h5>
    {differences.map((d) => <div key={d.field} className={styles.change}><h6>{labels[d.field]}</h6>
      <dl className={styles.comparison}><div><dt>Antes (Presupuestos)</dt><dd>{d.previousValue || "Sin valor"}</dd></div>
        <div><dt>Ahora (Comercial)</dt><dd>{d.currentValue || "Sin valor"}</dd></div></dl>
    </div>)}
  </div>;
}
export function CommercialQuotationPreview({ preview }: { preview: CommercialQuotationPreviewResponse }) {
  return <section aria-labelledby="commercial-preview-title" className={styles.stack}>
    <h3 id="commercial-preview-title">Preview comercial</h3><p className={styles.muted}>Solo lectura. Para cambiar valores, edita el archivo en Excel y genera un nuevo preview.</p>
    <dl className={styles.summary}><div><dt>Valor total del proyecto</dt><dd>{formatCop(preview.projectTotal)}</dd></div>
      <div><dt>Ítems</dt><dd>{preview.items.length}</dd></div><div><dt>Cambios técnicos</dt><dd>{preview.technicalDifferencesCount}</dd></div></dl>
    <div className={styles.items}>{preview.items.map((item, index) => <article key={`${item.section}:${item.sourceRow}`} aria-labelledby={`commercial-item-${index}`} className={styles.item}>
      <p className={styles.muted}>{item.section === "Main" ? "Principales" : "Adicionales"} · Fila {item.sourceRow}</p>
      <h4 id={`commercial-item-${index}`}>Ítem {item.values.itemNumber}</h4>
      <dl className={styles.values}>{Object.entries(labels).map(([field, label]) => {
        const key = `${field[0].toLowerCase()}${field.slice(1)}` as keyof typeof item.values;
        return <div key={field}><dt>{label}</dt><dd>{item.values[key] === "" ? "Sin valor" : item.values[key]}</dd></div>;
      })}</dl>
      <dl className={styles.prices}><div><dt>Precio unitario</dt><dd>{formatCop(item.unitPrice)}</dd></div><div><dt>Precio total</dt><dd>{formatCop(item.totalPrice)}</dd></div></dl>
      <Differences differences={item.technicalDifferences} />
    </article>)}</div>
  </section>;
}
