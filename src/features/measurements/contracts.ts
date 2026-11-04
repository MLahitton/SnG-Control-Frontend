import type { ProjectDocument, DocumentActor } from "@/features/documents/types";
export type TechnicalDetails = { handleStatus: "NotApplicable" | "Confirmed" | null; handleHeightMm: number | null; viewSide: "Outside" | "Inside" | null; openingType: "NotApplicable" | "HingedDoor" | "HingedWindow" | "Other" | null; openingDirection: "Inward" | "Outward" | null; openingHand: "Left" | "Right" | null; hasAlfajia: boolean | null; alfajiaMeasurementMm: number | null };
export type SketchPoint = { x: number; y: number };
export type SketchStroke = { tool: "Pen" | "Eraser"; color: "#111111" | "#0066cc" | "#cc2222"; width: number; points: SketchPoint[] };
export type SketchDrawing = { version: 1; width: 1200; height: 900; strokes: SketchStroke[] };
export type SketchRead = { id: string; structureId: string; revision: number; drawing: SketchDrawing; webpSha256: string };
export interface Structure { technical?: TechnicalDetails | null; technicalComplete?: boolean; sketchVersionId?: string | null; id: string; itemId: string | null; unitOrdinal: number; unitCount: number; itemNumber: string | null; description: string; location: string | null; width: number; height: number; note?: string | null; actualWidth?: number | null; actualHeight?: number | null; actualSystemText?: string | null; imageCatalogItemId?: string | null; createdAt: string; measuredAt: string | null; retiredAt: string | null }
export interface MeasurementState {
  projectId: string; taskId: string; taskStatus: string; responsibleSubject: string; canModify: boolean; checklistId: string | null; revision: number;
  summary: { initial: number; added: number; retired: number; active: number; measured: number; pending: number; progress: number };
  structures: Structure[]; documents: ProjectDocument[];
  history: { id: string; action: string; structureId: string | null; at: string; actor: DocumentActor; revision: number; technical?: { before: TechnicalDetails | null; after: TechnicalDetails | null }; sketch?: { before: string | null; after: string | null }; details?: { before: ActualValues; after: ActualValues } | null }[];
  submissionId: string | null; submittedAt: string | null;
}
export interface ActualValues { width: number | null; height: number | null; systemText: string | null }
export type MeasurementAction = { action: "RecordTechnical"; structureId: string; technical: TechnicalDetails } | { action: "RecordSketch"; structureId: string; sketch: { drawing: SketchDrawing; webp: string } } | { action: "RecordActual"; structureId: string; actualWidth: number; actualHeight: number; actualSystemText: string } | { action: "Measure"; structureId: string; measured: boolean } | { action: "Retire"; structureId: string } | { action: "Add"; description: string; width: number; height: number } | { action: "Submit"; documentIds: string[] };
export type MeasurementCommand = MeasurementAction & { requestKey: string; expectedRevision: number };
