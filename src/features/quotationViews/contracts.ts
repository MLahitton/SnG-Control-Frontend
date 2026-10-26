import { ApiError } from "@/lib/api/apiError";
import { parseItemValues, parseQuotationDocument } from "@/features/budgetQuotation/parser";
import type { ItemValues, ItemKey, QuotationDocument } from "@/features/budgetQuotation/types";
import { technicalFields, type TechnicalDifference, type CommercialQuotationItem } from "@/features/commercialQuotation/types";

export interface BudgetReadItem extends ItemKey {
  id: string; confirmed: ItemValues; extracted: ItemValues | null;
  imageStatus: "Stored" | "Missing" | "Ambiguous" | null; hasImage: boolean; technicalDifferences: TechnicalDifference[];
}
export interface BudgetReadView {
  projectId: string; quotationVersionId: string; versionNumber: number; confirmedAt: string;
  document: QuotationDocument; items: BudgetReadItem[];
}
export interface CommercialReadView {
  projectId: string; commercialQuotationId: string; confirmedAt: string; projectTotal: number; items: (CommercialQuotationItem & Pick<BudgetReadItem, "imageStatus" | "hasImage">)[];
}
function invalid(): never { throw new ApiError(502); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) invalid();
  return v;
}
function text(v: unknown): string { return typeof v === "string" ? v : invalid(); }
function id(v: unknown): string { const result = text(v); return result.trim() ? result : invalid(); }
function date(v: unknown): string { const result = id(v); return Number.isFinite(Date.parse(result)) ? result : invalid(); }
function number(v: unknown, positive = false): number { return typeof v === "number" && Number.isFinite(v) && (positive ? v > 0 && Number.isSafeInteger(v) : v >= 0) ? v : invalid(); }
function key(v: Record<string, unknown>): ItemKey {
  return { section: v.section === "Main" || v.section === "Additional" ? v.section : invalid(), sourceRow: number(v.sourceRow, true) };
}
function list<T>(v: unknown, parse: (v: unknown) => T): T[] { return Array.isArray(v) ? v.map(parse) : invalid(); }
function differences(v: unknown): TechnicalDifference[] {
  const result = list(v, entry => {
    const d = object(entry, ["field", "previousValue", "currentValue"]);
    if (!technicalFields.includes(d.field as TechnicalDifference["field"])) invalid();
    return { field: d.field as TechnicalDifference["field"], previousValue: text(d.previousValue), currentValue: text(d.currentValue) };
  });
  if (new Set(result.map(d => d.field)).size !== result.length) invalid();
  return result;
}
function unique(items: ItemKey[], ids: string[]) {
  if (!items.length || new Set(items.map(i => `${i.section}:${i.sourceRow}`)).size !== items.length || new Set(ids).size !== ids.length) invalid();
}
export function parseBudgetView(value: unknown, projectId: string): BudgetReadView {
  const v = object(value, ["projectId", "quotationVersionId", "versionNumber", "confirmedAt", "document", "items"]);
  if (v.projectId !== projectId) invalid();
  const items = list<BudgetReadItem>(v.items, entry => {
    const i = object(entry, ["id", "section", "sourceRow", "confirmed", "extracted", "imageStatus", "hasImage", "technicalDifferences"]);
    const imageStatus = i.imageStatus;
    if (imageStatus !== null && imageStatus !== "Stored" && imageStatus !== "Missing" && imageStatus !== "Ambiguous") invalid();
    if (typeof i.hasImage !== "boolean" || (i.hasImage && imageStatus !== "Stored")) invalid();
    return { ...key(i), id: id(i.id), confirmed: parseItemValues(i.confirmed), extracted: i.extracted === null ? null : parseItemValues(i.extracted),
      imageStatus, hasImage: i.hasImage, technicalDifferences: differences(i.technicalDifferences) };
  });
  unique(items, items.map(i => i.id));
  return { projectId, quotationVersionId: id(v.quotationVersionId), versionNumber: number(v.versionNumber, true), confirmedAt: date(v.confirmedAt), document: parseQuotationDocument(v.document), items };
}
export function parseCommercialView(value: unknown, projectId: string): CommercialReadView {
  const v = object(value, ["projectId", "commercialQuotationId", "confirmedAt", "projectTotal", "items"]);
  if (v.projectId !== projectId) invalid();
  const items = list(v.items, entry => {
    const i = object(entry, ["section", "sourceRow", "commercialCatalogItemId", "values", "unitPrice", "totalPrice", "technicalDifferences", "imageStatus", "hasImage"]);
    const imageStatus = i.imageStatus as BudgetReadItem["imageStatus"];
    if (imageStatus !== null && imageStatus !== "Stored" && imageStatus !== "Missing" && imageStatus !== "Ambiguous") invalid();
    if (typeof i.hasImage !== "boolean" || (i.hasImage && imageStatus !== "Stored")) invalid();
    return { ...key(i), commercialCatalogItemId: id(i.commercialCatalogItemId), values: parseItemValues(i.values), unitPrice: number(i.unitPrice), totalPrice: number(i.totalPrice), technicalDifferences: differences(i.technicalDifferences), imageStatus, hasImage: i.hasImage };
  });
  unique(items, items.map(i => i.commercialCatalogItemId));
  return { projectId, commercialQuotationId: id(v.commercialQuotationId), confirmedAt: date(v.confirmedAt), projectTotal: number(v.projectTotal), items };
}
