import type { ProjectDocument, ProjectDocuments } from "@/features/documents/types";

export const projectDocument: ProjectDocument = {
  id: "document-1", originalFileName: "planos.pdf", contentType: "application/pdf", sizeBytes: 1500,
  uploadedAt: "2026-10-15T15:00:00Z", uploadedBy: { name: "Persona documental", email: "documents@example.test" },
  uploadBatchId: "batch-1", isCurrent: true, replacedAt: null, replacedByDocumentId: null, inInitialHandoff: false,
};
export const projectDocuments: ProjectDocuments = {
  documents: [projectDocument], initialHandoff: null, canModify: true, canRemove: true, canSendToBudgets: true,
};
export const handedOffDocuments: ProjectDocuments = {
  ...projectDocuments, documents: [{ ...projectDocument, inInitialHandoff: true }],
  initialHandoff: { id: "handoff-1", sentAt: "2026-10-16T15:00:00Z", sentBy: { name: "Persona comercial", email: "commercial@example.test" }, documentIds: [projectDocument.id] },
  canRemove: false, canSendToBudgets: false,
};
