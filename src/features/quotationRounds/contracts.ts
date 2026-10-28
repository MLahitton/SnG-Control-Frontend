import { ApiError } from "@/lib/api/apiError";
import { parseProjectTask } from "@/features/tasks/parser";
import type { ProjectTask } from "@/features/tasks/types";
import { decisionLabels, type ClientDecision } from "@/features/clientDecision/contracts";

export interface RoundRequest { targetQuotationRound: number; requestedChanges: string; requestedAt: string }
export interface QuotationRound {
  roundNumber: number; prepareQuotationTask: ProjectTask | null; reviewQuotationTask: ProjectTask | null; presentQuotationTask: ProjectTask | null;
  budgetQuotation: { versionNumber: number; confirmedAt: string; itemCount: number; totalQuantity: number } | null;
  commercialQuotation: { versionNumber: number; confirmedAt: string; projectTotal: number; currencyCode: "COP" } | null;
  clientDecision: { decision: ClientDecision; note: string | null; recordedAt: string } | null;
  requotationRequest: RoundRequest | null;
}
export interface QuotationRounds { projectId: string; total: number; returned: number; hasMore: boolean; rounds: QuotationRound[] }
function bad(): never { throw new ApiError(502); }
function obj(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return bad();
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) bad();
  return v;
}
function integer(v: unknown, min = 0): number { return typeof v === "number" && Number.isSafeInteger(v) && v >= min ? v : bad(); }
function date(v: unknown): string { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)) ? v : bad(); }
function text(v: unknown, max: number): string { return typeof v === "string" && !!v.trim() && v.length <= max ? v : bad(); }
function request(value: unknown): RoundRequest {
  const v = obj(value, ["targetQuotationRound", "requestedChanges", "requestedAt"]);
  return { targetQuotationRound: integer(v.targetQuotationRound, 2), requestedChanges: text(v.requestedChanges, 4000), requestedAt: date(v.requestedAt) };
}
export function parseQuotationRounds(value: unknown, projectId: string): QuotationRounds {
  const v = obj(value, ["projectId", "total", "returned", "hasMore", "rounds"]);
  const total = integer(v.total), returned = integer(v.returned);
  if (v.projectId !== projectId || !Array.isArray(v.rounds) || returned !== v.rounds.length || returned !== Math.min(total, 20) || v.hasMore !== (total > returned)) bad();
  const rounds = (v.rounds as unknown[]).map(value => {
    const r = obj(value, ["roundNumber", "prepareQuotationTask", "budgetQuotation", "reviewQuotationTask", "commercialQuotation", "presentQuotationTask", "clientDecision", "requotationRequest"]);
    const roundNumber = integer(r.roundNumber, 1);
    const task = (value: unknown, type: string) => {
      if (value === null) return null;
      const result = parseProjectTask(value, projectId);
      if (result.type !== type || result.quotationRound !== roundNumber) bad();
      return result;
    };
    let budgetQuotation: QuotationRound["budgetQuotation"] = null;
    if (r.budgetQuotation !== null) {
      const b = obj(r.budgetQuotation, ["versionNumber", "confirmedAt", "itemCount", "totalQuantity"]);
      if (b.versionNumber !== roundNumber) bad();
      budgetQuotation = { versionNumber: roundNumber, confirmedAt: date(b.confirmedAt), itemCount: integer(b.itemCount), totalQuantity: integer(b.totalQuantity) };
    }
    let commercialQuotation: QuotationRound["commercialQuotation"] = null;
    if (r.commercialQuotation !== null) {
      const c = obj(r.commercialQuotation, ["versionNumber", "confirmedAt", "projectTotal", "currencyCode"]);
      if (c.versionNumber !== roundNumber || c.currencyCode !== "COP" || typeof c.projectTotal !== "number" || !Number.isFinite(c.projectTotal) || c.projectTotal < 0) bad();
      commercialQuotation = { versionNumber: roundNumber, confirmedAt: date(c.confirmedAt), projectTotal: c.projectTotal as number, currencyCode: "COP" };
    }
    let clientDecision: QuotationRound["clientDecision"] = null;
    if (r.clientDecision !== null) {
      const d = obj(r.clientDecision, ["decision", "note", "recordedAt"]);
      if (typeof d.decision !== "string" || !Object.hasOwn(decisionLabels, d.decision) || (d.note !== null && (typeof d.note !== "string" || d.note.length > 2000))) bad();
      clientDecision = { decision: d.decision as ClientDecision, note: d.note as string | null, recordedAt: date(d.recordedAt) };
    }
    const requotationRequest = r.requotationRequest === null ? null : request(r.requotationRequest);
    if (requotationRequest && (roundNumber === 1 || requotationRequest.targetQuotationRound !== roundNumber)) bad();
    return { roundNumber, budgetQuotation, commercialQuotation, clientDecision, requotationRequest,
      prepareQuotationTask: task(r.prepareQuotationTask, "PrepareQuotation"), reviewQuotationTask: task(r.reviewQuotationTask, "ReviewQuotation"), presentQuotationTask: task(r.presentQuotationTask, "PresentQuotationToClient") };
  });
  if (rounds.some((r, i) => i > 0 && r.roundNumber <= rounds[i - 1].roundNumber)) bad();
  return { projectId, total, returned, hasMore: total > returned, rounds };
}
export function parseRequestedRequotation(value: unknown, projectId: string) {
  const v = obj(value, ["request", "prepareQuotationTask"]);
  const r = obj(v.request, ["projectId", "sourceDecisionId", "targetQuotationRound", "requestedChanges", "requestedAt"]);
  if (r.projectId !== projectId || typeof r.sourceDecisionId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(r.sourceDecisionId)) bad();
  const summary = request({ targetQuotationRound: r.targetQuotationRound, requestedChanges: r.requestedChanges, requestedAt: r.requestedAt });
  const task = parseProjectTask(v.prepareQuotationTask, projectId);
  if (task.quotationRound !== summary.targetQuotationRound || task.type !== "PrepareQuotation" || task.status !== "InProgress" || task.startedAt === null || task.deadlineAt === null || task.completedAt !== null) bad();
  return { request: { ...summary, projectId, sourceDecisionId: r.sourceDecisionId as string }, prepareQuotationTask: task };
}
