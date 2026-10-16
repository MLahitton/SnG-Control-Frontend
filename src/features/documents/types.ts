export interface DocumentActor {
  email: string | null;
  name: string | null;
}
export interface ProjectDocument {
  id: string;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: DocumentActor;
  uploadBatchId: string;
  isCurrent: boolean;
  replacedAt: string | null;
  replacedByDocumentId: string | null;
  inInitialHandoff: boolean;
}
export interface InitialHandoff {
  id: string;
  sentAt: string;
  sentBy: DocumentActor;
  documentIds: string[];
}
export interface ProjectDocuments {
  documents: ProjectDocument[];
  initialHandoff: InitialHandoff | null;
  canModify: boolean;
  canRemove: boolean;
  canSendToBudgets: boolean;
}
export interface DocumentUpload {
  file: File;
  replacesDocumentId: string | null;
}
