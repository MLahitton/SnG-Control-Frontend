import { describe, expect, it, vi } from "vitest";
import { parseResponse, parseSession, parseVoice } from "@/features/intelligence/parser";
import { intelligenceService } from "@/features/intelligence/service";
import { createApiClient } from "@/lib/api/apiClient";
import { intelligenceResponse, intelligenceResponses, requestId } from "./intelligenceFixtures";
import { token } from "./fixtures";

describe("Intelligence contract and client", () => {
  it.each(intelligenceResponses)("validates $responseType and discards unknown properties", (response) => {
    expect(parseResponse({ ...response, token: "discard", presentation: { ...response.presentation, extra: { arbitrary: "discard" } } })).toEqual(response);
  });
  it.each([
    { ...intelligenceResponse, responseType: "unknown" },
    { ...intelligenceResponse, presentation: { kind: "list", items: [] } },
    { ...intelligenceResponse, references: [{ type: "project", projectId: "../admin", label: "Unsafe", sgCode: null }] },
    { ...intelligenceResponse, references: Array(51).fill(intelligenceResponse.references[0]) },
    { ...intelligenceResponse, answer: "a".repeat(12001) },
    { ...intelligenceResponse, presentation: { kind: "direct", metric: { key: "projects", label: "Proyectos", value: "12" } } },
  ])("rejects an invalid response instead of rendering arbitrary JSON", (payload) => {
    expect(() => parseResponse(payload)).toThrow();
  });
  it("validates voice/session and rejects missing flags or transcript", () => {
    expect(parseVoice({ ...intelligenceResponse, transcript: "Consulta hablada" }).transcript).toBe("Consulta hablada");
    expect(parseSession({ authenticated: true, isManagement: true, ignored: 1 })).toEqual({ authenticated: true, isManagement: true });
    expect(() => parseSession({ authenticated: true })).toThrow();
    expect(() => parseSession({ authenticated: true, isManagement: false })).toThrow();
    expect(() => parseVoice(intelligenceResponse)).toThrow();
  });
  it("uses same-origin session/chat, sends no history or token in JSON, and passes AbortSignal", async () => {
    const fetchMock = vi.fn(async (path: string) => Response.json(path.endsWith("session") ? { authenticated: true, isManagement: true } : intelligenceResponse));
    vi.stubGlobal("fetch", fetchMock);
    const api = createApiClient({ getSession: () => ({ token, generation: 1 }), invalidateSession: vi.fn() });
    const signal = new AbortController().signal;
    await intelligenceService.session(api, signal);
    await intelligenceService.chat(api, "Consulta", signal);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/intelligence/chat", expect.objectContaining({ method: "POST", body: '{"message":"Consulta"}', signal, cache: "no-store", redirect: "error" }));
    const options = (fetchMock.mock.calls as unknown as [string, RequestInit][])[1][1];
    expect(new Headers(options.headers).get("Authorization")).toBe(`Bearer ${token}`);
  });
  it("sends the original MP4 file in multipart and spokenAnswer in speech JSON", async () => {
    const fetchMock = vi.fn(async (path: string, options: RequestInit) => {
      if (path.endsWith("speech")) {
        expect(JSON.parse(options.body as string)).toEqual({ text: intelligenceResponse.spokenAnswer, responseType: "direct" });
        return new Response(new Uint8Array([73, 68, 51]), { headers: { "Content-Type": "audio/mpeg" } });
      }
      expect(new Headers(options.headers).has("Content-Type")).toBe(false);
      const file = (options.body as FormData).get("file") as File;
      expect(file.type).toBe("audio/mp4"); expect(file.name).toBe("voice.m4a");
      return Response.json({ ...intelligenceResponse, transcript: "Consulta hablada" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = createApiClient({ getSession: () => ({ token, generation: 1 }), invalidateSession: vi.fn() });
    await intelligenceService.voice(api, new File(["audio"], "voice.m4a", { type: "audio/mp4" }));
    expect((await intelligenceService.speech(api, intelligenceResponse.spokenAnswer, "direct")).size).toBe(3);
  });
  it.each([401, 403, 422, 429, 503])("preserves HTTP %s, safe requestId and session rules", async (status) => {
    const invalidate = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ requestId, detail: "private", error: "provider-secret" }, { status })));
    const api = createApiClient({ getSession: () => ({ token, generation: 1 }), invalidateSession: invalidate });
    await expect(intelligenceService.chat(api, "Consulta")).rejects.toMatchObject({ status, requestId });
    expect(invalidate).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
  });
  it("rejects unsupported client routes, methods and queries before fetch", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const api = createApiClient({ getSession: () => ({ token, generation: 1 }), invalidateSession: vi.fn() });
    await expect(api.get("intelligence/health")).rejects.toMatchObject({ status: 400 });
    await expect(api.put("intelligence/chat", {})).rejects.toMatchObject({ status: 400 });
    await expect(api.get("intelligence/session", { query: new URLSearchParams("url=https://evil.test") })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("ignores a late Intelligence 401 from an earlier session", async () => {
    let generation = 1;
    let resolve!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
    const invalidate = vi.fn();
    const api = createApiClient({ getSession: () => ({ token, generation }), invalidateSession: invalidate });
    const result = intelligenceService.session(api);
    generation = 2;
    resolve(new Response(null, { status: 401 }));
    await expect(result).rejects.toMatchObject({ status: 401 });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
