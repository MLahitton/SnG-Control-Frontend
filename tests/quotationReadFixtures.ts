import type { BudgetReadView, CommercialReadView } from "@/features/quotationViews/contracts";
import { quotationConfirmed } from "./budgetQuotationFixtures";
import { commercialPreview } from "./commercialQuotationFixtures";
export const budgetRead: BudgetReadView = {
  projectId: quotationConfirmed.projectId, quotationVersionId: quotationConfirmed.quotationVersionId, versionNumber: 1,
  confirmedAt: quotationConfirmed.confirmedAt, document: quotationConfirmed.document,
  items: quotationConfirmed.items.map((i, index) => ({ id: i.id, section: i.section, sourceRow: i.sourceRow,
    confirmed: { ...i.confirmed, glass: index === 0 ? "Vidrio confirmado persistido" : i.confirmed.glass }, extracted: i.extracted,
    imageStatus: i.image.status, hasImage: i.image.status === "Stored",
    technicalDifferences: index === 0 ? [{ field: "Glass", previousValue: "Claro", currentValue: "Vidrio confirmado persistido" }] : [] })),
};
export const commercialRead: CommercialReadView = { currencyCode: "COP", projectId: commercialPreview.projectId, commercialQuotationId: "commercial-1",
  confirmedAt: "2026-10-21T15:00:00Z", projectTotal: commercialPreview.projectTotal, items: commercialPreview.items.map(i => ({ ...i, imageStatus: "Missing", hasImage: false })) };
