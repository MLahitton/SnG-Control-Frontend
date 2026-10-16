// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET, POST, HEAD, PUT, PATCH, DELETE } from "@/app/api/intelligence/[...path]/route";
import { intelligenceResponse, requestId } from "./intelligenceFixtures";
import { token } from "./fixtures";
import { GET as controlGET } from "@/app/api/backend/[...path]/route";
const fetchMock = vi.fn<typeof fetch>();
const context = (path: string) => ({ params: Promise.resolve({ path: path.split("/") }) });
function request(method = "GET", body?: BodyInit, type?: string, query = "") {
  return new Request("https://frontend.example.test/api/intelligence/session" + query, { method, body, headers: { Authorization: `Bearer ${token}`, Cookie: "private", "X-Internal": "private", ...(type ? { "Content-Type": type } : {}) } });
}
beforeEach(() => {
  vi.stubEnv("SNG_INTELLIGENCE_BASE_URL", "http://127.0.0.1:8001");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(Response.json(intelligenceResponse));
});
describe("Intelligence BFF", () => {
  it("keeps Management and Intelligence on separate configured origins", async () => {
    vi.stubEnv("SNG_API_BASE_URL", "https://control.example.test");
    vi.stubEnv("SNG_INTELLIGENCE_BASE_URL", "https://intelligence.example.test");
    fetchMock.mockResolvedValueOnce(Response.json({ totalProjects: 12 }));
    await controlGET(new Request("https://frontend.example.test/api/backend/management/overview", {
      headers: { Authorization: `Bearer ${token}` },
    }), context("management/overview"));
    await POST(request("POST", '{"message":"consulta"}', "application/json"), context("chat"));
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://control.example.test/api/management/overview",
      "https://intelligence.example.test/api/intelligence/chat",
    ]);
  });
  it("forwards session to the fixed origin with Bearer only and safe cache headers", async () => {
    fetchMock.mockResolvedValue(Response.json({ authenticated: true, isManagement: true, token: "remove" }));
    const response = await GET(request(), context("session"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: true, isManagement: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:8001/api/intelligence/session");
    expect(init).toMatchObject({ method: "GET", cache: "no-store", redirect: "error" });
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${token}`);
    expect(new Headers(init?.headers).has("Cookie")).toBe(false);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each(["health", "../chat", "chat/extra", "https:/evil.test", "%2e%2e", "voice//speech"])("rejects path %s", async (path) => {
    expect((await GET(request(), context(path))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects embedded slashes, queries and missing auth", async () => {
    expect((await POST(request("POST"), { params: Promise.resolve({ path: ["voice/speech"] }) })).status).toBe(400);
    expect((await GET(request("GET", undefined, undefined, "?url=https://evil.test"), context("session"))).status).toBe(400);
    const input = request(); input.headers.delete("Authorization");
    expect((await GET(input, context("session"))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([HEAD, PUT, PATCH, DELETE])("rejects unsupported methods without network", async (handler) => {
    const response = await handler(request("PUT"), context("session"));
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("preserves JSON request bytes without rebuilding or adding fields", async () => {
    const input = request("POST", '{ "message": "consulta" }', "application/json");
    expect((await POST(input, context("chat"))).status).toBe(200);
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.body).toBe(input.body);
    expect(await new Response(init.body).text()).toBe('{ "message": "consulta" }');
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });
  it.each(["voice", "voice/transcribe"])("preserves multipart bytes and boundary for %s", async (path) => {
    fetchMock.mockResolvedValue(Response.json(path === "voice" ? { ...intelligenceResponse, transcript: "Hola" } : { transcript: "Hola" }));
    const form = new FormData(); form.append("file", new Blob([new Uint8Array([0, 1, 2, 255])], { type: "audio/mp4" }), "voice.m4a");
    const input = request("POST", form);
    const bytes = await input.clone().arrayBuffer();
    expect((await POST(input, context(path))).status).toBe(200);
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.body).toBe(input.body);
    expect(new Headers(init.headers).get("Content-Type")).toBe(input.headers.get("Content-Type"));
    expect(await new Response(init.body).arrayBuffer()).toEqual(bytes);
  });
  it("streams MP3 response without buffering, preserves bytes and excludes upstream headers", async () => {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([73, 68, 51, 255])); controller.close(); } });
    fetchMock.mockResolvedValue(new Response(stream, { headers: { "Content-Type": "audio/mpeg", "Set-Cookie": "private", Server: "private" } }));
    const response = await POST(request("POST", '{"text":"hola","responseType":"direct"}', "application/json"), context("voice/speech"));
    expect(response.body).toBe(stream);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([73, 68, 51, 255]);
  });
  it.each([401, 403, 422, 429, 503])("sanitizes HTTP %s retaining only safe requestId", async (status) => {
    fetchMock.mockResolvedValue(Response.json({ requestId, error: "provider-details", stack: "private", token, path: "C:\\private" }, { status }));
    const response = await POST(request("POST", '{"message":"hi"}', "application/json"), context("chat"));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ status, requestId });
  });
  it.each([token, "http://127.0.0.1:8001", "C:\\private\\file", "sk-testprivateapikey123"])("rejects leaked credentials/internal strings in valid response fields", async (secret) => {
    fetchMock.mockResolvedValue(Response.json({ ...intelligenceResponse, answer: secret }));
    const response = await POST(request("POST", "{}", "application/json"), context("chat"));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(secret);
  });
  it.each(["text/html", "multipart/form-data"])("rejects incompatible media type %s", async (type) => {
    expect((await POST(request("POST", "content", type), context("chat"))).status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects boundaryless uploads and handles redirects/network/config safely", async () => {
    expect((await POST(request("POST", "bytes", "multipart/form-data"), context("voice"))).status).toBe(415);
    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { Location: "https://evil.test" } }));
    expect((await GET(request(), context("session"))).status).toBe(502);
    fetchMock.mockRejectedValue(new Error("private network"));
    expect((await GET(request(), context("session"))).status).toBe(502);
    vi.stubEnv("SNG_INTELLIGENCE_BASE_URL", "https://user:secret@host.test");
    expect((await GET(request(), context("session"))).status).toBe(503);
  });
  it("rejects excessive JSON responses and declared excessive uploads", async () => {
    fetchMock.mockResolvedValue(Response.json({ answer: "a".repeat(600000) }));
    expect((await POST(request("POST", "{}", "application/json"), context("chat"))).status).toBe(502);
    const input = request("POST", "audio", "multipart/form-data; boundary=abc"); input.headers.set("Content-Length", "99999999");
    expect((await POST(input, context("voice"))).status).toBe(413);
  });
});
