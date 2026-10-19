import type { ItemDraft, ItemValues, PreviewItem } from "./types";
import styles from "./BudgetQuotation.module.css";

const labels: Record<keyof ItemValues, string> = {
  itemNumber: "Número de ítem", location: "Ubicación", system: "Sistema", glass: "Cristal", aluminumFinish: "Acabado de aluminio",
  lockType: "Cerradura", observations: "Observaciones", width: "Ancho (m)", height: "Alto (m)", squareMeters: "Superficie (m²)", quantity: "Cantidad",
};
const textFields = ["itemNumber", "location", "system", "glass", "aluminumFinish", "lockType", "observations"] as const;
const numericFields = ["width", "height", "squareMeters", "quantity"] as const;
export function BudgetQuotationItemEditor({ item, draft, ambiguous, disabled, onChange }: {
  item: PreviewItem; draft: ItemDraft; ambiguous: boolean; disabled: boolean; onChange: (field: keyof ItemDraft, value: string) => void;
}) {
  return <fieldset className={styles.item} disabled={disabled}>
    <legend>Ítem {item.itemNumber}</legend>
    <div className={styles.itemLayout}>
      <div className={styles.image}>
        {/* Inline, validated raster bytes from preview; never fetched from an external host. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {item.image ? <img src={`data:${item.image.contentType};base64,${item.image.base64}`} alt={`Imagen del ítem ${item.itemNumber}`} />
          : <p>{ambiguous ? "Imagen no asociada por ambigüedad" : "Sin imagen asociada"}</p>}
      </div>
      <div className={styles.fields}>
        {textFields.map((field) => <label key={field} className={`field-label ${field === "observations" ? styles.full : ""}`}>{labels[field]}
          {field === "observations" ? <textarea className="form-control" value={draft[field]} onChange={(e) => onChange(field, e.target.value)} rows={2} />
            : <input className="form-control" value={draft[field]} required={field === "itemNumber"} onChange={(e) => onChange(field, e.target.value)} />}
        </label>)}
        <div className={styles.measures}>{numericFields.map((field) => <label key={field} className="field-label">{labels[field]}
          <input className="form-control" type="number" step={field === "quantity" ? "1" : "any"} min={field === "quantity" ? "1" : "0"} required
            value={draft[field]} onChange={(e) => onChange(field, e.target.value)} />
        </label>)}</div>
      </div>
    </div>
  </fieldset>;
}
