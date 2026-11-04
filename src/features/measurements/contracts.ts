import type { ProjectDocument, DocumentActor } from "@/features/documents/types";
export interface Structure { id: string; itemId: string | null; unitOrdinal: number; unitCount: number; itemNumber: string | null; description: string; location: string | null; width: number; height: number; note?: string | null; actualWidth?: number | null; actualHeight?: number | null; actualSystemText?: string | null; imageCatalogItemId?: string | null; createdAt: string; measuredAt: string | null; retiredAt: string | null }
export interface MeasurementState {
  projectId: string; taskId: string; taskStatus: string; responsibleSubject: string; canModify: boolean; checklistId: string | null; revision: number;
  summary: { initial: number; added: number; retired: number; active: number; measured: number; pending: number; progress: number };
  structures: Structure[]; documents: ProjectDocument[];
  history: { id: string; action: string; structureId: string | null; at: string; actor: DocumentActor; revision: number; details?: { before: ActualValues; after: ActualValues } | null }[];
  submissionId: string | null; submittedAt: string | null;
}
export interface ActualValues { width: number | null; height: number | null; systemText: string | null }
export type MeasurementAction = { action: "RecordActual"; structureId: string; actualWidth: number; actualHeight: number; actualSystemText: string } | { action: "Measure"; structureId: string; measured: boolean } | { action: "Retire"; structureId: string } | { action: "Add"; description: string; width: number; height: number } | { action: "Submit"; documentIds: string[] };
export type MeasurementCommand = MeasurementAction & { requestKey: string; expectedRevision: number };
