import type { CommercialQuotationPreviewResponse, CommercialQuotationConfirmationResponse } from "@/features/commercialQuotation/types";
import type { ProjectTask } from "@/features/tasks/types";
import { inProgressTask, project } from "./operationalFixtures";
import { user } from "./fixtures";

export const commercialUser = { ...user, roles: ["CommercialHead" as const], subject: "test-commercial-head" };
export const reviewTask: ProjectTask = { ...inProgressTask, id: "review-1", area: "Commercial", type: "ReviewQuotation", assignedToGoogleSubject: commercialUser.subject, wasOverdue: false };
export const commercialPreview: CommercialQuotationPreviewResponse = {
  projectId: project.id, projectTotal: 987654.3217, technicalDifferencesCount: 1, hasTechnicalDifferences: true,
  items: [
    { section: "Main", sourceRow: 15, commercialCatalogItemId: "item-1", values: { itemNumber: "V-2", location: "Sala", system: "Siena", glass: "Laminado 4+4", aluminumFinish: "Negro", lockType: "Simple", observations: "Revisar acabado", width: 2, height: 3, squareMeters: 6, quantity: 2 },
      unitPrice: 7.125, totalPrice: 100.4567, technicalDifferences: [{ field: "Glass", previousValue: "Templado 5 mm", currentValue: "Laminado 4+4" }] },
    { section: "Additional", sourceRow: 120, commercialCatalogItemId: "item-2", values: { itemNumber: "A-1", location: "Patio", system: "Sistema adicional", glass: "Claro", aluminumFinish: "Natural", lockType: "", observations: "", width: 1, height: 1, squareMeters: 1, quantity: 1 },
      unitPrice: 0, totalPrice: 0, technicalDifferences: [] },
  ],
};
export const commercialConfirmation: CommercialQuotationConfirmationResponse = {
  projectId: project.id, commercialQuotationId: "commercial-1", projectTotal: 987654.3217, commercialFileAvailable: true,
  reviewTask: { ...reviewTask, status: "Completed", completedAt: "2026-10-20T15:00:00Z", LeadTimeStatus: "CompletedOnTime" },
  presentQuotationToClientTask: { ...reviewTask, id: "present-1", type: "PresentQuotationToClient", assignedToGoogleSubject: user.subject,
    assignedAt: "2026-10-20T15:00:00Z", startedAt: "2026-10-20T15:00:00Z", deadlineAt: "2026-10-26T22:00:00Z" },
  technicalDifferencesCount: 1, hasTechnicalDifferences: true,
};
