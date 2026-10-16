import { ApiError } from "@/lib/api/apiError";
import { errorMessage } from "@/lib/api/ErrorNotice";
import type { DocumentUpload } from "./types";

export const MAX_DOCUMENT_BYTES = 100_000_000;
export const MAX_BATCH_BYTES = 300_000_000;
export const MAX_CURRENT_DOCUMENTS = 15;

export function validateDocumentBatch(operations: DocumentUpload[], currentCount: number): string | null {
  if (!operations.length) return "Selecciona al menos un archivo.";
  if (operations.some(({ file }) => file.size === 0)) return "No se pueden subir archivos vacíos (0 bytes).";
  if (operations.some(({ file }) => file.size > MAX_DOCUMENT_BYTES)) return "Uno de los archivos supera el máximo de 100 MB.";
  if (operations.reduce((sum, { file }) => sum + file.size, 0) > MAX_BATCH_BYTES) return "La carga supera el máximo de 300 MB.";
  if (currentCount + operations.filter((operation) => operation.replacesDocumentId === null).length > MAX_CURRENT_DOCUMENTS) return "El proyecto puede tener máximo 15 documentos vigentes.";
  return null;
}

const documentErrors: Record<string, string> = {
  "413:FileTooLarge": "Uno de los archivos supera el máximo de 100 MB.",
  "413:BatchTooLarge": "La carga supera el máximo de 300 MB.",
  "409:DocumentLimitExceeded": "El proyecto puede tener máximo 15 documentos vigentes.",
  "400:InvalidDocumentBatch": "La carga de documentos no es válida. Revisa los archivos e inténtalo de nuevo.",
  "409:InvalidReplacement": "El documento ya no puede ser reemplazado. Actualiza la información del proyecto.",
  "409:DocumentRemovalLocked": "Los documentos ya enviados a Presupuestos no pueden quitarse.",
  "500:DocumentUnavailable": "El archivo no está disponible en este momento.",
  "409:DocumentsRequired": "Debes cargar al menos un documento del proyecto antes de enviarlo a Presupuestos.",
};
export function documentErrorMessage(error: unknown): string {
  return error instanceof ApiError ? documentErrors[`${error.status}:${error.code}`] ?? error.message : errorMessage(error);
}
