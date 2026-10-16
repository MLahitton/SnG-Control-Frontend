import { ApiError } from "@/lib/api/apiError";
import { IntelligenceContractError } from "./parser";

export function safeRequestId(value: unknown): string | undefined {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
}
export class IntelligenceError extends ApiError {
  readonly requestId?: string;
  constructor(status: number, payload?: unknown) {
    super(status);
    this.requestId = safeRequestId(payload && typeof payload === "object" && "requestId" in payload ? payload.requestId : undefined);
  }
}
export function intelligenceErrorMessage(error: unknown): string {
  if (error instanceof IntelligenceContractError) return error.message;
  if (error instanceof ApiError) {
    if (error.status === 401) return "Tu sesión ya no es válida. Inicia sesión de nuevo.";
    if (error.status === 403) return "Intelligence está disponible para Gerencia.";
    if (error.status === 429) return "Intelligence recibió demasiadas solicitudes. Espera un momento e intenta de nuevo.";
    if (error.status === 422 || error.status === 413) return "La consulta o el audio no son válidos. Prueba con un mensaje o una grabación más breve.";
  }
  return "Intelligence no está disponible temporalmente. Intenta de nuevo.";
}
