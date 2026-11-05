import { metresToMm } from "@/features/measurements/units";
import { formatCop } from "@/features/commercialQuotation/validation";
const area = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const length = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 6 });
export const formatSurface = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "No disponible" : `${area.format(value)} m²`;
export const formatProposalMoney = (value: number | null | undefined) =>
  value == null ? "No disponible en esta etapa" : formatCop(value);
export function formatProposalValue(field: string, value: string | number): string {
  const key = field.toLowerCase();
  if (key === "squaremeters") return formatSurface(Number(value));
  if (key === "width" || key === "height") return `${length.format(metresToMm(Number(value)))} mm`;
  return String(value);
}
export const unitSurface = (total: number, quantity: number) => quantity > 0 ? total / quantity : null;
// SquareMeters is already the complete item area (Excel column L includes quantity).
// This aggregates technical areas only; monetary totals always come from the document.
export function proposalTotals(items: readonly { squareMeters: number; quantity: number }[]) {
  if (items.some(i => !Number.isFinite(i.squareMeters) || i.squareMeters < 0 || !Number.isSafeInteger(i.quantity) || i.quantity <= 0))
    return { units: null, surface: null };
  return { units: items.reduce((n, i) => n + i.quantity, 0), surface: items.reduce((n, i) => n + i.squareMeters, 0) };
}
