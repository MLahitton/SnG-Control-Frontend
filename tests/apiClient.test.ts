// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "@/lib/api/apiClient";
import { ApiError } from "@/lib/api/apiError";
import { downloadFilename } from "@/lib/api/contentDisposition";
import { token } from "./fixtures";

const fetchMock = vi.fn<typeof fetch>();
const invalidateSession = vi.fn();
let snapshot = { token: token as string | null, generation: 1 };
const makeClient = () => createApiClient({ getSession: () => snapshot, invalidateSession });
beforeEach(() => {
  snapshot = { token, generation: 1 };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => Response.json({ id: "test-id" }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("typed API client", () => {
  it("sends GET JSON with Bearer, query and no cookies", async () => {
    const result = await makeClient().get<{ id: string }>("projects", { query: new URLSearchParams({ search: "a b" }) });
    expect(result.id).toBe("test-id");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/backend/projects?search=a+b");
    expect(options).toMatchObject({ method: "GET", cache: "no-store", credentials: "omit", redirect: "error" });
    expect(new Headers(options?.headers).get("Authorization")).toBe(`Bearer ${token}`);
  });

  it.each(["post", "put"] as const)("serializes JSON for %s", async (method) => {
    await makeClient()[method]("projects/test-id", { name: "Prueba", value: 3 });
    const options = fetchMock.mock.calls[0][1]!;
    expect(options.method).toBe(method.toUpperCase());
    expect(new Headers(options.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(options.body as string)).toEqual({ name: "Prueba", value: 3 });
  });

  it("supports actions with no request body", async () => {
    await makeClient().post("projects/test-id/confirm");
    const options = fetchMock.mock.calls[0][1]!;
    expect(options.body).toBeUndefined();
    expect(new Headers(options.headers).has("Content-Type")).toBe(false);
  });

  it("sends FormData unchanged without manually setting Content-Type", async () => {
    const body = new FormData();
    body.set("file", new Blob(["test bytes"]), "quotation.xlsx");
    await makeClient().upload("projects/test-id/quotation", body);
    const options = fetchMock.mock.calls[0][1]!;
    expect(options.method).toBe("POST");
    expect(options.body).toBe(body);
    expect(new Headers(options.headers).has("Content-Type")).toBe(false);
  });

  it("returns a Blob and backend filename without downloading automatically", async () => {
    const bytes = new Uint8Array([80, 75, 0, 255]);
    fetchMock.mockResolvedValue(new Response(bytes, { headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": "attachment; filename*=UTF-8''cotizaci%C3%B3n.xlsx",
    } }));
    const result = await makeClient().download("projects/test-id/file", { query: new URLSearchParams({ filename: "untrusted.xlsx" }) });
    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(bytes);
    expect(result.filename).toBe("cotización.xlsx");
  });

  it("does not take a filename from the query", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2])));
    const result = await makeClient().download("projects/test-id/file", { query: new URLSearchParams({ filename: "untrusted.xlsx" }) });
    expect(result.filename).toBeNull();
  });

  it("turns ProblemDetails into a safe typed error with 409 code and extensions", async () => {
    fetchMock.mockResolvedValue(Response.json({
      title: "private diagnostic", detail: "https://private.example/path",
      code: "AlreadyConfirmed", extensions: { field: "quotation", stackTrace: "private" },
    }, { status: 409 }));
    const error = await makeClient().post("projects/test-id/confirm").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "AlreadyConfirmed", problem: { extensions: { field: "quotation" } } });
    expect(JSON.stringify(error)).not.toContain("private");
    expect(invalidateSession).not.toHaveBeenCalled();
  });

  it("403 produces a permission error and does not invalidate session", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    await expect(makeClient().get("projects")).rejects.toMatchObject({ status: 403, message: "No tienes permiso para esta acción." });
    expect(invalidateSession).not.toHaveBeenCalled();
  });

  it("invalidates only once for concurrent 401 responses", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 401 }));
    const client = makeClient();
    await Promise.allSettled([client.get("projects"), client.get("clients"), client.get("notifications")]);
    expect(invalidateSession).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("does not invalidate a newer session for a late 401", async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise((done) => { resolve = done; }));
    const result = makeClient().get("projects");
    snapshot = { token: "new-test-token", generation: 2 };
    resolve(new Response(null, { status: 401 }));
    await expect(result).rejects.toMatchObject({ status: 401 });
    expect(invalidateSession).not.toHaveBeenCalled();
  });

  it("can invalidate a later generation even if Google returns the same token", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 401 }));
    const client = makeClient();
    await client.get("projects").catch(() => {});
    snapshot = { token, generation: 2 };
    await client.get("projects").catch(() => {});
    expect(invalidateSession).toHaveBeenCalledTimes(2);
  });

  it("does not invent authentication or fetch when the token is absent", async () => {
    snapshot = { token: null, generation: 1 };
    await expect(makeClient().get("projects")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invalidateSession).toHaveBeenCalledExactlyOnceWith(1);
  });

  it.each(["https://evil.example", "/projects", "projects/../clients", "projects?url=x", "auth/me"])("rejects unsafe client path %s", async (path) => {
    await expect(makeClient().get(path)).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes network errors without retaining raw diagnostics", async () => {
    fetchMock.mockRejectedValue(new Error("private network detail"));
    await expect(makeClient().get("projects")).rejects.toMatchObject({ status: 0 });
    expect(invalidateSession).not.toHaveBeenCalled();
  });

  it("supports a bodyless 204 result", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await makeClient().put<void>("projects/test-id")).toBeUndefined();
  });

  it("rejects invalid success JSON", async () => {
    fetchMock.mockResolvedValue(new Response("not json"));
    await expect(makeClient().get("projects")).rejects.toMatchObject({ status: 502 });
  });

  it("preserves caller cancellation without invalidating session", async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValue(new DOMException("cancelled", "AbortError"));
    await expect(makeClient().get("projects", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(invalidateSession).not.toHaveBeenCalled();
  });
});

describe("safe download filename", () => {
  it.each(['attachment; filename="../private.xlsx"', 'attachment; filename="C:\\private.xlsx"', "attachment; filename*=UTF-8''%ZZ", 'attachment; filename="CON.xlsx"'])("rejects unsafe filename %s", (value) => {
    expect(downloadFilename(value)).toBeNull();
  });
  it("reads a quoted filename", () => {
    expect(downloadFilename('attachment; filename="confirmed.xlsx"')).toBe("confirmed.xlsx");
  });
});
