import { describe, expect, it } from "vitest";
import { parsePreview, parseConfirmation } from "@/features/commercialQuotation/parser";
import { formatCop, commercialQuotationError } from "@/features/commercialQuotation/validation";
import { parseCommercialView } from "@/features/quotationViews/contracts";
import { commercialRead } from "./quotationReadFixtures";
import { ApiError } from "@/lib/api/apiError";
import { commercialPreview, commercialConfirmation } from "./commercialQuotationFixtures";

describe("commercial quotation closed contracts", () => {
  it("preserves independent economic values, order, differences and official tasks", () => {
    expect(parsePreview(commercialPreview, "project-1")).toEqual(commercialPreview);
    expect(parseConfirmation(commercialConfirmation, "project-1")).toEqual(commercialConfirmation);
    expect(formatCop(987654.3217)).toContain("987.654,3217");
    expect(formatCop(7.125)).toContain("7,125");
  });
  it.each([
    { projectId: "another" }, { projectTotal: "10" }, { projectTotal: -1 }, { projectTotal: Infinity },
    { items: [] }, { items: [commercialPreview.items[0], commercialPreview.items[0]] },
    { technicalDifferencesCount: 2 }, { hasTechnicalDifferences: false }, { extra: "unsupported" },
  ])("rejects corrupt preview %j", (change) => {
    expect(() => parsePreview({ ...commercialPreview, ...change }, "project-1")).toThrow(ApiError);
  });
  it.each([
    { section: "Unknown" }, { sourceRow: 0 }, { sourceRow: 1.5 }, { totalPrice: null }, { unitPrice: -1 },
    { values: { ...commercialPreview.items[0].values, quantity: 1.5 } },
    { values: { ...commercialPreview.items[0].values, location: null } },
    { technicalDifferences: [{ field: "Price", previousValue: "a", currentValue: "b" }] },
    { technicalDifferences: [{ field: "Glass", previousValue: null, currentValue: "b" }] },
    { technicalDifferences: [{ field: "Glass", previousValue: "a", currentValue: "b", extra: "hidden" }] },
  ])("rejects corrupt item %j", (change) => {
    expect(() => parsePreview({ ...commercialPreview, items: [{ ...commercialPreview.items[0], ...change }] }, "project-1")).toThrow(ApiError);
  });
  it.each([
    { projectId: "other" }, { commercialFileAvailable: "true" }, { projectTotal: null }, { extra: true },
    { reviewTask: { ...commercialConfirmation.reviewTask, status: "InProgress" } },
    { presentQuotationToClientTask: { ...commercialConfirmation.presentQuotationToClientTask, projectId: "other" } },
    { reviewTask: { ...commercialConfirmation.reviewTask, assignedAt: null } },
  ])("rejects corrupt confirmation %j", (change) => {
    expect(() => parseConfirmation({ ...commercialConfirmation, ...change }, "project-1")).toThrow(ApiError);
  });
  it("accepts no differences and nullable task fields without inventing dates", () => {
    const preview = { ...commercialPreview, items: commercialPreview.items.map((i) => ({ ...i, technicalDifferences: [] })), technicalDifferencesCount: 0, hasTechnicalDifferences: false };
    expect(parsePreview(preview, "project-1")).toEqual(preview);
    const confirmation = { ...commercialConfirmation, reviewTask: { ...commercialConfirmation.reviewTask, wasOverdue: null, deadlineAt: null } };
    expect(parseConfirmation(confirmation, "project-1")).toEqual(confirmation);
  });
  it.each(["ProjectNotFound", "Forbidden", "InvalidWorkflowState", "AlreadyConfirmed", "ProjectCreatorUnavailable", "DocumentUnavailable", "SgCodeMismatch", "StructuralMismatch", "InvalidWorkbook", "InvalidEconomics", "InvalidState"])("maps %s safely", (code) => {
    const error = new ApiError(409, { code, detail: "private", stackTrace: "private", token: "private" });
    expect(commercialQuotationError(error)).not.toBe(error.message);
    expect(commercialQuotationError(error)).not.toContain("private");
  });
});


it.each([undefined, "USD", "cop", null])("requires official COP in every commercial contract (%s)", currencyCode => {
  expect(() => parsePreview({ ...commercialPreview, currencyCode }, "project-1")).toThrow(ApiError);
  expect(() => parseConfirmation({ ...commercialConfirmation, currencyCode }, "project-1")).toThrow(ApiError);
  expect(() => parseCommercialView({ ...commercialRead, currencyCode }, commercialRead.projectId)).toThrow(ApiError);
});
it("accepts commercial read currency and rejects an absent currency field", () => {
  expect(parseCommercialView(commercialRead, commercialRead.projectId)).toEqual(commercialRead);
  const missing = { ...commercialPreview } as Partial<typeof commercialPreview>;
  delete missing.currencyCode;
  expect(() => parsePreview(missing, "project-1")).toThrow(ApiError);
});
