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
