import type { ProjectTask } from "@/features/tasks/types";

export interface ItemValues {
  itemNumber: string;
  location: string;
  system: string;
  glass: string;
  aluminumFinish: string;
  lockType: string;
  observations: string;
  width: number;
  height: number;
  squareMeters: number;
  quantity: number;
}
export interface ItemKey { section: "Main" | "Additional"; sourceRow: number }
export interface QuotationDocument {
  fileName: string; clientName: string; projectName: string; location: string;
  clientLine: string; productionLine: string; preparedBy: string; sgCode: string;
}
export interface PreviewItem extends ItemValues, ItemKey {
  image: { contentType: string; base64: string } | null;
}
export interface QuotationWarning {
  code: "MissingImage" | "AmbiguousImage"; itemNumber: string; sourceRow: number; message: string;
}
export interface BudgetQuotationPreviewResponse {
  projectId: string; projectSgCode: string; document: QuotationDocument;
  itemCount: number; totalQuantity: number; items: PreviewItem[]; warnings: QuotationWarning[];
}
export interface ConfirmedItem extends ItemKey {
  id: string; extracted: ItemValues; confirmed: ItemValues;
  image: { status: "Stored" | "Missing" | "Ambiguous"; contentType: string | null };
}
export interface ConfirmedBudgetQuotationResponse {
  quotationVersionId: string; versionNumber: number; commercialCatalogId: string;
  projectId: string; confirmedAt: string; document: QuotationDocument;
  itemCount: number; totalQuantity: number; items: ConfirmedItem[]; prepareQuotationTask: ProjectTask;
}
export interface Confirmation { items: (ItemValues & ItemKey)[] }
export type ItemDraft = { [K in keyof ItemValues]: string };
