import { ApiError } from "@/lib/api/apiError";
import { valueFields } from "./parser";
import type { BudgetQuotationPreviewResponse, Confirmation, ItemDraft } from "./types";

export function createDraft(preview: BudgetQuotationPreviewResponse): ItemDraft[] {
  return preview.items.map((item) => Object.fromEntries(valueFields.map((field) => [field, String(item[field])])) as ItemDraft);
}
export function buildConfirmation(preview: BudgetQuotationPreviewResponse, draft: ItemDraft[]): Confirmation | null {
  if (draft.length !== preview.items.length) return null;
  const items = preview.items.map((original, index) => {
    const d = draft[index];
    return { section: original.section, sourceRow: original.sourceRow, itemNumber: d.itemNumber.trim(), location: d.location.trim(),
      system: d.system.trim(), glass: d.glass.trim(), aluminumFinish: d.aluminumFinish.trim(), lockType: d.lockType.trim(), observations: d.observations.trim(),
      width: Number(d.width), height: Number(d.height), squareMeters: Number(d.squareMeters), quantity: Number(d.quantity) };
  });
  if (items.some((i) => !i.itemNumber || [i.width, i.height, i.squareMeters, i.quantity].some((n) => !Number.isFinite(n) || n <= 0)
    || !Number.isSafeInteger(i.quantity))) return null;
  return { items };
}
const messages: Record<string, string> = {
  UnreadableWorkbook: "No fue posible leer el archivo Excel.",
  UnsupportedWorkbookFormat: "El archivo no corresponde al formato de cotización soportado.",
  InvalidDocumentSgCode: "El SG incluido en el archivo no es válido.",
  TechnicalLimitExceeded: "El archivo supera los límites técnicos permitidos.",
  SgCodeMismatch: "El SG de la cotización no coincide con el SG actual del proyecto.",
  AlreadyConfirmed: "La cotización inicial ya está confirmada.",
  InvalidConfirmation: "Revisa la confirmación: debe incluir todos los ítems con valores válidos.",
  InvalidWorkflowState: "El estado actual del proyecto no permite esta operación de Presupuestos.",
};
export function quotationError(error: unknown): string {
  if (!(error instanceof ApiError)) return "No pudimos completar la operación. Intenta de nuevo.";
  const code = error.code ?? error.fileError ?? "";
  if (error.status === 400 || error.status === 409) return Object.hasOwn(messages, code) ? messages[code] : error.message;
  if (error.status === 404) return "No se encontró el proyecto.";
  return error.message;
}
