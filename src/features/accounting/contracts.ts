import { ApiError } from "@/lib/api/apiError";
import { parseProjectTask } from "@/features/tasks/parser";
export interface AccountingState {
  projectId: string;
  accountingHandoff: { available: boolean; quotationRound: number | null; commercialQuotationId: string | null; sentAt: string | null };
  deposit: { available: boolean; amount: string | null; currencyCode: "COP"; receivedAt: string | null; recordedAt: string | null; reference: string | null; note: string | null };
}
function bad(): never { throw new ApiError(502); }
function obj(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return bad();
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) bad();
  return v;
}
function date(v: unknown): string { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)) ? v : bad(); }
function text(v: unknown, max: number): string | null { return v === null || typeof v === "string" && v.length <= max ? v : bad(); }
export function canonicalAmount(value: string): string | null {
  if (!/^(?:0|[1-9]\d{0,17})(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  const result = whole + "." + fraction.padEnd(2, "0");
  return /[1-9]/.test(result) ? result : null;
}
export function formatDeposit(value: string): string {
  const canonical = canonicalAmount(value); if (!canonical) return bad();
  const [whole, fraction] = canonical.split(".");
  return "$" + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + fraction + " COP";
}
export function parseAccounting(value: unknown, id: string): AccountingState {
  const v = obj(value, ["projectId", "accountingHandoff", "deposit"]);
  if (v.projectId !== id) bad();
  const h = obj(v.accountingHandoff, ["available", "quotationRound", "commercialQuotationId", "sentAt"]);
  const d = obj(v.deposit, ["available", "amount", "currencyCode", "receivedAt", "recordedAt", "reference", "note"]);
  if (typeof h.available !== "boolean" || typeof d.available !== "boolean" || d.currencyCode !== "COP") bad();
  if (!h.available && [h.quotationRound, h.commercialQuotationId, h.sentAt].some(x => x !== null)) bad();
  if (h.available && (typeof h.quotationRound !== "number" || !Number.isSafeInteger(h.quotationRound) || h.quotationRound <= 0
    || typeof h.commercialQuotationId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(h.commercialQuotationId))) bad();
  if (h.available) date(h.sentAt);
  if (!d.available && [d.amount, d.receivedAt, d.recordedAt, d.reference, d.note].some(x => x !== null)) bad();
  if (d.available) {
    if (!h.available || typeof d.amount !== "string" || !/^(?:0|[1-9]\d{0,17})\.\d{2}$/.test(d.amount) || !canonicalAmount(d.amount)) bad();
    if (Date.parse(date(d.receivedAt)) > Date.parse(date(d.recordedAt))) bad(); text(d.reference, 200); text(d.note, 2000);
  }
  return v as unknown as AccountingState;
}
export function parseAccountingWrite(value: unknown, id: string, operation: "send" | "record") {
  const v = obj(value, ["state", "task"]); const state = parseAccounting(v.state, id); const task = parseProjectTask(v.task, id);
  if (!state.accountingHandoff.available || task.type !== "RegisterInitialDeposit" || task.quotationRound !== null
    || (operation === "send" ? state.deposit.available || task.status !== "Pending" || task.startedAt !== null || task.completedAt !== null || task.leadTimeStatus !== "NotStarted"
      : !state.deposit.available || task.status !== "Completed" || task.startedAt !== state.deposit.recordedAt || task.completedAt !== state.deposit.recordedAt || task.leadTimeStatus !== "UntrackedLegacy")) bad();
  return { state, task };
}
