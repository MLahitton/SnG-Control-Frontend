// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { forwardBackend } from "@/lib/api/backendBridge";
import { isBackendPath } from "@/lib/api/backendPath";
import { quotationViewService } from "@/features/quotationViews/service";
import { createApiClient } from "@/lib/api/apiClient";
import { token } from "./fixtures";
const id = "00000000-0000-0000-0000-000000000001", item = "00000000-0000-0000-0000-000000000002";
const image = ["projects", id, "budget-quotation", "items", item, "image"];
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => { vi.stubEnv("SNG_API_BASE_URL", "https://backend.example.test"); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
const request = (method = "GET", role = "CommercialHead") => new Request("https://frontend.test/api/backend/projects", { method, headers: { Authorization: `Bearer ${token}`, "X-SnG-Active-Role": role } });
it.each(["budget", "commercial"])("%s read view is GET only, preserves the active role, no-store and authorization failures", async kind => {
  const path = ["projects", id, `${kind}-quotation`, "view"];
  expect(isBackendPath(path)).toBe(true);
  expect((await forwardBackend(request("POST"), path)).status).toBe(405); expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValueOnce(Response.json({ projectId: id }));
  const response = await forwardBackend(request(), path);
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(String(fetchMock.mock.calls[0][0])).toBe(`https://backend.example.test/api/projects/${id}/${kind}-quotation/view`);
  const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
  expect(headers.get("X-SnG-Active-Role")).toBe("CommercialHead"); expect(headers.get("Authorization")).toBe(`Bearer ${token}`);
  fetchMock.mockResolvedValueOnce(Response.json({}, { status: 403 }));
  expect((await forwardBackend(request(), path)).status).toBe(403);
});
it.each(["image/png", "image/jpeg", "image/gif", "image/bmp", "image/tiff"])("streams only an approved raster format: %s", async type => {
  const bytes = new Uint8Array([0, 255, 8, 16]); fetchMock.mockResolvedValueOnce(new Response(bytes, { headers: { "Content-Type": type } }));
  const response = await forwardBackend(request(), image);
  expect(response.headers.get("Content-Type")).toBe(type); expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
});
it.each(["text/html", "image/svg+xml", "application/json"])("rejects active or unexpected image payloads: %s", async type => {
  fetchMock.mockResolvedValueOnce(new Response("unsafe", { headers: { "Content-Type": type } }));
  expect((await forwardBackend(request(), image)).status).toBe(502);
});
it.each(["..", "%2e%2e", "https://evil.test", "C:\private", "invalid"])("rejects unsafe item identifiers: %s", async segment => {
  const path = [...image]; path[4] = segment;
  expect(isBackendPath(path)).toBe(false); expect((await forwardBackend(request(), path)).status).toBe(400); expect(fetchMock).not.toHaveBeenCalled();
});
it("image route cannot be mutated and rejects missing roles", async () => {
  expect((await forwardBackend(request("POST"), image)).status).toBe(405);
  expect((await forwardBackend(request("GET", "Invented"), image)).status).toBe(403); expect(fetchMock).not.toHaveBeenCalled();
});
it("404 hides snapshots, whereas 403 is never silently treated as missing or logout", async () => {
  const invalidate = vi.fn();
  const api = createApiClient({ getSession: () => ({ token, generation: 1, activeRole: "CommercialHead" }), invalidateSession: invalidate });
  fetchMock.mockResolvedValueOnce(Response.json({}, { status: 404 }));
  expect(await quotationViewService.budget(api, id, new AbortController().signal)).toBeNull();
  fetchMock.mockResolvedValueOnce(Response.json({}, { status: 403 }));
  await expect(quotationViewService.commercial(api, id, new AbortController().signal)).rejects.toMatchObject({ status: 403 });
  expect(invalidate).not.toHaveBeenCalled();
});
