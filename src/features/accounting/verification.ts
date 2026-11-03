import { ApiError } from "@/lib/api/apiError";
import type { ApiClient } from "@/lib/api/types";
import type { ProjectDocument, DocumentUpload } from "@/features/documents/types";
import { documentBatch } from "@/features/documents/service";
import { parseAccounting, type AccountingState } from "./contracts";
export interface VerificationReview { id: string; status: "Pending" | "Approved" | "Rejected"; submittedAt: string; decidedAt: string | null; decidedBy: { email: string | null; name: string | null } | null; note: string | null; documentIds: string[] }
export interface VerificationState { projectId: string; available: boolean; canManage: boolean; canSubmit: boolean; canReview: boolean; accounting: AccountingState; documents: ProjectDocument[]; reviews: VerificationReview[] }
function bad(): never { throw new ApiError(502); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return bad();
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) bad(); return v;
}
function text(v: unknown): string { return typeof v === "string" ? v : bad(); }
function guid(v: unknown): string { const s = text(v); return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(s) ? s : bad(); }
function date(v: unknown): string { const s = text(v); return /(?:Z|[+-]\d{2}:\d{2})$/.test(s) && Number.isFinite(Date.parse(s)) ? s : bad(); }
function nullable<T>(v: unknown, parse: (v: unknown) => T): T | null { return v === null ? null : parse(v); }
function person(value: unknown) { const v = object(value, ["email", "name"]); return { email: nullable(v.email, text), name: nullable(v.name, text) }; }
function document(value: unknown): ProjectDocument {
  const v = object(value, ["id", "originalFileName", "contentType", "sizeBytes", "uploadedAt", "uploadedBy", "uploadBatchId", "isCurrent", "replacedAt", "replacedByDocumentId", "inInitialHandoff"]);
  guid(v.id); text(v.originalFileName); nullable(v.contentType, text); date(v.uploadedAt); person(v.uploadedBy); guid(v.uploadBatchId);
  nullable(v.replacedAt, date); nullable(v.replacedByDocumentId, guid);
  if (typeof v.sizeBytes !== "number" || !Number.isSafeInteger(v.sizeBytes) || v.sizeBytes <= 0 || typeof v.isCurrent !== "boolean" || v.inInitialHandoff !== false) bad();
  return v as unknown as ProjectDocument;
}
export function parseVerification(value: unknown, id: string): VerificationState {
  const v = object(value, ["projectId", "available", "canManage", "canSubmit", "canReview", "accounting", "documents", "reviews"]);
  if (v.projectId !== id || [v.available, v.canManage, v.canSubmit, v.canReview].some(x => typeof x !== "boolean") || !Array.isArray(v.documents) || !Array.isArray(v.reviews)) return bad();
  const accounting = parseAccounting(v.accounting, id); const documents = v.documents.map(document);
  const reviews = v.reviews.map((value): VerificationReview => {
    const r = object(value, ["id", "status", "submittedAt", "decidedAt", "decidedBy", "note", "documentIds"]);
    guid(r.id); date(r.submittedAt); nullable(r.decidedAt, date); nullable(r.decidedBy, person); nullable(r.note, text);
    if (!["Pending", "Approved", "Rejected"].includes(String(r.status)) || !Array.isArray(r.documentIds) || !r.documentIds.length) return bad();
    r.documentIds.forEach(guid);
    if (new Set(r.documentIds).size !== r.documentIds.length || r.documentIds.some(id => !documents.some(d => d.id === id))) bad();
    if (r.status === "Pending" ? r.decidedAt !== null || r.decidedBy !== null || r.note !== null : r.decidedAt === null || r.decidedBy === null) bad();
    if (r.status === "Rejected" && (typeof r.note !== "string" || !r.note.trim())) bad();
    return r as unknown as VerificationReview;
  });
  if (new Set(documents.map(d => d.id)).size !== documents.length || new Set(reviews.map(r => r.id)).size !== reviews.length || reviews.filter(r => r.status === "Pending").length > 1) bad();
  return { projectId: id, available: v.available as boolean, canManage: v.canManage as boolean, canSubmit: v.canSubmit as boolean, canReview: v.canReview as boolean, accounting, documents, reviews };
}
export const verificationService = {
  async read(api: ApiClient, id: string, signal: AbortSignal) { return parseVerification(await api.get<unknown>(`projects/${id}/deposit-verifications`, { signal }), id); },
  async upload(api: ApiClient, id: string, files: DocumentUpload[], signal: AbortSignal) { await api.upload<unknown>(`projects/${id}/deposit-verifications/receipts/batch`, documentBatch(files), { signal }); },
  async submit(api: ApiClient, id: string, requestKey: string, documentIds: string[], signal: AbortSignal) {
    const v = object(await api.post<unknown>(`projects/${id}/deposit-verifications`, { requestKey, documentIds }, { signal }), ["reviewId"]); return guid(v.reviewId);
  },
  async decide(api: ApiClient, id: string, reviewId: string, approve: boolean, amount: string | null, receivedAt: string | null, note: string | null, signal: AbortSignal) {
    await api.post<void>(`projects/${id}/deposit-verifications/${reviewId}/decision`, { approve, amount, receivedAt, note }, { signal });
  },
};
