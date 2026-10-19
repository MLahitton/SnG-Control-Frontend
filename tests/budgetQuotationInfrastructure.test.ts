// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { forwardBackend } from "@/lib/api/backendBridge";
import { createApiClient } from "@/lib/api/apiClient";
import { ApiError } from "@/lib/api/apiError";
import { budgetQuotationService } from "@/features/budgetQuotation/service";
import { buildConfirmation, createDraft, quotationError } from "@/features/budgetQuotation/validation";
import { quotationConfirmed, quotationPreview } from "./budgetQuotationFixtures";
import { token } from "./fixtures";

const fetchMock = vi.fn<typeof fetch>();
const invalidate = vi.fn();
const api = createApiClient({ getSession: () => ({ token, generation: 1 }), invalidateSession: invalidate });
const signal = new AbortController().signal;
const file = new File([new Uint8Array([80, 75, 0, 255])], "original.xlsx");
const payload = buildConfirmation(quotationPreview, createDraft(quotationPreview))!;
beforeEach(() => { vi.stubEnv("SNG_API_BASE_URL", "https://backend.example.test"); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });

describe("quotation API service", () => {
  it("uploads only file for preview, then the SAME File and exact confirmation JSON with charset", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(quotationPreview)).mockResolvedValueOnce(Response.json(quotationConfirmed, { status: 201 }));
    await budgetQuotationService.preview(api, "project-1", file, signal);
    await budgetQuotationService.confirm(api, "project-1", file, payload, signal);
    const [previewUrl, previewInit] = fetchMock.mock.calls[0];
    const [confirmUrl, confirmInit] = fetchMock.mock.calls[1];
    expect(previewUrl).toBe("/api/backend/projects/project-1/budget-quotation/preview");
    expect(confirmUrl).toBe("/api/backend/projects/project-1/budget-quotation/confirm");
    for (const init of [previewInit, confirmInit]) {
      expect(init).toMatchObject({ method: "POST", signal, cache: "no-store" });
      expect(new Headers(init?.headers).get("Content-Type")).toBeNull();
      expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${token}`);
      expect((init?.body as FormData).get("file")).toBe(file);
    }
    expect([...(previewInit?.body as FormData).keys()]).toEqual(["file"]);
    const body = confirmInit?.body as FormData;
    expect([...body.keys()]).toEqual(["file", "confirmation"]);
    const json = body.get("confirmation") as Blob;
    expect(json.type).toBe("application/json; charset=utf-8");
    expect(JSON.parse(await json.text())).toEqual(payload);
  });
  it.each([400, 401, 403, 404, 409, 413, 502])("retains safe status %s without diagnostics", async (status) => {
    fetchMock.mockResolvedValue(Response.json({ detail: "private diagnostic", token, stackTrace: "private stack" }, { status }));
    await expect(budgetQuotationService.preview(api, "project-1", file, signal)).rejects.toMatchObject({ status });
  });
});
function request(method: string, body?: BodyInit) {
  return new Request("https://frontend.example.test/api/backend/projects/project-1/budget-quotation/preview", { method, body, headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
}
describe("quotation BFF", () => {
  it.each(["preview", "confirm"])("streams %s multipart without reading/rebuilding bytes and preserves status", async (endpoint) => {
    const body = new FormData(); body.append("file", file);
    if (endpoint === "confirm") body.append("confirmation", new Blob([JSON.stringify(payload)], { type: "application/json; charset=utf-8" }));
    const input = request("POST", body);
    const clone = input.clone();
    const read = vi.spyOn(input, "formData");
    fetchMock.mockResolvedValue(Response.json(endpoint === "preview" ? quotationPreview : quotationConfirmed, { status: endpoint === "preview" ? 200 : 201 }));
    const result = await forwardBackend(input, ["projects", "project-1", "budget-quotation", endpoint]);
    expect(result.status).toBe(endpoint === "preview" ? 200 : 201);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`https://backend.example.test/api/projects/project-1/budget-quotation/${endpoint}`);
    expect(init?.body).toBe(input.body); expect(read).not.toHaveBeenCalled();
    expect(new Headers(init?.headers).get("Content-Type")).toBe(input.headers.get("Content-Type"));
    expect(await new Response(init?.body).arrayBuffer()).toEqual(await clone.arrayBuffer());
    expect(await result.json()).toEqual(endpoint === "preview" ? quotationPreview : quotationConfirmed);
  });
  it.each(["GET", "PUT", "DELETE"])("does not broaden quotation methods: %s", async (method) => {
    expect((await forwardBackend(request(method), ["projects", "project-1", "budget-quotation", "preview"])).status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["execute", "file", "unknown"])("rejects unknown quotation path %s", async (endpoint) => {
    expect((await forwardBackend(request("POST"), ["projects", "project-1", "budget-quotation", endpoint])).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    [409, "preview", "El SG del archivo no coincide con el proyecto.", "SgCodeMismatch"],
    [409, "confirm", "El SG del archivo no coincide con el proyecto.", "SgCodeMismatch"],
    [409, "confirm", "La cotización inicial ya está confirmada.", "AlreadyConfirmed"],
    [409, "preview", "El proyecto no está listo para el preview de Presupuestos.", "InvalidWorkflowState"],
    [409, "confirm", "El proyecto no está listo para confirmar la cotización.", "InvalidWorkflowState"],
    [400, "confirm", "La confirmación debe cubrir exactamente los ítems del archivo con valores válidos.", "InvalidConfirmation"],
  ] as const)("maps only known %s/%s titles to %s", async (status, endpoint, title, code) => {
    fetchMock.mockResolvedValue(Response.json({ title, detail: token, stackTrace: "C:\\private", extensions: { unknown: "secret" } }, { status }));
    const result = await forwardBackend(request("POST"), ["projects", "project-1", "budget-quotation", endpoint]);
    const safe = await result.json();
    expect(safe.code).toBe(code); expect(JSON.stringify(safe)).not.toMatch(/private|secret|test-only/);
    expect(quotationError(new ApiError(status, safe))).not.toBe(new ApiError(status).message);
  });
  it("never forwards arbitrary titles, and does not translate outside quotation endpoints", async () => {
    fetchMock.mockImplementation(async () => Response.json({ title: "La cotización inicial ya está confirmada.", detail: token }, { status: 409 }));
    expect(await (await forwardBackend(request("POST"), ["projects", "project-1", "send-to-budgets"])).json()).not.toHaveProperty("code");
    fetchMock.mockResolvedValue(Response.json({ title: "arbitrary private title" }, { status: 409 }));
    const result = await forwardBackend(request("POST"), ["projects", "project-1", "budget-quotation", "confirm"]);
    expect(JSON.stringify(await result.json())).not.toContain("private");
  });
});
