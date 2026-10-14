// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET } from "@/app/api/auth/me/route";
import { token, user } from "./fixtures";

const fetchMock = vi.fn<typeof fetch>();
const request = (authorization = `Bearer ${token}`) => new Request("https://frontend.example.test/api/auth/me", { headers: { Authorization: authorization } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("SNG_API_BASE_URL", "https://backend.example.test/ignored-path");
});

describe("GET /api/auth/me bridge", () => {
  it.each(["", "Basic abc", "Bearer", "Bearer one two"])("rejects invalid authorization %j without calling backend", async (header) => {
    expect((await GET(request(header))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("forwards Authorization only to the fixed endpoint and whitelists identity", async () => {
    fetchMock.mockResolvedValue(Response.json({ ...user, secret: "private" }));
    const response = await GET(request());
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://backend.example.test/api/auth/me");
    expect(options).toMatchObject({ headers: { Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error" });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(user);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("forwards 401 without exposing backend body", async () => {
    fetchMock.mockResolvedValue(new Response("private error", { status: 401 }));
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("private");
  });
  it.each([403, 429, 500, 503])("preserves backend error status %s with a controlled JSON", async (status) => {
    fetchMock.mockResolvedValue(new Response("private configuration", { status }));
    const response = await GET(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "No se pudo validar la sesión." });
  });
  it.each([204, 302])("maps unexpected success/redirect %s to 502", async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    expect((await GET(request())).status).toBe(502);
  });
  it("rejects malformed identity", async () => {
    fetchMock.mockResolvedValue(Response.json({ subject: 1, token }));
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(token);
  });
  it("handles non-JSON upstream response", async () => {
    fetchMock.mockResolvedValue(new Response("<html>private error</html>"));
    expect((await GET(request())).status).toBe(502);
  });
  it("controls network/TLS failure without revealing internal configuration", async () => {
    fetchMock.mockRejectedValue(new Error("certificate https://backend.example.test"));
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "El servicio de acceso no está disponible." });
  });
  it("reports missing server configuration without exposing values", async () => {
    vi.stubEnv("SNG_API_BASE_URL", "");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("SNG_API_BASE_URL");
    expect(log).toHaveBeenCalledExactlyOnceWith("Configuración inválida: SNG_API_BASE_URL.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
