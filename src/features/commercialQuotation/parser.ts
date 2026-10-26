import { ApiError } from "@/lib/api/apiError";
import type { ProjectTask } from "@/features/tasks/types";
import { technicalFields, type CommercialQuotationPreviewResponse, type CommercialQuotationConfirmationResponse, type CommercialValues } from "./types";

function invalid(): never { throw new ApiError(502); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== keys.length || keys.some((key) => !Object.hasOwn(v, key))) invalid();
  return v;
}
function text(value: unknown, required = false): string {
  return typeof value === "string" && (!required || !!value.trim()) ? value : invalid();
}
function number(value: unknown, positive = false, integer = false): number {
  return typeof value === "number" && Number.isFinite(value) && (positive ? value > 0 : value >= 0)
    && (!integer || Number.isSafeInteger(value)) ? value : invalid();
}
function bool(value: unknown): boolean { return typeof value === "boolean" ? value : invalid(); }
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  return typeof value === "string" && choices.includes(value as T) ? value as T : invalid();
}
function nullable<T>(value: unknown, parse: (value: unknown) => T): T | null { return value === null ? null : parse(value); }
function date(value: unknown): string { const v = text(value, true); return Number.isFinite(Date.parse(v)) ? v : invalid(); }
function list<T>(value: unknown, parse: (v: unknown) => T): T[] { return Array.isArray(value) ? value.map(parse) : invalid(); }
function values(value: unknown): CommercialValues {
  const v = object(value, ["itemNumber", "location", "system", "glass", "aluminumFinish", "lockType", "observations", "width", "height", "squareMeters", "quantity"]);
  return { itemNumber: text(v.itemNumber, true), location: text(v.location), system: text(v.system), glass: text(v.glass),
    aluminumFinish: text(v.aluminumFinish), lockType: text(v.lockType), observations: text(v.observations),
    width: number(v.width, true), height: number(v.height, true), squareMeters: number(v.squareMeters, true), quantity: number(v.quantity, true, true) };
}
function differencesSummary(v: Record<string, unknown>) {
  const technicalDifferencesCount = number(v.technicalDifferencesCount, false, true), hasTechnicalDifferences = bool(v.hasTechnicalDifferences);
  if (hasTechnicalDifferences !== (technicalDifferencesCount > 0)) invalid();
  return { technicalDifferencesCount, hasTechnicalDifferences };
}
export function parsePreview(value: unknown, projectId: string): CommercialQuotationPreviewResponse {
  const v = object(value, ["projectId", "projectTotal", "items", "technicalDifferencesCount", "hasTechnicalDifferences"]);
  if (text(v.projectId, true) !== projectId) invalid();
  const items = list(v.items, (entry) => {
    const i = object(entry, ["section", "sourceRow", "commercialCatalogItemId", "values", "unitPrice", "totalPrice", "technicalDifferences"]);
    const technicalDifferences = list(i.technicalDifferences, (entry) => {
      const d = object(entry, ["field", "previousValue", "currentValue"]);
      return { field: choice(d.field, technicalFields), previousValue: text(d.previousValue), currentValue: text(d.currentValue) };
    });
    if (new Set(technicalDifferences.map((d) => d.field)).size !== technicalDifferences.length) invalid();
    return { section: choice(i.section, ["Main", "Additional"]), sourceRow: number(i.sourceRow, true, true),
      commercialCatalogItemId: text(i.commercialCatalogItemId, true), values: values(i.values),
      unitPrice: number(i.unitPrice), totalPrice: number(i.totalPrice), technicalDifferences };
  });
  const summary = differencesSummary(v);
  if (!items.length || new Set(items.map((i) => `${i.section}:${i.sourceRow}`)).size !== items.length
    || new Set(items.map((i) => i.commercialCatalogItemId)).size !== items.length
    || items.reduce((count, i) => count + i.technicalDifferences.length, 0) !== summary.technicalDifferencesCount) invalid();
  return { projectId, projectTotal: number(v.projectTotal), items, ...summary };
}
function task(value: unknown, projectId: string, type: "ReviewQuotation" | "PresentQuotationToClient"): ProjectTask {
  const v = object(value, ["id", "projectId", "area", "type", "status", "assignedAt", "startedAt", "completedAt", "assignedToGoogleSubject", "deadlineAt", "wasOverdue", "leadTimeStatus"]);
  if (text(v.projectId, true) !== projectId) invalid();
  return { id: text(v.id, true), projectId, area: choice(v.area, ["Commercial"]), type: choice(v.type, [type]),
    status: choice(v.status, [type === "ReviewQuotation" ? "Completed" : "InProgress"]), assignedAt: date(v.assignedAt),
    startedAt: nullable(v.startedAt, date), completedAt: nullable(v.completedAt, date), deadlineAt: nullable(v.deadlineAt, date),
    assignedToGoogleSubject: nullable(v.assignedToGoogleSubject, (v) => text(v, true)), wasOverdue: nullable(v.wasOverdue, bool),
    leadTimeStatus: choice(v.leadTimeStatus, ["NotStarted", "OnTrack", "DueSoon", "DueToday", "Overdue", "CompletedOnTime", "CompletedLate", "UntrackedLegacy"]) };
}
export function parseConfirmation(value: unknown, projectId: string): CommercialQuotationConfirmationResponse {
  const v = object(value, ["projectId", "commercialQuotationId", "projectTotal", "commercialFileAvailable", "reviewTask", "presentQuotationToClientTask", "hasTechnicalDifferences", "technicalDifferencesCount"]);
  if (text(v.projectId, true) !== projectId) invalid();
  return { projectId, commercialQuotationId: text(v.commercialQuotationId, true), projectTotal: number(v.projectTotal),
    commercialFileAvailable: bool(v.commercialFileAvailable), reviewTask: task(v.reviewTask, projectId, "ReviewQuotation"),
    presentQuotationToClientTask: task(v.presentQuotationToClientTask, projectId, "PresentQuotationToClient"), ...differencesSummary(v) };
}
