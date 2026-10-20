// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseStatus, parseSendToCommercial } from "@/features/budgetQuotation/parser";
import { budgetQuotationService } from "@/features/budgetQuotation/service";
import { forwardBackend } from "@/lib/api/backendBridge";
import { createApiClient } from "@/lib/api/apiClient";
import { ApiError } from "@/lib/api/apiError";
import { confirmedStatus, notConfirmedStatus, sentStatus, sentQuotation } from "./budgetQuotationFixtures";
import { token } from "./fixtures";

describe("4D closed contracts", () => {
  it.each([notConfirmedStatus, confirmedStatus, sentStatus])("accepts $status with exact string enum", (value) => expect(parseStatus(value, "project-1")).toEqual(value));
  it.each([
    { status: 1 }, { status: "Other" }, { sendBlockReason: 0 }, { sendBlockReason: "Unexpected" }, { itemCount: "3" }, { totalQuantity: -1 },
    { canSendToCommercial: "true" }, { canSendToCommercial: false }, { versionNumber: null }, { confirmedAt: "invalid" }, { documentSgCode: null },
    { projectId: "another-project" }, { image: "extra" }, { storageKey: "private" },
  ])("rejects corrupt confirmed status %j", (override) => expect(() => parseStatus({ ...confirmedStatus, ...override }, "project-1")).toThrow(ApiError));
  it("enforces NotConfirmed and SentToCommercial nullable/capability invariants", () => {
    expect(() => parseStatus({ ...notConfirmedStatus, itemCount: 2 }, "project-1")).toThrow(ApiError);
    expect(() => parseStatus({ ...notConfirmedStatus, versionNumber: 1 }, "project-1")).toThrow(ApiError);
    expect(() => parseStatus({ ...sentStatus, canSendToCommercial: true }, "project-1")).toThrow(ApiError);
  });
  it.each(["SgChangedAfterConfirmation", "InvalidState"] as const)("accepts block reason %s", (sendBlockReason) => {
    expect(parseStatus({ ...confirmedStatus, canSendToCommercial: false, sendBlockReason }, "project-1").sendBlockReason).toBe(sendBlockReason);
  });
  it("parses official response and rejects wrong task contracts/unknown fields", () => {
    expect(parseSendToCommercial(sentQuotation, "project-1")).toEqual(sentQuotation);
    for (const override of [{ extra: true }, { budgetTask: { ...sentQuotation.budgetTask, status: "InProgress" } },
      { commercialTask: { ...sentQuotation.commercialTask, area: "Budgets" } }, { commercialTask: { ...sentQuotation.commercialTask, projectId: "other" } }]) {
      expect(() => parseSendToCommercial({ ...sentQuotation, ...override }, "project-1")).toThrow(ApiError);
    }
  });
  it("services use same-origin GET status and bodyless POST send with AbortSignal", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(confirmedStatus)).mockResolvedValueOnce(Response.json(sentQuotation)); vi.stubGlobal("fetch", fetchMock);
    const api = createApiClient({ getSession: () => ({ token, generation: 1 }), invalidateSession: vi.fn() });
    const signal = new AbortController().signal;
    await budgetQuotationService.getStatus(api, "project-1", signal); await budgetQuotationService.sendToCommercial(api, "project-1", signal);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/projects/project-1/budget-quotation/status");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET", signal });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/backend/projects/project-1/send-to-commercial");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST", signal });
    for (const [, init] of fetchMock.mock.calls) { expect(init.body).toBeUndefined(); expect(new Headers(init.headers).has("Content-Type")).toBe(false); }
  });
});
describe("4D BFF scope", () => {
  const root = ["projects", "project-1"];
  const request = (method: string, body?: BodyInit) => new Request("https://frontend.example.test/api/backend/projects/project-1", { method, body, headers: { Authorization: `Bearer ${token}` } });
  it.each([["GET", ["budget-quotation", "status"]], ["POST", ["send-to-commercial"]]] as const)("forwards %s %j without invented payload", async (method, suffix) => {
    vi.stubEnv("SNG_API_BASE_URL", "https://backend.example.test"); const fetchMock = vi.fn().mockResolvedValue(Response.json(method === "GET" ? confirmedStatus : sentQuotation)); vi.stubGlobal("fetch", fetchMock);
    expect((await forwardBackend(request(method), [...root, ...suffix])).status).toBe(200);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method, cache: "no-store" });
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined(); expect(new Headers(fetchMock.mock.calls[0][1].headers).has("Content-Type")).toBe(false);
  });
  it.each([["POST", ["budget-quotation", "status"]], ["PUT", ["budget-quotation", "status"]], ["GET", ["send-to-commercial"]], ["PUT", ["send-to-commercial"]]] as const)("rejects wrong method %s %j", async (method, suffix) => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect((await forwardBackend(request(method), [...root, ...suffix])).status).toBe(405); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects send payload and nested arbitrary paths", async () => {
    vi.stubEnv("SNG_API_BASE_URL", "https://backend.example.test"); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect((await forwardBackend(request("POST", "{}"), [...root, "send-to-commercial"])).status).toBe(415);
    expect((await forwardBackend(request("POST"), [...root, "send-to-commercial", "unknown"])).status).toBe(400);
    expect((await forwardBackend(request("GET"), [...root, "budget-quotation", "status", "unknown"])).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
