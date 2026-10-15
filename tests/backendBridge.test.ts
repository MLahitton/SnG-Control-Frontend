// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET, POST, PUT, HEAD } from "@/app/api/backend/[...path]/route";
import { forwardBackend } from "@/lib/api/backendBridge";
import { token } from "./fixtures";

const upstream = "https://backend.example.test";
const fetchMock = vi.fn<typeof fetch>();
const context = (path = ["projects"]) => ({ params: Promise.resolve({ path }) });
function request(method = "GET", body?: BodyInit, contentType?: string) {
  const init: RequestInit & { duplex?: "half" } = {
    method, body,
    ...(body instanceof ReadableStream ? { duplex: "half" as const } : {}),
    headers: {
      Authorization: `Bearer ${token}`, Accept: "application/json",
      Cookie: "private=cookie", Host: "untrusted.example", Origin: "https://untrusted.example",
      Referer: "https://untrusted.example/private", Connection: "keep-alive", "X-Internal": "private",
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
  };
  return new Request("https://frontend.example.test/api/backend/projects?status=Open&tag=a%2Bb&tag=c", init);
}

beforeEach(() => {
  vi.stubEnv("SNG_API_BASE_URL", upstream + "/ignored");
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => Response.json({ id: "test-project" }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("controlled backend bridge", () => {
  it.each(["clients", "projects", "project-tasks", "notifications"])("allows only the fixed origin and root %s", async (root) => {
    expect((await GET(request(), context([root, "test-id"]))).status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${upstream}/api/${root}/test-id?status=Open&tag=a%2Bb&tag=c`);
  });

  it.each([
    ["auth"], ["admin"], ["https:", "evil.test"], [], ["projects", "."], ["projects", ".."],
    ["projects", ""], ["projects", "%2e%2e"], ["projects", "%252e%252e"], ["projects", "../clients"],
    ["projects", "a\\b"], ["projects", "a/b"], ["projects", "a?b"], ["projects", "a#b"],
    ["projects", "\u0000"], ["projects", " space"], ["projects", "//evil.test"],
  ])("rejects invalid path %j without network access", async (...segments) => {
    expect((await GET(request(), context(segments))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards only approved headers and no cookies/host/origin/referer", async () => {
    await GET(request(), context());
    const options = fetchMock.mock.calls[0][1]!;
    expect(Object.fromEntries(new Headers(options.headers))).toEqual({
      authorization: `Bearer ${token}`, accept: "application/json",
    });
    expect(options).toMatchObject({ cache: "no-store", redirect: "error" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.body).toBeUndefined();
  });

  it.each(["POST", "PUT"])("preserves exact JSON bytes on %s", async (method) => {
    const original = '{ "name": "Prueba á", "value": 4 }';
    const handler = method === "POST" ? POST : PUT;
    await handler(request(method, original, "application/json; charset=utf-8"), context());
    const options = fetchMock.mock.calls[0][1]!;
    expect(options.method).toBe(method);
    expect(new Headers(options.headers).get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(await new Response(options.body).text()).toBe(original);
  });

  it("supports a POST with no body or Content-Type", async () => {
    await POST(request("POST"), context());
    const options = fetchMock.mock.calls[0][1]!;
    expect(options.body).toBeUndefined();
    expect(new Headers(options.headers).has("Content-Type")).toBe(false);
  });

  it.each([
    ["POST", 201], ["POST", 409], ["PUT", 204], ["PUT", 409],
  ] as const)("forwards a Next-style empty stream on %s without inventing a payload (upstream %s)", async (method, status) => {
    const input = request(method, new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(0)); controller.close(); },
    }));
    expect(input.body).not.toBeNull();
    expect(input.headers.has("Content-Type")).toBe(false);
    fetchMock.mockResolvedValue(status === 204 ? new Response(null, { status }) : Response.json({ id: "task-1" }, { status }));
    const handler = method === "POST" ? POST : PUT;
    const response = await handler(input, context(["projects", "test-id", "send-to-budgets"]));
    expect(response.status).toBe(status);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const options = fetchMock.mock.calls[0][1]!;
    expect(options.method).toBe(method);
    expect(Object.fromEntries(new Headers(options.headers))).toEqual({ authorization: `Bearer ${token}`, accept: "application/json" });
    expect(options).not.toHaveProperty("body");
    expect(options).not.toHaveProperty("duplex");
  });

  it("accepts an empty stream with explicit Content-Length zero and no Content-Type", async () => {
    const input = request("POST", new ReadableStream({ start(controller) { controller.close(); } }));
    input.headers.set("Content-Length", "0");
    expect((await POST(input, context())).status).toBe(200);
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("body");
  });

  it.each(["POST", "PUT"])("rejects actual bytes without Content-Type on %s, even after empty chunks", async (method) => {
    const cancel = vi.fn();
    const input = request(method, new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(0)); controller.enqueue(new Uint8Array([1])); },
      cancel,
    }));
    // An untrusted length must not make actual content disappear.
    input.headers.set("Content-Length", "0");
    const handler = method === "POST" ? POST : PUT;
    expect((await handler(input, context())).status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects a declared nonempty payload without Content-Type", async () => {
    const input = request("POST");
    input.headers.set("Content-Length", "10");
    expect((await POST(input, context())).status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels a pending untyped stream when the request aborts", async () => {
    const cancel = vi.fn();
    const controller = new AbortController();
    const input = new Request(request("POST", new ReadableStream<Uint8Array>({ cancel })), { signal: controller.signal });
    const result = POST(input, context());
    await vi.waitFor(() => expect(input.body?.locked).toBe(true));
    controller.abort();
    expect((await result).status).toBe(502);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles an unreadable untyped stream without forwarding or exposing diagnostics", async () => {
    const input = request("POST", new ReadableStream({ start(controller) { controller.error(new Error("private diagnostic")); } }));
    const response = await POST(input, context());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("private diagnostic");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "application/vnd.sng+json", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream",
  ])("forwards the original stream without reading or reconstructing %s", async (contentType) => {
    const bytes = contentType.endsWith("+json") ? new TextEncoder().encode('{ "name": "Prueba" }') : new Uint8Array([80, 75, 0, 255]);
    const input = request("PUT", bytes, contentType);
    expect((await PUT(input, context())).status).toBe(200);
    const options = fetchMock.mock.calls[0][1]!;
    expect(options.body).toBe(input.body);
    expect(input.bodyUsed).toBe(false);
    expect(new Headers(options.headers).get("Content-Type")).toBe(contentType);
    expect(new Uint8Array(await new Response(options.body).arrayBuffer())).toEqual(bytes);
  });

  it("preserves multipart bytes and original boundary", async () => {
    const multipart = new FormData();
    multipart.set("file", new Blob([new Uint8Array([0, 255, 80, 75, 3, 4])]), "quotation.xlsx");
    const input = request("POST", multipart);
    const bytes = await input.clone().arrayBuffer();
    const contentType = input.headers.get("Content-Type");
    await POST(input, context(["projects", "test-id", "quotation"]));
    const options = fetchMock.mock.calls[0][1]!;
    expect(new Headers(options.headers).get("Content-Type")).toBe(contentType);
    expect(options.body).toBe(input.body);
    expect(input.bodyUsed).toBe(false);
    expect(await new Response(options.body).arrayBuffer()).toEqual(bytes);
  });

  it("preserves XLSX download bytes, safe headers and filename", async () => {
    const bytes = new Uint8Array([80, 75, 0, 255, 17]);
    fetchMock.mockResolvedValue(new Response(bytes, { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="confirmed.xlsx"',
      "Cache-Control": "public, max-age=3600", "Set-Cookie": "secret=value",
      Server: "private", "X-Internal": upstream,
    } }));
    const response = await GET(request(), context(["projects", "test-id", "confirmed.xlsx"]));
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="confirmed.xlsx"');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(response.headers.has("Server")).toBe(false);
    expect(response.headers.has("X-Internal")).toBe(false);
  });

  it.each([200, 201])("preserves successful JSON status %s", async (status) => {
    fetchMock.mockResolvedValue(Response.json({ id: "test-id" }, { status }));
    const response = await POST(request("POST"), context());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ id: "test-id" });
  });

  it("supports 204 without a JSON body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await PUT(request("PUT"), context());
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it.each([400, 401, 403, 404, 409, 413, 500, 502, 503])("preserves status %s with safe ProblemDetails", async (status) => {
    fetchMock.mockResolvedValue(Response.json({
      title: `Failure at ${upstream}`, detail: "C:\\private\\storage",
      stackTrace: "private stack", token,
    }, { status, headers: { "Content-Type": "application/problem+json" } }));
    const response = await GET(request(), context());
    expect(response.status).toBe(status);
    expect(response.headers.get("Content-Type")).toBe("application/problem+json");
    const body = await response.text();
    for (const secret of [upstream, "private", token]) expect(body).not.toContain(secret);
  });

  it.each(["flat", "nested"])("preserves 409 business code and allowlisted extensions (%s)", async (shape) => {
    const extensions = { code: "StructuralMismatch", field: "items", fields: ["width", "height"], retryAfterSeconds: 5, stackTrace: "private" };
    fetchMock.mockResolvedValue(Response.json(shape === "flat" ? extensions : { extensions }, { status: 409 }));
    const response = await GET(request(), context());
    expect(await response.json()).toMatchObject({
      status: 409, code: "StructuralMismatch",
      extensions: { code: "StructuralMismatch", field: "items", fields: ["width", "height"], retryAfterSeconds: 5 },
    });
  });

  it("passes Retry-After only in a safe format", async () => {
    fetchMock.mockResolvedValue(new Response("private", { status: 429, headers: { "Retry-After": "120" } }));
    expect((await GET(request(), context())).headers.get("Retry-After")).toBe("120");
  });

  it("does not leak internal values in JSON responses or extensions", async () => {
    fetchMock.mockResolvedValue(Response.json({
      id: "safe", link: upstream + "/private", stackTrace: "private", authorization: token,
      path: "C:\\private\\file", nested: { token, base: upstream },
    }));
    const response = await GET(request(), context());
    const body = await response.text();
    expect(body).not.toContain(upstream);
    expect(body).not.toContain(token);
    expect(body).not.toContain("private");
    expect(body).toContain("safe");
  });

  it.each(["network", "TLS"])("maps %s failure to safe 502", async (kind) => {
    fetchMock.mockRejectedValue(new Error(`${kind}: ${upstream} ${token}`));
    const response = await GET(request(), context());
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).not.toContain(upstream);
    expect(body).not.toContain(token);
  });

  it("returns safe 503 for missing configuration without fetch", async () => {
    vi.stubEnv("SNG_API_BASE_URL", "");
    const response = await GET(request(), context());
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires Bearer before forwarding", async () => {
    expect((await GET(new Request("https://frontend.example.test"), context())).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["PATCH", "DELETE", "HEAD"])("does not forward unsupported %s", async (method) => {
    expect((await forwardBackend(request(method), ["projects"])).status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explicitly disables Next automatic HEAD-to-GET forwarding", () => {
    expect(HEAD().status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["POST", "PUT"])("rejects unexpected upload media types on %s", async (method) => {
    const handler = method === "POST" ? POST : PUT;
    expect((await handler(request(method, "private", "text/html"), context())).status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([302, 307])("does not follow upstream redirect %s", async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status, headers: { Location: "https://evil.example" } }));
    expect((await GET(request(), context())).status).toBe(502);
  });

  it("does not expose successful HTML diagnostics as a download", async () => {
    fetchMock.mockResolvedValue(new Response("<h1>private details</h1>", { headers: { "Content-Type": "text/html" } }));
    expect((await GET(request(), context())).status).toBe(502);
  });

  it("does not forward extra Content-Disposition parameters with internal paths", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1]), { headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="confirmed.xlsx"; internal="/private/storage"',
    } }));
    const response = await GET(request(), context());
    expect(response.headers.has("Content-Disposition")).toBe(false);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1]));
  });
});
