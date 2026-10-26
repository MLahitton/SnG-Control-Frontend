// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { forwardBackend } from "@/lib/api/backendBridge";
import { createApiClient } from "@/lib/api/apiClient";
import { commercialQuotationService } from "@/features/commercialQuotation/service";
import { commercialPreview, commercialConfirmation } from "./commercialQuotationFixtures";
import { token } from "./fixtures";

const fetchMock = vi.fn<typeof fetch>();
const invalidate = vi.fn();
const api = createApiClient({ getSession: () => ({ token, generation: 1 , activeRole: "CommercialHead" as const}), invalidateSession: invalidate });
const file = new File([new Uint8Array([80, 75, 0, 255])], "review.xlsx");
const signal = new AbortController().signal;
beforeEach(() => { vi.stubEnv("SNG_API_BASE_URL", "https://backend.example.test"); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); invalidate.mockReset(); });
const path = (endpoint: string) => ["projects", "project-1", ...endpoint.split("/")];
function request(method: string, body?: BodyInit) { return new Request("https://frontend.example.test/api/backend/projects/project-1", { method, body, headers: { Authorization: `Bearer ${token}`, "X-SnG-Active-Role": "CommercialHead" } }); }

describe("commercial quotation API and BFF", () => {
  it("preview/confirm send only the same File, with no invented Content-Type", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(commercialPreview)).mockResolvedValueOnce(Response.json(commercialConfirmation, { status: 201 }));
    await commercialQuotationService.preview(api, "project-1", file, signal);
    await commercialQuotationService.confirm(api, "project-1", file, signal);
    for (const [index, [url, init]] of fetchMock.mock.calls.entries()) {
      expect(url).toBe(`/api/backend/projects/project-1/commercial-quotation/${index ? "confirm" : "preview"}`);
      expect(init).toMatchObject({ method: "POST", signal, cache: "no-store" });
      expect(new Headers(init?.headers).get("Content-Type")).toBeNull();
      expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${token}`);
      expect([...(init?.body as FormData).keys()]).toEqual(["file"]);
      expect((init?.body as FormData).get("file")).toBe(file);
    }
  });
  it.each([false, true])("downloads stream and server filename (final=%s)", async (final) => {
    const response = new Response(new Uint8Array([80, 75, 0, 255]), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=server.xlsx" } });
    fetchMock.mockResolvedValue(response);
    const blob = vi.spyOn(response, "blob");
    const result = await commercialQuotationService.download(api, "project-1", final, signal);
    expect(result.filename).toBe("server.xlsx"); expect(result.stream).toBe(response.body); expect(blob).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toContain(final ? "commercial-quotation/file" : "budget-quotation/commercial-file");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET", signal });
  });
  it.each(["preview", "confirm"])("BFF preserves multipart bytes/boundary for %s", async (action) => {
    const body = new FormData(); body.append("file", file);
    const input = request("POST", body), copy = input.clone();
    const read = vi.spyOn(input, "formData");
    fetchMock.mockResolvedValue(Response.json(action === "preview" ? commercialPreview : commercialConfirmation, { status: action === "preview" ? 200 : 201 }));
    const result = await forwardBackend(input, path(`commercial-quotation/${action}`));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`https://backend.example.test/api/projects/project-1/commercial-quotation/${action}`);
    expect(init).toMatchObject({ redirect: "error", cache: "no-store", method: "POST" });
    expect(init?.body).toBe(input.body); expect(read).not.toHaveBeenCalled();
    expect(new Headers(init?.headers).get("Content-Type")).toBe(input.headers.get("Content-Type"));
    expect(await new Response(init?.body).arrayBuffer()).toEqual(await copy.arrayBuffer());
    expect(result.status).toBe(action === "preview" ? 200 : 201);
  });
  it.each(["budget-quotation/commercial-file", "commercial-quotation/file"])("BFF streams download %s without parsing", async (endpoint) => {
    const upstream = new Response(new Uint8Array([80, 75, 255]), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=official.xlsx" } });
    fetchMock.mockResolvedValue(upstream);
    const blob = vi.spyOn(upstream, "blob"), bytes = vi.spyOn(upstream, "arrayBuffer");
    const result = await forwardBackend(request("GET"), path(endpoint));
    expect(result.body).toBe(upstream.body); expect(blob).not.toHaveBeenCalled(); expect(bytes).not.toHaveBeenCalled();
    expect(result.headers.get("Content-Disposition")).toBe("attachment; filename=official.xlsx");
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(await result.arrayBuffer()).toEqual(new Uint8Array([80, 75, 255]).buffer);
  });
  it.each(["commercial-quotation/execute", "commercial-quotation/status", "commercial-quotation/file/extra", "budget-quotation/commercial-file/extra"])("rejects unlisted %s", async (endpoint) => {
    expect((await forwardBackend(request("GET"), path(endpoint))).status).toBe(400); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([ ["commercial-quotation/preview", "GET"], ["commercial-quotation/confirm", "PUT"], ["commercial-quotation/file", "POST"], ["budget-quotation/commercial-file", "POST"] ])("rejects wrong method %s %s", async (endpoint, method) => {
    expect((await forwardBackend(request(method), path(endpoint))).status).toBe(405); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("preserves structural business errors while removing diagnostics", async () => {
    fetchMock.mockResolvedValue(Response.json({ code: "StructuralMismatch", missingItems: [{ section: "Main", sourceRow: 15, secret: "hidden" }], unexpectedItems: [{ section: "Additional", sourceRow: 120 }], detail: "private", token, stackTrace: "C:\\private", extensions: { unknown: "hidden" } }, { status: 409 }));
    const result = await forwardBackend(request("POST"), path("commercial-quotation/preview"));
    const data = await result.json();
    expect(data.code).toBe("StructuralMismatch"); expect(data.extensions.missingItems).toEqual([{ section: "Main", sourceRow: 15 }]);
    expect(data.extensions.unexpectedItems).toEqual([{ section: "Additional", sourceRow: 120 }]);
    expect(JSON.stringify(data)).not.toMatch(/hidden|private|test-only/);
  });
  it.each([401, 403, 404, 409, 413, 502])("preserves safe error %s; only 401 invalidates auth", async (status) => {
    fetchMock.mockResolvedValue(Response.json({ code: "DocumentUnavailable", detail: "private" }, { status }));
    await expect(commercialQuotationService.download(api, "project-1", false, signal)).rejects.toMatchObject({ status });
    expect(invalidate).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
  });
});
