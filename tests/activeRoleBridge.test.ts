// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { forwardBackend } from "@/lib/api/backendBridge";
import { token } from "./fixtures";
vi.mock("server-only", () => ({}));
beforeEach(() => { vi.stubEnv("SNG_API_BASE_URL", "https://backend.example.test"); });
it.each([null, "SuperAdmin", "1", "budgets", "Budgets, Management"])("blocks invalid or missing role %s before fetch", async role => {
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  if (role !== null) headers.set("X-SnG-Active-Role", role);
  const response = await forwardBackend(new Request("https://frontend.test/api/backend/projects", { headers }), ["projects"]);
  expect(response.status).toBe(403); expect(fetchMock).not.toHaveBeenCalled();
});
it("forwards only the selected named role and approved headers", async () => {
  const fetchMock = vi.fn(async () => Response.json([])); vi.stubGlobal("fetch", fetchMock);
  const response = await forwardBackend(new Request("https://frontend.test/api/backend/projects", { headers: {
    Authorization: `Bearer ${token}`, "X-SnG-Active-Role": "Budgets", "X-Subject": "invented", Cookie: "ignored",
  } }), ["projects"]);
  expect(response.status).toBe(200);
  const headers = new Headers((fetchMock.mock.calls[0] as unknown as [URL, RequestInit])[1].headers);
  expect(headers.get("X-SnG-Active-Role")).toBe("Budgets");
  expect(headers.has("X-Subject")).toBe(false); expect(headers.has("Cookie")).toBe(false);
});
