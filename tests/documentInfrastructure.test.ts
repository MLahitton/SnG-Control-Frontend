// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { DELETE, GET, POST } from "@/app/api/backend/[...path]/route";
import { createApiClient } from "@/lib/api/apiClient";
import { ApiError } from "@/lib/api/apiError";
import { documentBatch, documentsService } from "@/features/documents/service";
import { validateDocumentBatch, documentErrorMessage } from "@/features/documents/validation";
import { formatBytes } from "@/lib/formatBytes";
import { token } from "./fixtures";

const fetchMock = vi.fn<typeof fetch>();
const invalidateSession = vi.fn();
const api = () => createApiClient({ getSession: () => ({ token, generation: 1 }), invalidateSession });
const context = (path: string) => ({ params: Promise.resolve({ path: path.split("/") }) });
function request(method: string, body?: BodyInit) {
  const init: RequestInit & { duplex?: "half" } = { method, body, headers: { Authorization: `Bearer ${token}` } };
  if (body instanceof ReadableStream) init.duplex = "half";
  return new Request("https://frontend.example.test/api/backend/projects/p/documents/d", init);
}
beforeEach(() => {
  vi.stubEnv("SNG_API_BASE_URL", "https://backend.example.test");
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("document BFF", () => {
  it.each([false, true])("allows only bodyless document DELETE and preserves 204 (empty stream %s)", async (emptyStream) => {
    const input = request("DELETE", emptyStream ? new ReadableStream({ start(controller) { controller.close(); } }) : undefined);
    const result = await DELETE(input, context("projects/p/documents/d"));
    expect(result.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://backend.example.test/api/projects/p/documents/d");
    expect(init?.method).toBe("DELETE");
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
  });
  it.each(["clients", "projects/p", "project-tasks", "notifications", "projects/p/documents/d/file", "projects/p/documents", "projects/../documents/d", "projects/%2e/documents/d"])("rejects DELETE %s", async (path) => {
    expect((await DELETE(request("DELETE"), context(path))).status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects document DELETE with actual content", async () => {
    expect((await DELETE(request("DELETE", "{}"), context("projects/p/documents/d"))).status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("streams ZIP with its safe filename without consuming its body", async () => {
    const upstream = new Response(new Uint8Array([80, 75, 0, 255]), { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="current.zip"' } });
    const consume = vi.spyOn(upstream, "arrayBuffer");
    fetchMock.mockResolvedValue(upstream);
    const result = await GET(request("GET"), context("projects/p/documents/current.zip"));
    expect(result.body).toBe(upstream.body);
    expect(upstream.bodyUsed).toBe(false);
    expect(consume).not.toHaveBeenCalled();
    expect(result.headers.get("Content-Type")).toBe("application/zip");
    expect(result.headers.get("Content-Disposition")).toBe('attachment; filename="current.zip"');
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(new Uint8Array([80, 75, 0, 255]));
  });
  it.each(["text/html", "image/svg+xml", "application/json"])("keeps document %s opaque and forces attachment", async (contentType) => {
    const upstream = new Response("<opaque>file bytes</opaque>", { headers: { "Content-Type": contentType, "Content-Disposition": 'inline; filename="client-file.html"' } });
    fetchMock.mockResolvedValue(upstream);
    const result = await GET(request("GET"), context("projects/p/documents/d/file"));
    expect(result.body).toBe(upstream.body);
    expect(result.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(result.headers.get("Content-Disposition")).toBe('attachment; filename="client-file.html"');
    expect(result.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
  it.each([
    ["POST", "projects/p/documents/batch", 600_000],
    ["GET", "projects/p/documents/d/file", 600_000],
    ["GET", "projects/p/documents/current.zip", 600_000],
    ["GET", "projects/p/documents/initial-handoff.zip", 600_000],
    ["GET", "projects/p/documents", 120_000],
    ["GET", "projects/p", 120_000],
    ["POST", "projects/p/send-to-budgets", 120_000],
  ])("uses scoped timeout for %s %s", async (method, path, timeout) => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const controller = new AbortController();
    const input = new Request(request(method as string), { signal: controller.signal });
    await (method === "POST" ? POST : GET)(input, context(path as string));
    expect(timeoutSpy).toHaveBeenCalledWith(timeout);
    const signal = fetchMock.mock.calls[0][1]?.signal;
    controller.abort();
    expect(signal?.aborted).toBe(true);
  });
  it("passes a large multipart transfer as the original stream with its boundary", async () => {
    const body = documentBatch([{ file: new File(["opaque"], "client.bin"), replacesDocumentId: null }]);
    const input = request("POST", body);
    input.headers.set("Content-Length", "300000000");
    await POST(input, context("projects/p/documents/batch"));
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.body).toBe(input.body);
    expect(input.bodyUsed).toBe(false);
    expect(new Headers(init.headers).get("Content-Type")).toBe(input.headers.get("Content-Type"));
  });
  it("preserves only the documented DocumentUnavailable 500 code through both sanitizers", async () => {
    fetchMock.mockResolvedValue(Response.json({ code: "DocumentUnavailable", detail: "private storage", extensions: { token, arbitrary: { value: "private" } } }, { status: 500 }));
    const result = await GET(request("GET"), context("projects/p/documents/d/file"));
    const payload = await result.json();
    expect(payload.extensions).toEqual({ code: "DocumentUnavailable" });
    expect(JSON.stringify(payload)).not.toContain("private");
    expect(documentErrorMessage(new ApiError(500, payload))).toBe("El archivo no está disponible en este momento.");
    expect(new ApiError(500, { code: "UnknownServerCode" }).code).toBeUndefined();
  });
});

describe("document client and batch service", () => {
  it("sends DELETE without body or Content-Type and returns void for 204", async () => {
    expect(await documentsService.remove(api(), "p", "d")).toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/projects/p/documents/d");
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.method).toBe("DELETE"); expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });
  it("builds manifest first, with exact part names, duplicate names and original File objects", async () => {
    const first = new File(["first"], "same.any", { type: "text/html" });
    const second = new File(["second"], "same.any");
    await documentsService.uploadBatch(api(), "p", [{ file: first, replacesDocumentId: null }, { file: second, replacesDocumentId: "old-document" }]);
    const init = fetchMock.mock.calls[0][1]!;
    const body = init.body as FormData;
    expect([...body.keys()]).toEqual(["manifest", "file-0", "file-1"]);
    const manifest = body.get("manifest") as Blob;
    expect(manifest.type).toBe("application/json");
    expect(JSON.parse(await manifest.text())).toEqual({ files: [{ partName: "file-0", replacesDocumentId: null }, { partName: "file-1", replacesDocumentId: "old-document" }] });
    expect(body.get("file-0")).toBe(first); expect(body.get("file-1")).toBe(second);
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });
  it("supports ZIP as a Blob or an unconsumed authenticated stream with safe filename", async () => {
    fetchMock.mockImplementation(async () => new Response(new Uint8Array([80, 75]), { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="current.zip"' } }));
    const result = await api().download("projects/p/documents/current.zip");
    expect(result.filename).toBe("current.zip"); expect(result.blob.type).toBe("application/zip");
    const streamed = await documentsService.downloadInitialZip(api(), "p");
    expect(streamed.filename).toBe("current.zip"); expect(streamed.stream.locked).toBe(false);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/backend/projects/p/documents/initial-handoff.zip");
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("Accept")).toContain("application/zip");
    await streamed.stream.cancel();
  });
  it.each([401, 403])("keeps DELETE session semantics for %s", async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    await expect(api().delete("projects/p/documents/d")).rejects.toMatchObject({ status });
    expect(invalidateSession).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
  });
  it("preserves stream request cancellation", async () => {
    const controller = new AbortController(); controller.abort();
    fetchMock.mockRejectedValue(new DOMException("cancelled", "AbortError"));
    await expect(documentsService.downloadCurrentZip(api(), "p", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("exact byte validation", () => {
  const sizedFile = (size: number) => Object.defineProperty(new File(["x"], "same.unknown"), "size", { value: size });
  it.each([
    [[0], 0, "vacíos"], [[100_000_001], 0, "100 MB"], [[100_000_000, 100_000_000, 100_000_000, 1], 0, "300 MB"],
    [[1, 1], 14, "15 documentos"],
  ] as const)("blocks invalid selection %j with current count %s", (sizes, current, message) => {
    expect(validateDocumentBatch(sizes.map((size) => ({ file: sizedFile(size), replacesDocumentId: null })), current)).toContain(message);
  });
  it("allows exact limits, duplicate names and replacements at the document limit", () => {
    expect(validateDocumentBatch([1, 2, 3].map(() => ({ file: sizedFile(100_000_000), replacesDocumentId: null })), 12)).toBeNull();
    expect(validateDocumentBatch([{ file: sizedFile(100_000_000), replacesDocumentId: "old" }], 15)).toBeNull();
    expect(formatBytes(100_000_000)).toBe("100 MB"); expect(formatBytes(123)).toBe("123 B"); expect(formatBytes(1500)).toBe("1,5 KB");
  });
});
