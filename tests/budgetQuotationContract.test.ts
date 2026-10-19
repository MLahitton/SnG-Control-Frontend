import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/apiError";
import { parseConfirmation, parsePreview } from "@/features/budgetQuotation/parser";
import { buildConfirmation, createDraft, quotationError } from "@/features/budgetQuotation/validation";
import { quotationConfirmed, quotationPreview } from "./budgetQuotationFixtures";

describe("closed quotation contracts", () => {
  it("preserves the exact preview, received order, image and warnings", () => {
    expect(parsePreview(quotationPreview, "project-1")).toEqual(quotationPreview);
  });
  it("preserves confirmed metadata, extracted/confirmed values and backend task timing", () => {
    expect(parseConfirmation(quotationConfirmed, "project-1")).toEqual(quotationConfirmed);
  });
  it.each([
    { extra: "unrecognized" }, { projectId: "another-project" }, { items: null }, { itemCount: 4 }, { totalQuantity: "6" },
    { document: { ...quotationPreview.document, storagePath: "private" } },
    { warnings: [{ ...quotationPreview.warnings[0], code: "Unknown" }] },
    { warnings: [{ ...quotationPreview.warnings[0], sourceRow: 999 }] },
  ])("rejects invalid preview envelope %j", (override) => {
    expect(() => parsePreview({ ...quotationPreview, ...override }, "project-1")).toThrow(ApiError);
  });
  it.each([
    { section: "Other" }, { sourceRow: 0 }, { sourceRow: -1 }, { sourceRow: 1.5 }, { quantity: 1.5 },
    { width: 0 }, { height: -1 }, { squareMeters: NaN }, { itemNumber: "  " }, { system: null }, { extra: "unknown" },
    { image: { contentType: "image/svg+xml", base64: "PHN2Zz4=" } },
    { image: { contentType: "text/html", base64: "PHN2Zz4=" } },
    { image: { contentType: "image/png", base64: "not-base64" } },
  ])("rejects invalid preview item %j", (override) => {
    expect(() => parsePreview({ ...quotationPreview, items: [{ ...quotationPreview.items[0], ...override }, ...quotationPreview.items.slice(1)] }, "project-1")).toThrow(ApiError);
  });
  it("rejects duplicate item identities and corrupted confirmation/task contracts", () => {
    expect(() => parsePreview({ ...quotationPreview, items: [quotationPreview.items[0], quotationPreview.items[0], quotationPreview.items[2]] }, "project-1")).toThrow(ApiError);
    for (const override of [
      { projectId: "other" }, { confirmedAt: "invalid" }, { itemCount: 2 }, { versionNumber: 0 },
      { items: [{ ...quotationConfirmed.items[0], confirmed: { ...quotationConfirmed.items[0].confirmed, unitPrice: 20 } }, ...quotationConfirmed.items.slice(1)] },
      { prepareQuotationTask: { ...quotationConfirmed.prepareQuotationTask, status: "invented" } },
      { prepareQuotationTask: { ...quotationConfirmed.prepareQuotationTask, assignedAt: null } },
      { prepareQuotationTask: { ...quotationConfirmed.prepareQuotationTask, wasOverdue: "false" } },
    ]) expect(() => parseConfirmation({ ...quotationConfirmed, ...override }, "project-1")).toThrow(ApiError);
  });
});
describe("confirmation draft", () => {
  it("trims all text, preserves all identities in order and never recalculates m²", () => {
    const draft = createDraft(quotationPreview);
    draft[0].itemNumber = "  Changed  "; draft[0].location = "  Lobby  "; draft[0].width = "50";
    const payload = buildConfirmation(quotationPreview, draft)!;
    expect(payload.items[0]).toMatchObject({ itemNumber: "Changed", location: "Lobby", width: 50, squareMeters: 5.75 });
    expect(payload.items.map(({ section, sourceRow }) => ({ section, sourceRow }))).toEqual(quotationPreview.items.map(({ section, sourceRow }) => ({ section, sourceRow })));
    expect(Object.keys(payload.items[0])).toHaveLength(13);
    expect(payload.items[0]).not.toHaveProperty("image");
  });
  it.each([ ["itemNumber", " "], ["width", "0"], ["height", "-1"], ["squareMeters", ""], ["quantity", "1.5"], ["quantity", "0"], ["width", "Infinity"] ] as const)("rejects %s=%s", (field, value) => {
    const draft = createDraft(quotationPreview); draft[0][field] = value;
    expect(buildConfirmation(quotationPreview, draft)).toBeNull();
  });
  it("rejects missing or extra drafts", () => {
    const draft = createDraft(quotationPreview);
    expect(buildConfirmation(quotationPreview, draft.slice(1))).toBeNull();
    expect(buildConfirmation(quotationPreview, [...draft, draft[0]])).toBeNull();
  });
  it.each([
    ["UnreadableWorkbook", "No fue posible leer"], ["UnsupportedWorkbookFormat", "formato de cotización soportado"],
    ["InvalidDocumentSgCode", "SG incluido"], ["TechnicalLimitExceeded", "límites técnicos permitidos"],
    ["SgCodeMismatch", "no coincide"], ["AlreadyConfirmed", "ya está confirmada"], ["InvalidConfirmation", "todos los ítems"],
  ])("maps safe %s to a human message", (code, expected) => {
    expect(quotationError(new ApiError(code === "SgCodeMismatch" || code === "AlreadyConfirmed" ? 409 : 400, { extensions: { code } }))).toContain(expected);
  });
});
