import type { BudgetQuotationPreviewResponse, ConfirmedBudgetQuotationResponse, ItemValues } from "@/features/budgetQuotation/types";

export const technicalValues: ItemValues = {
  itemNumber: "V-2", location: "Sala", system: "Corrediza", glass: "Claro", aluminumFinish: "Natural", lockType: "Central", observations: "",
  width: 2, height: 3, squareMeters: 5.75, quantity: 2,
};
export const quotationPreview: BudgetQuotationPreviewResponse = {
  projectId: "project-1", projectSgCode: "SG001",
  document: { fileName: "cotizacion.xlsx", clientName: "Cliente documental", projectName: "Proyecto documental", location: "Bogotá",
    clientLine: "", productionLine: "Classic", preparedBy: "Preparador de prueba", sgCode: "SG001" },
  itemCount: 3, totalQuantity: 6,
  items: [
    { ...technicalValues, section: "Main", sourceRow: 15, image: { contentType: "image/png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=" } },
    { ...technicalValues, itemNumber: "V-1", section: "Main", sourceRow: 32, image: null },
    { ...technicalValues, itemNumber: "A-1", section: "Additional", sourceRow: 120, image: null },
  ],
  warnings: [
    { code: "MissingImage", itemNumber: "V-1", sourceRow: 32, message: "El ítem no tiene una imagen asociable." },
    { code: "AmbiguousImage", itemNumber: "A-1", sourceRow: 120, message: "Hay varias imágenes en el bloque; no se seleccionó ninguna." },
  ],
};
export const quotationConfirmed: ConfirmedBudgetQuotationResponse = {
  projectId: "project-1", quotationVersionId: "version-1", commercialCatalogId: "catalog-1", versionNumber: 1, confirmedAt: "2026-10-19T18:00:00Z",
  document: quotationPreview.document, itemCount: 3, totalQuantity: 6,
  items: quotationPreview.items.map((item, index) => ({ id: `item-${index}`, section: item.section, sourceRow: item.sourceRow,
    extracted: { ...technicalValues, itemNumber: item.itemNumber }, confirmed: { ...technicalValues, itemNumber: item.itemNumber },
    image: { status: item.image ? "Stored" : index === 2 ? "Ambiguous" : "Missing", contentType: item.image?.contentType ?? null } })),
  prepareQuotationTask: {
    id: "task-1", projectId: "project-1", area: "Budgets", type: "PrepareQuotation", status: "InProgress",
    assignedAt: "2026-10-15T15:00:00Z", startedAt: "2026-10-15T16:00:00Z", completedAt: null,
    assignedToGoogleSubject: "private-assignee-subject", deadlineAt: "2026-10-22T22:00:00Z", wasOverdue: null, leakTimeStatus: "OnTrack",
  },
};
