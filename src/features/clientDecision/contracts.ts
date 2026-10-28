import { ApiError } from "@/lib/api/apiError";
import type { ProjectTask } from "@/features/tasks/types";

export const decisionLabels = { Approved: "Aprobó la cotización", ChangesRequested: "Solicitó cambios", Rejected: "Rechazó la cotización" } as const;
export type ClientDecision = keyof typeof decisionLabels;
export interface DecisionView {
  quotationRound: number | null; available: boolean; projectId: string; commercialQuotationId: string | null;
  presentQuotationTaskId: string | null; decision: ClientDecision | null; note: string | null; recordedAt: string | null;
}
function invalid(): never { throw new ApiError(502); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) invalid();
  return v;
}
function id(v: unknown): string {
  return typeof v === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v) ? v : invalid();
}
function date(v: unknown): string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)) ? v : invalid();
}
export function parseDecision(value: unknown, projectId: string): DecisionView {
  const v = object(value, ["quotationRound", "available", "projectId", "commercialQuotationId", "presentQuotationTaskId", "decision", "note", "recordedAt"]);
  if (id(v.projectId) !== projectId || typeof v.available !== "boolean") invalid();
  const quotationRound = v.quotationRound === null ? null : typeof v.quotationRound === "number" && Number.isSafeInteger(v.quotationRound) && v.quotationRound > 0 ? v.quotationRound : invalid();
  if (!v.available) {
    if ([v.commercialQuotationId, v.presentQuotationTaskId, v.decision, v.note, v.recordedAt].some(x => x !== null)) invalid();
    return { quotationRound, available: false, projectId, commercialQuotationId: null, presentQuotationTaskId: null, decision: null, note: null, recordedAt: null };
  }
  if (quotationRound === null) invalid();
  if (typeof v.decision !== "string" || !Object.hasOwn(decisionLabels, v.decision) || (v.note !== null && (typeof v.note !== "string" || v.note.length > 2000))) invalid();
  return { quotationRound, available: true, projectId, commercialQuotationId: id(v.commercialQuotationId), presentQuotationTaskId: id(v.presentQuotationTaskId),
    decision: v.decision as ClientDecision, note: v.note as string | null, recordedAt: date(v.recordedAt) };
}
export function parseRecordedDecision(value: unknown, projectId: string): { outcome: DecisionView; task: ProjectTask } {
  const v = object(value, ["outcome", "task"]);
  const outcome = parseDecision(v.outcome, projectId);
  const t = object(v.task, ["id", "projectId", "area", "type", "status", "assignedAt", "startedAt", "completedAt", "assignedToGoogleSubject", "deadlineAt", "wasOverdue", "leadTimeStatus", "quotationRound"]);
  if (t.quotationRound !== outcome.quotationRound || !outcome.available || id(t.id) !== outcome.presentQuotationTaskId || t.projectId !== projectId || t.area !== "Commercial"
    || t.type !== "PresentQuotationToClient" || t.status !== "Completed" || typeof t.assignedToGoogleSubject !== "string" || !t.assignedToGoogleSubject
    || (t.wasOverdue !== null && typeof t.wasOverdue !== "boolean")
    || !["CompletedOnTime", "CompletedLate", "UntrackedLegacy"].includes(String(t.leadTimeStatus))) invalid();
  date(t.assignedAt); date(t.startedAt); date(t.completedAt);
  if (t.deadlineAt !== null) date(t.deadlineAt);
  if (t.completedAt !== outcome.recordedAt) invalid();
  return { outcome, task: t as unknown as ProjectTask };
}
