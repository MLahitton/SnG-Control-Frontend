// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { forwardBackend } from "@/lib/api/backendBridge";
import { token } from "./fixtures";
vi.mock("server-only", () => ({}));
beforeEach(() => vi.stubEnv("SNG_API_BASE_URL", "https://backend.example.test"));
const id = "11111111-1111-4111-8111-111111111111";
const headers = { Authorization: `Bearer ${token}`, "X-SnG-Active-Role": "Accounting" };
it.each([["GET", "initial-deposit"], ["POST", "initial-deposit"], ["POST", "send-approved-quotation-to-accounting"]])("forwards approved %s %s only", async (method, route) => {
 const fetch = vi.fn(async () => Response.json({ available: false })); vi.stubGlobal("fetch", fetch);
 const response = await forwardBackend(new Request("https://frontend.test/api/backend", { method, headers }), ["projects", id, route]);
 expect(response.status).toBe(200); expect(fetch).toHaveBeenCalledTimes(1);
 const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
 expect(url.pathname).toBe(`/api/projects/${id}/${route}`); expect(init.redirect).toBe("error");
 expect(new Headers(init.headers).get("X-SnG-Active-Role")).toBe("Accounting");
});
it.each([["PUT", "initial-deposit"], ["PATCH", "initial-deposit"], ["DELETE", "initial-deposit"], ["GET", "send-approved-quotation-to-accounting"]])("blocks %s %s", async (method, route) => {
 const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
 expect((await forwardBackend(new Request("https://frontend.test", { method, headers }), ["projects", id, route])).status).toBe(405);
 expect(fetch).not.toHaveBeenCalled();
});

it.each([["GET", []], ["POST", []], ["POST", ["receipts", "batch"]], ["POST", [id, "decision"]]])("forwards verification %s %j with active role", async (method, suffix) => {
 const fetch = vi.fn(async () => Response.json({})); vi.stubGlobal("fetch", fetch);
 const response = await forwardBackend(new Request("https://frontend.test", { method, headers }), ["projects", id, "deposit-verifications", ...suffix]);
 expect(response.status).toBe(200); expect(fetch).toHaveBeenCalledOnce();
});
it.each([["DELETE", []], ["GET", ["receipts", "batch"]], ["GET", [id, "decision"]]])("rejects unsupported verification method %s %j", async (method, suffix) => {
 const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
 expect((await forwardBackend(new Request("https://frontend.test", { method, headers }), ["projects", id, "deposit-verifications", ...suffix])).status).toBe(405);
 expect(fetch).not.toHaveBeenCalled();
});
it.each([["..", "decision"], ["foreign", "decision"], ["receipts", "private"], [id, "decision", "extra"]])("rejects unsafe or unapproved verification path %j", async (...suffix) => {
 const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
 expect((await forwardBackend(new Request("https://frontend.test", { method: "POST", headers }), ["projects", id, "deposit-verifications", ...suffix])).status).toBe(400);
 expect(fetch).not.toHaveBeenCalled();
});

it("preserves the safe installation configuration code through BFF and HTTP client", async () => {
 const { ApiError } = await import("@/lib/api/apiError");
 vi.stubEnv("SNG_API_BASE_URL", "https://localhost:7265");
 const body = JSON.stringify({ approve: true, amount: "5000000.00", receivedAt: "2026-01-01T12:00:00-05:00", note: null });
 const fetch = vi.fn(async (url: URL, init: RequestInit) => {
  expect(url.href).toBe(`https://localhost:7265/api/projects/${id}/deposit-verifications/${id}/decision`);
  const forwarded = new Request(url, init);
  expect(forwarded.headers.get("X-SnG-Active-Role")).toBe("Accounting");
  expect(forwarded.headers.get("Authorization")).toBe(headers.Authorization);
  expect(forwarded.headers.get("Content-Type")).toBe("application/json");
  expect(await forwarded.text()).toBe(body);
  return Response.json({ status: 503, code: "InstallationAssigneeNotConfigured", detail: "private diagnostic", subject: "private identity" }, { status: 503 });
 });
 vi.stubGlobal("fetch", fetch);
 const response = await forwardBackend(new Request("http://localhost:3000/api/backend", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body }), ["projects", id, "deposit-verifications", id, "decision"]);
 expect(fetch).toHaveBeenCalledOnce(); expect(response.status).toBe(503);
 const payload = await response.json();
 expect(payload.extensions).toEqual({ code: "InstallationAssigneeNotConfigured" });
 expect(new ApiError(503, payload).code).toBe("InstallationAssigneeNotConfigured");
 expect(JSON.stringify(payload)).not.toMatch(/private|localhost|credential/);
});
it("distinguishes a transport failure from an upstream configuration 503", async () => {
 vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed: private TLS diagnostic")));
 const response = await forwardBackend(new Request("https://frontend.test", { method: "POST", headers, body: undefined }), ["projects", id, "deposit-verifications", id, "decision"]);
 expect(response.status).toBe(502); expect(JSON.stringify(await response.json())).not.toContain("private");
});
it("fails before transport for an invalid base URL", async () => {
 vi.stubEnv("SNG_API_BASE_URL", "invalid-url");
 const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
 const response = await forwardBackend(new Request("https://frontend.test", { method: "POST", headers }), ["projects", id, "deposit-verifications", id, "decision"]);
 expect(response.status).toBe(503); expect(fetch).not.toHaveBeenCalled();
 expect((await response.json()).extensions).toEqual({});
});
it("does not expose arbitrary 503 diagnostics", async () => {
 const { safeProblem } = await import("@/lib/api/apiError");
 expect(safeProblem(503, { code: "PrivateConfiguration", detail: "private" }).extensions).toEqual({});
 expect(safeProblem(502, { code: "InstallationAssigneeNotConfigured" }).extensions).toEqual({});
 expect(safeProblem(503, { extensions: { code: "InstallationAssigneeNotConfigured", subject: "private" } }).extensions).toEqual({ code: "InstallationAssigneeNotConfigured" });
});
