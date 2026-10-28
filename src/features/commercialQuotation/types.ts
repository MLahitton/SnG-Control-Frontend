import type { ProjectTask } from "@/features/tasks/types";
import type { CommercialItemKey } from "@/lib/api/types";

export const technicalFields = ["ItemNumber", "Location", "System", "Glass", "AluminumFinish", "LockType", "Observations", "Width", "Height", "SquareMeters", "Quantity"] as const;
export type TechnicalField = typeof technicalFields[number];
export interface CommercialValues {
  itemNumber: string; location: string; system: string; glass: string; aluminumFinish: string;
  lockType: string; observations: string; width: number; height: number; squareMeters: number; quantity: number;
}
export interface TechnicalDifference { field: TechnicalField; previousValue: string; currentValue: string }
export interface CommercialQuotationItem extends CommercialItemKey {
  commercialCatalogItemId: string; values: CommercialValues; unitPrice: number; totalPrice: number;
  technicalDifferences: TechnicalDifference[];
}
export interface CommercialQuotationPreviewResponse {
  quotationRound: number;
  currencyCode: "COP"; projectId: string; projectTotal: number; items: CommercialQuotationItem[];
  technicalDifferencesCount: number; hasTechnicalDifferences: boolean;
}
export interface CommercialQuotationConfirmationResponse {
  currencyCode: "COP"; projectId: string; commercialQuotationId: string; projectTotal: number; commercialFileAvailable: boolean;
  reviewTask: ProjectTask; presentQuotationToClientTask: ProjectTask;
  hasTechnicalDifferences: boolean; technicalDifferencesCount: number;
}
