import { ApiError } from "@/lib/api/apiError";

const messages: Record<string, string> = {
  ProjectNotFound: "No se encontró el proyecto.",
  Forbidden: "No tienes permiso para revisar esta cotización.",
  InvalidWorkflowState: "El proyecto ya no está en un estado válido para realizar la revisión Comercial.",
  InvalidState: "La cotización no está disponible para esta operación de Comercial.",
  AlreadyConfirmed: "La cotización comercial ya fue confirmada.",
  ProjectCreatorUnavailable: "No fue posible identificar al asesor responsable del proyecto para continuar con la presentación al cliente.",
  DocumentUnavailable: "El archivo de cotización necesario para esta operación no está disponible.",
  SgCodeMismatch: "El SG del archivo no coincide con el SG actual del proyecto.",
  StructuralMismatch: "La estructura del archivo cambió y ya no coincide con la cotización preparada por Presupuestos.",
  InvalidWorkbook: "El archivo no corresponde a una cotización comercial válida o soportada.",
  InvalidEconomics: "No fue posible validar los valores económicos de la cotización.",
};
export function commercialQuotationError(error: unknown): string {
  if (!(error instanceof ApiError)) return "No pudimos completar la operación. Intenta de nuevo.";
  if (error.status === 401) return error.message;
  if (error.status === 403) return messages.Forbidden;
  if (error.status === 404) return messages.ProjectNotFound;
  return error.code && Object.hasOwn(messages, error.code) ? messages[error.code] : error.message;
}
// Format the received JSON number, without rounding to COP's default two decimals.
export function formatCop(value: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumSignificantDigits: 21 }).format(value);
}
