import { formatProposalMoney, formatSurface, proposalTotals, unitSurface } from "./proposalFormat";
import styles from "./QuotationReadViews.module.css";
export function ProposalTotals({ items, projectTotal }: {
  items: readonly { squareMeters: number; quantity: number }[]; projectTotal?: number | string | null;
}) {
  const totals = proposalTotals(items);
  return <dl className={styles.totals} aria-label="Totales de propuesta">
    <div><dt>Total de unidades físicas</dt><dd>{totals.units ?? "No disponible"}</dd></div>
    <div><dt>Superficie total de propuesta</dt><dd>{formatSurface(totals.surface)}</dd></div>
    <div><dt>Valor total de propuesta (COP)</dt><dd>{formatProposalMoney(projectTotal)}</dd></div>
  </dl>;
}
export function ItemSurface({ squareMeters, quantity }: { squareMeters: number; quantity: number }) {
  return <dl className={styles.fields}>
    <div><dt>Superficie por unidad</dt><dd>{formatSurface(unitSurface(squareMeters, quantity))}</dd></div>
    <div><dt>Superficie total del ítem</dt><dd>{formatSurface(squareMeters)}</dd></div>
  </dl>;
}
export function ItemPrices({ unitPrice, totalPrice }: { unitPrice?: number | string | null; totalPrice?: number | string | null }) {
  return <dl className={styles.prices}>
    <div><dt>Precio unitario</dt><dd>{formatProposalMoney(unitPrice)}</dd></div>
    <div><dt>Subtotal del ítem (COP)</dt><dd>{formatProposalMoney(totalPrice)}</dd></div>
  </dl>;
}
