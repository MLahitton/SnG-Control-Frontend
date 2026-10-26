import { ApiError } from "@/lib/api/apiError";
import type { ProjectTask } from "@/features/tasks/types";
import type { BudgetQuotationPreviewResponse, ConfirmedBudgetQuotationResponse, ItemValues, QuotationDocument, BudgetQuotationStatusResponse, SendToCommercialResponse } from "./types";

export const valueFields = ["itemNumber", "location", "system", "glass", "aluminumFinish", "lockType", "observations", "width", "height", "squareMeters", "quantity"] as const;
export const imageTypes = ["image/png", "image/jpeg", "image/gif", "image/bmp", "image/tiff"] as const;
function invalid(): never { throw new ApiError(502); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key))) return invalid();
  return result;
}
function string(value: unknown): string { return typeof value === "string" ? value : invalid(); }
function required(value: unknown): string { const result = string(value); return result.trim() ? result : invalid(); }
function positive(value: unknown, integer = false): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && (!integer || Number.isSafeInteger(value)) ? value : invalid();
}
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  return typeof value === "string" && values.includes(value as T) ? value as T : invalid();
}
function list<T>(value: unknown, parse: (item: unknown) => T): T[] { return Array.isArray(value) ? value.map(parse) : invalid(); }
function date(value: unknown): string { const result = required(value); return Number.isFinite(Date.parse(result)) ? result : invalid(); }
function nullable<T>(value: unknown, parse: (v: unknown) => T): T | null { return value === null ? null : parse(value); }
function key(value: Record<string, unknown>) {
  return { section: choice(value.section, ["Main", "Additional"]), sourceRow: positive(value.sourceRow, true) };
}
function values(value: Record<string, unknown>): ItemValues {
  return { itemNumber: required(value.itemNumber), location: string(value.location), system: string(value.system),
    glass: string(value.glass), aluminumFinish: string(value.aluminumFinish), lockType: string(value.lockType),
    observations: string(value.observations), width: positive(value.width), height: positive(value.height),
    squareMeters: positive(value.squareMeters), quantity: positive(value.quantity, true) };
}
function document(value: unknown): QuotationDocument {
  const v = object(value, ["fileName", "clientName", "projectName", "location", "clientLine", "productionLine", "preparedBy", "sgCode"]);
  return { fileName: required(v.fileName), clientName: string(v.clientName), projectName: string(v.projectName), location: string(v.location),
    clientLine: string(v.clientLine), productionLine: string(v.productionLine), preparedBy: string(v.preparedBy), sgCode: required(v.sgCode) };
}
function uniqueRows(items: { sourceRow: number }[], count: number) {
  if (items.length !== count || new Set(items.map((item) => item.sourceRow)).size !== count) invalid();
}
export function parsePreview(value: unknown, projectId: string): BudgetQuotationPreviewResponse {
  const v = object(value, ["projectId", "projectSgCode", "document", "itemCount", "totalQuantity", "items", "warnings"]);
  if (required(v.projectId) !== projectId) invalid();
  const items = list(v.items, (entry) => {
    const item = object(entry, [...valueFields, "section", "sourceRow", "image"]);
    const image = nullable(item.image, (entry) => {
      const img = object(entry, ["contentType", "base64"]);
      const contentType = choice(img.contentType, imageTypes);
      const base64 = required(img.base64);
      if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) invalid();
      return { contentType, base64 };
    });
    return { ...key(item), ...values(item), image };
  });
  const itemCount = positive(v.itemCount, true);
  uniqueRows(items, itemCount);
  const warnings = list(v.warnings, (entry) => {
    const w = object(entry, ["code", "itemNumber", "sourceRow", "message"]);
    const warning = { code: choice(w.code, ["MissingImage", "AmbiguousImage"]), itemNumber: required(w.itemNumber), sourceRow: positive(w.sourceRow, true), message: string(w.message) };
    if (!items.some((item) => item.sourceRow === warning.sourceRow && item.itemNumber === warning.itemNumber)) invalid();
    return warning;
  });
  return { projectId, projectSgCode: required(v.projectSgCode), document: document(v.document), itemCount, totalQuantity: positive(v.totalQuantity, true), items, warnings };
}
function task(value: unknown, projectId: string, type: "PrepareQuotation" | "ReviewQuotation" = "PrepareQuotation"): ProjectTask {
  const v = object(value, ["id", "projectId", "area", "type", "status", "assignedAt", "startedAt", "completedAt", "assignedToGoogleSubject", "deadlineAt", "wasOverdue", "LeadTimeStatus"]);
  if (required(v.projectId) !== projectId) invalid();
  return { id: required(v.id), projectId, area: choice(v.area, [type === "PrepareQuotation" ? "Budgets" : "Commercial"]), type: choice(v.type, [type]),
    status: choice(v.status, ["Pending", "InProgress", "Completed"]), assignedAt: date(v.assignedAt), startedAt: nullable(v.startedAt, date),
    completedAt: nullable(v.completedAt, date), deadlineAt: nullable(v.deadlineAt, date), assignedToGoogleSubject: nullable(v.assignedToGoogleSubject, required),
    wasOverdue: nullable(v.wasOverdue, (b) => typeof b === "boolean" ? b : invalid()),
    LeadTimeStatus: choice(v.LeadTimeStatus, ["NotStarted", "OnTrack", "DueSoon", "DueToday", "Overdue", "CompletedOnTime", "CompletedLate", "UntrackedLegacy"]) };
}

export function parseStatus(value: unknown, projectId: string): BudgetQuotationStatusResponse {
  const v = object(value, ["projectId", "status", "versionNumber", "confirmedAt", "itemCount", "totalQuantity", "documentSgCode", "currentProjectSgCode", "canSendToCommercial", "sendBlockReason"]);
  if (required(v.projectId) !== projectId || typeof v.canSendToCommercial !== "boolean") invalid();
  const status = choice(v.status, ["NotConfirmed", "Confirmed", "SentToCommercial"]);
  const sendBlockReason = choice(v.sendBlockReason, ["None", "SgChangedAfterConfirmation", "InvalidState"]);
  const versionNumber = nullable(v.versionNumber, (n) => positive(n, true));
  const confirmedAt = nullable(v.confirmedAt, date);
  const documentSgCode = nullable(v.documentSgCode, required);
  const currentProjectSgCode = nullable(v.currentProjectSgCode, required);
  const count = (n: unknown) => n === 0 ? 0 : positive(n, true);
  const itemCount = count(v.itemCount), totalQuantity = count(v.totalQuantity);
  if (status === "NotConfirmed" && (versionNumber !== null || confirmedAt !== null || documentSgCode !== null || itemCount !== 0 || totalQuantity !== 0 || v.canSendToCommercial || sendBlockReason !== "None")) invalid();
  if (status !== "NotConfirmed" && (versionNumber === null || confirmedAt === null || documentSgCode === null)) invalid();
  if (status === "SentToCommercial" && (v.canSendToCommercial || sendBlockReason !== "None")) invalid();
  if (status === "Confirmed" && (v.canSendToCommercial !== (sendBlockReason === "None"))) invalid();
  return { projectId, status, versionNumber, confirmedAt, itemCount, totalQuantity, documentSgCode, currentProjectSgCode, canSendToCommercial: v.canSendToCommercial, sendBlockReason };
}

export function parseSendToCommercial(value: unknown, projectId: string): SendToCommercialResponse {
  const v = object(value, ["projectId", "budgetTask", "commercialTask", "quotationVersionId", "commercialCatalogId", "commercialFileAvailable"]);
  if (required(v.projectId) !== projectId || typeof v.commercialFileAvailable !== "boolean") invalid();
  const budgetTask = task(v.budgetTask, projectId), commercialTask = task(v.commercialTask, projectId, "ReviewQuotation");
  if (budgetTask.status !== "Completed" || commercialTask.status !== "InProgress") invalid();
  return { projectId, budgetTask, commercialTask, quotationVersionId: required(v.quotationVersionId), commercialCatalogId: required(v.commercialCatalogId), commercialFileAvailable: v.commercialFileAvailable };
}
export function parseConfirmation(value: unknown, projectId: string): ConfirmedBudgetQuotationResponse {
  const v = object(value, ["quotationVersionId", "versionNumber", "commercialCatalogId", "projectId", "confirmedAt", "document", "itemCount", "totalQuantity", "items", "prepareQuotationTask"]);
  if (required(v.projectId) !== projectId) invalid();
  const items = list(v.items, (entry) => {
    const i = object(entry, ["id", "section", "sourceRow", "extracted", "confirmed", "image"]);
    const image = object(i.image, ["status", "contentType"]);
    return { id: required(i.id), ...key(i), extracted: values(object(i.extracted, valueFields)), confirmed: values(object(i.confirmed, valueFields)),
      image: { status: choice(image.status, ["Stored", "Missing", "Ambiguous"]), contentType: nullable(image.contentType, (type) => choice(type, imageTypes)) } };
  });
  const itemCount = positive(v.itemCount, true);
  uniqueRows(items, itemCount);
  if (new Set(items.map((i) => i.id)).size !== itemCount) invalid();
  return { quotationVersionId: required(v.quotationVersionId), commercialCatalogId: required(v.commercialCatalogId), versionNumber: positive(v.versionNumber, true),
    projectId, confirmedAt: date(v.confirmedAt), document: document(v.document), itemCount, totalQuantity: positive(v.totalQuantity, true), items, prepareQuotationTask: task(v.prepareQuotationTask, projectId) };
}

export function parseItemValues(value: unknown): ItemValues { return values(object(value, valueFields)); }
export { document as parseQuotationDocument };
