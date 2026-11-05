import type { Structure } from "@/features/measurements/contracts";
import type { ProjectDocument, DocumentActor } from "@/features/documents/types";
import { ApiError } from "@/lib/api/apiError";
export interface EngineeringRow { structure: Structure; revision: number; completed: boolean; changedAt: string | null }
export interface EngineeringState {
 projectId: string; checklistId: string; submissionId: string; taskId: string; taskStatus: "InProgress" | "Completed";
 responsibleSubject: string; canModify: boolean; startedAt: string; completedAt: string | null; revision: number;
 total: number; completed: number; pending: number; progress: number; structures: EngineeringRow[];
 documents: { document: ProjectDocument; version: number; sha256: string }[]; currentDocumentId: string | null;
 history: { action: string; structureId: string | null; at: string; actor: DocumentActor; revision: number; reason: string | null }[];
}
export function parseEngineering(value: unknown, projectId: string): EngineeringState {
 const fail = (): never => { throw new ApiError(502); };
 if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
 const v = value as EngineeringState;
 const keys = ["projectId","checklistId","submissionId","taskId","taskStatus","responsibleSubject","canModify","startedAt","completedAt","revision","total","completed","pending","progress","structures","documents","currentDocumentId","history"];
 if (Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v,k)) || v.projectId !== projectId
   || ![v.checklistId,v.submissionId,v.taskId,v.responsibleSubject].every(x => typeof x === "string" && !!x)
   || !["InProgress","Completed"].includes(v.taskStatus) || typeof v.canModify !== "boolean"
   || ![v.revision,v.total,v.completed,v.pending].every(x => Number.isSafeInteger(x) && x >= 0)
   || typeof v.progress !== "number" || !Number.isFinite(v.progress) || v.progress < 0 || v.progress > 100
   || !Array.isArray(v.structures) || !Array.isArray(v.documents) || !Array.isArray(v.history)
   || v.structures.length !== v.total || v.completed + v.pending !== v.total) return fail();
 for (const r of v.structures) {
   const s = r?.structure;
   if (!s || typeof s.id !== "string" || typeof r.completed !== "boolean" || !Number.isSafeInteger(r.revision) || r.revision < 0
     || !Number.isSafeInteger(s.unitOrdinal) || s.unitOrdinal <= 0 || !Number.isSafeInteger(s.unitCount) || s.unitCount < s.unitOrdinal
     || ![s.width,s.height].every(n => typeof n === "number" && Number.isFinite(n) && n > 0)
     || s.retiredAt !== null || [s.actualWidth,s.actualHeight].some(n => n != null && (typeof n !== "number" || !Number.isFinite(n) || n <= 0))) return fail();
 }
 if (new Set(v.structures.map(r => r.structure.id)).size !== v.total || v.structures.filter(r => r.completed).length !== v.completed) return fail();
 for (const d of v.documents) if (!d?.document || typeof d.document.id !== "string" || typeof d.document.originalFileName !== "string" || !Number.isSafeInteger(d.version) || d.version <= 0 || !/^[A-F0-9]{64}$/.test(d.sha256)) return fail();
 if (new Set(v.documents.map(d => d.document.id)).size !== v.documents.length || (v.currentDocumentId !== null && !v.documents.some(d => d.document.id === v.currentDocumentId && d.document.isCurrent))) return fail();
 if (v.taskStatus === "Completed" && (v.canModify || !v.completedAt || v.pending !== 0 || !v.currentDocumentId)) return fail();
 return v;
}
