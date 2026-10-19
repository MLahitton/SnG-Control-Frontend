// Legacy quotation endpoints do not emit codes for these conflicts. Translate only
// exact known titles at this boundary; never forward arbitrary upstream messages.
export function budgetQuotationProblem(payload: unknown, status: number, endpoint: string): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const source = payload as Record<string, unknown>;
  let code: string | undefined;
  if (status === 409) {
    if (source.title === "El SG del archivo no coincide con el proyecto.") code = "SgCodeMismatch";
    if (endpoint === "preview" && source.title === "El proyecto no está listo para el preview de Presupuestos.") code = "InvalidWorkflowState";
    if (endpoint === "confirm" && source.title === "El proyecto no está listo para confirmar la cotización.") code = "InvalidWorkflowState";
    if (endpoint === "confirm" && source.title === "La cotización inicial ya está confirmada.") code = "AlreadyConfirmed";
  }
  if (status === 400 && endpoint === "confirm" && source.title === "La confirmación debe cubrir exactamente los ítems del archivo con valores válidos.") code = "InvalidConfirmation";
  return code ? { ...source, code } : payload;
}
