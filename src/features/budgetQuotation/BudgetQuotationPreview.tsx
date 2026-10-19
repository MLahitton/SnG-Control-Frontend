import { Fragment } from "react";
import type { BudgetQuotationPreviewResponse, ItemDraft } from "./types";
import { BudgetQuotationItemEditor } from "./BudgetQuotationItemEditor";
import styles from "./BudgetQuotation.module.css";

export function BudgetQuotationPreview({ preview, draft, disabled, onChange }: {
  preview: BudgetQuotationPreviewResponse; draft: ItemDraft[]; disabled: boolean;
  onChange: (index: number, field: keyof ItemDraft, value: string) => void;
}) {
  const d = preview.document;
  const facts = [["Archivo", d.fileName], ["SG del documento", d.sgCode], ["SG del proyecto", preview.projectSgCode],
    ["Cliente", d.clientName], ["Proyecto", d.projectName], ["Ubicación", d.location], ["Preparado por", d.preparedBy],
    ["Línea de cliente", d.clientLine], ["Línea de producción", d.productionLine], ["Cantidad de ítems", preview.itemCount], ["Cantidad total", preview.totalQuantity]];
  return <div className={styles.stack}>
    <h3 className={styles.title}>Preview técnico</h3>
    <dl className={styles.summary}>{facts.filter(([, value]) => value !== "").map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {!!preview.warnings.length && <aside className={styles.warnings} aria-label="Advertencias de extracción">
      <h4>Advertencias de extracción</h4><p>Estas advertencias no impiden confirmar la cotización.</p>
      <ul>{preview.warnings.map((w, i) => <li key={i}>Ítem {w.itemNumber}: {w.message}</li>)}</ul>
    </aside>}
    <p>Revisa los datos extraídos. Puedes corregir los once campos técnicos; las medidas no se recalculan automáticamente.</p>
    {preview.items.map((item, index) => <Fragment key={`${item.section}:${item.sourceRow}`}>
      {(index === 0 || preview.items[index - 1].section !== item.section) && <h3 className={styles.title}>{item.section === "Main" ? "Principales" : "Adicionales"}</h3>}
      <BudgetQuotationItemEditor item={item} draft={draft[index]} disabled={disabled}
        ambiguous={preview.warnings.some((w) => w.sourceRow === item.sourceRow && w.code === "AmbiguousImage")}
        onChange={(field, value) => onChange(index, field, value)} />
    </Fragment>)}
  </div>;
}
