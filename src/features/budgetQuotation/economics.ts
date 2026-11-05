import { ApiError } from "@/lib/api/apiError";
import type { ItemKey } from "./types";

export interface BudgetEconomics {
  status: "Success" | "InvalidEconomics" | "RecalculationRequired" | "InconsistentFormulaCache" | "OriginalUnavailable";
  currencyCode: "COP"; projectTotal: string | null; projectTotalCell: string | null;
  items: (ItemKey & { unitPrice: string; totalPrice: string })[]; mainItemTotalsDiffer: boolean | null;
}
export const economicsKeys = (value: unknown) =>
  value && typeof value === "object" && Object.hasOwn(value, "economics") ? ["economics"] : [];
function invalid(): never { throw new ApiError(502); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) invalid();
  return v;
}
function money(value: unknown): string {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,26})\.[0-9]{2}$/.test(value) ? value : invalid();
}
export function parseEconomics(value: unknown, rows: ItemKey[]): BudgetEconomics | undefined {
  if (value === undefined || value === null) return undefined;
  const v = object(value, ["status", "currencyCode", "projectTotal", "projectTotalCell", "items", "mainItemTotalsDiffer"]);
  if (v.currencyCode !== "COP" || !Array.isArray(v.items)) invalid();
  if (v.status !== "Success") {
    if (!["InvalidEconomics", "RecalculationRequired", "InconsistentFormulaCache", "OriginalUnavailable"].includes(v.status as string)
      || v.projectTotal !== null || v.projectTotalCell !== null || v.mainItemTotalsDiffer !== null || v.items.length) invalid();
    return { ...v, items: [] } as unknown as BudgetEconomics;
  }
  if (typeof v.projectTotalCell !== "string" || !/^O[1-9][0-9]*$/.test(v.projectTotalCell)
    || typeof v.mainItemTotalsDiffer !== "boolean") invalid();
  const items = v.items.map(entry => {
    const i = object(entry, ["section", "sourceRow", "unitPrice", "totalPrice"]);
    const row = rows.find(r => r.section === i.section && r.sourceRow === i.sourceRow);
    if (!row) return invalid();
    return { section: row.section, sourceRow: row.sourceRow, unitPrice: money(i.unitPrice), totalPrice: money(i.totalPrice) };
  });
  if (items.length !== rows.length || new Set(items.map(i => `${i.section}:${i.sourceRow}`)).size !== rows.length) invalid();
  return { status: "Success", currencyCode: "COP", projectTotal: money(v.projectTotal),
    projectTotalCell: v.projectTotalCell, items, mainItemTotalsDiffer: v.mainItemTotalsDiffer };
}
export function itemEconomics(economics: BudgetEconomics | undefined, row: ItemKey) {
  return economics?.items.find(i => i.section === row.section && i.sourceRow === row.sourceRow);
}
