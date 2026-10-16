import type { ApiClient } from "@/lib/api/types";
import type { DocumentUpload, ProjectDocuments } from "./types";

export function documentBatch(operations: DocumentUpload[]): FormData {
  const body = new FormData();
  const manifest = { files: operations.map((operation, index) => ({ partName: `file-${index}`, replacesDocumentId: operation.replacesDocumentId })) };
  body.append("manifest", new Blob([JSON.stringify(manifest)], { type: "application/json" }));
  operations.forEach((operation, index) => body.append(`file-${index}`, operation.file));
  return body;
}

export const documentsService = {
  list: (api: ApiClient, projectId: string, signal?: AbortSignal) => api.get<ProjectDocuments>(`projects/${projectId}/documents`, { signal }),
  // The UI refreshes the list; it does not depend on an undocumented batch response shape.
  uploadBatch: (api: ApiClient, projectId: string, operations: DocumentUpload[], signal?: AbortSignal) =>
    api.upload<unknown>(`projects/${projectId}/documents/batch`, documentBatch(operations), { signal }),
  remove: (api: ApiClient, projectId: string, documentId: string, signal?: AbortSignal) => api.delete<void>(`projects/${projectId}/documents/${documentId}`, { signal }),
  download: (api: ApiClient, projectId: string, documentId: string, signal?: AbortSignal) => api.downloadStream(`projects/${projectId}/documents/${documentId}/file`, { signal }),
  downloadCurrentZip: (api: ApiClient, projectId: string, signal?: AbortSignal) => api.downloadStream(`projects/${projectId}/documents/current.zip`, { signal }),
  downloadInitialZip: (api: ApiClient, projectId: string, signal?: AbortSignal) => api.downloadStream(`projects/${projectId}/documents/initial-handoff.zip`, { signal }),
};
