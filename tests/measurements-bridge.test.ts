// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { forwardBackend } from "@/lib/api/backendBridge";
import { isLargeDocumentTransfer } from "@/lib/api/backendPath";
import { token } from "./fixtures";
vi.mock("server-only", () => ({}));
beforeEach(() => vi.stubEnv("SNG_API_BASE_URL", "https://backend.example.test"));
const id = "11111111-1111-4111-8111-111111111111";
const headers = { Authorization: `Bearer ${token}`, "X-SnG-Active-Role": "Installation", "Content-Type": "application/json" };
it.each([[], ["initialize"], ["commands"], ["documents", "batch"]])("forwards only the approved measurement route %j", async (...suffix) => {
 const fetch = vi.fn(async (_: URL, init: RequestInit) => { expect(new Headers(init.headers).get("X-SnG-Active-Role")).toBe("Installation"); return Response.json({}); }); vi.stubGlobal("fetch", fetch);
 const method = suffix.length ? "POST" : "GET";
 expect((await forwardBackend(new Request("https://frontend.test/api/backend", { method, headers }), ["projects", id, "measurements", ...suffix])).status).toBe(200);
 expect(fetch).toHaveBeenCalledOnce();
});
it.each([[".."], ["structures", "delete"], ["documents", "private"], ["commands", "extra"]])("rejects paths outside measurement contract %j", async (...suffix) => {
 const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
 expect((await forwardBackend(new Request("https://frontend.test", { method: "POST", headers }), ["projects", id, "measurements", ...suffix])).status).toBe(400); expect(fetch).not.toHaveBeenCalled();
});
it("rejects PUT and grants large upload timeout only to document batch", async () => {
 const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
 expect((await forwardBackend(new Request("https://frontend.test", { method: "PUT", headers }), ["projects", id, "measurements", "commands"])).status).toBe(405);
 expect(fetch).not.toHaveBeenCalled(); expect(isLargeDocumentTransfer("POST", ["projects", id, "measurements", "documents", "batch"])).toBe(true);
 expect(isLargeDocumentTransfer("POST", ["projects", id, "measurements", "commands"])).toBe(false);
});

it("allows only authenticated versioned sketch reads and WEBP images", async () => {
 const fetch = vi.fn(async () => new Response(new Uint8Array([1]), { headers: { "Content-Type": "image/webp" } })); vi.stubGlobal("fetch", fetch);
 const path = ["projects", id, "measurements", "structures", id, "sketches", id, "image"];
 const response = await forwardBackend(new Request("https://frontend.test", { headers }), path);
 expect(response.status).toBe(200); expect(response.headers.get("Content-Type")).toBe("image/webp"); expect(response.headers.get("Cache-Control")).toBe("no-store");
 expect((await forwardBackend(new Request("https://frontend.test", { method: "POST", headers }), path)).status).toBe(405);
 expect((await forwardBackend(new Request("https://frontend.test", { headers }), [...path.slice(0, 6), "..", "image"])).status).not.toBe(200);
 fetch.mockImplementation(async () => new Response("svg", { headers: { "Content-Type": "image/svg+xml" } }));
 expect((await forwardBackend(new Request("https://frontend.test", { headers }), path)).status).toBe(502);
});

it("serves only authenticated scoped report PDFs with no-store and attachment", async () => {
 const fetch = vi.fn(async () => new Response("%PDF", { headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename*=UTF-8''Radicacion%20de%20medidas-Casa%20MDK.pdf" } })); vi.stubGlobal("fetch", fetch);
 const path = ["projects", id, "measurements", "submissions", id, "report"];
 const response = await forwardBackend(new Request("https://frontend.test", { headers }), path);
 expect(response.status).toBe(200); expect(response.headers.get("Content-Disposition")).toContain("Radicacion%20de%20medidas-Casa%20MDK.pdf"); expect(await response.text()).toBe("%PDF"); expect(response.headers.get("Content-Type")).toBe("application/pdf"); expect(response.headers.get("Content-Disposition")).toContain("attachment"); expect(response.headers.get("Cache-Control")).toBe("no-store");
 expect((await forwardBackend(new Request("https://frontend.test", { method: "POST", headers }), path)).status).toBe(405);
 expect((await forwardBackend(new Request("https://frontend.test", { headers }), [...path.slice(0, 4), "..", "report"])).status).toBe(405);
 expect((await forwardBackend(new Request("https://frontend.test"), path)).status).toBe(401);
 fetch.mockImplementation(async () => new Response("html", { headers: { "Content-Type": "text/html" } }));
 expect((await forwardBackend(new Request("https://frontend.test", { headers }), path)).status).toBe(502);
});

it.each([null, 'attachment; filename="../private.pdf"', 'attachment; filename="file.html"'])("rejects missing or unsafe report filename %s", async disposition => {
 vi.stubGlobal("fetch", vi.fn(async () => new Response("%PDF", { headers: { "Content-Type": "application/pdf", ...(disposition ? { "Content-Disposition": disposition } : {}) } })));
 expect((await forwardBackend(new Request("https://frontend.test", { headers }), ["projects", id, "measurements", "submissions", id, "report"])).status).toBe(502);
});
