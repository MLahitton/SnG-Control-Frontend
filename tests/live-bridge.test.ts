// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { forwardIntelligence } from "@/features/intelligence/server/bridge";
import { liveCreated, liveSdp, liveSessionId } from "./liveFixtures";
import { token } from "./fixtures";
const fetchMock = vi.fn<typeof fetch>();
const request = (body: unknown, method = "POST", type = "application/json") => new Request("https://frontend.example.test/api/intelligence/live/session", { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": type, Cookie: "private" }, ...(method !== "GET" ? { body: JSON.stringify(body) } : {}) });
beforeEach(() => { vi.stubEnv("SNG_INTELLIGENCE_BASE_URL", "https://intelligence.example.test"); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
describe("Live BFF", () => {
  it.each([
    ["session", { sdp: liveSdp }, liveCreated, 201],
    ["close", { sessionId: liveSessionId }, { closed: true }, 200],
  ] as const)("forwards exactly POST live/%s with auth and sanitized response", async (path, body, result, status) => {
    fetchMock.mockResolvedValue(Response.json(path === "session" ? result : { ...result, secret: "remove" }, { status }));
    const response = await forwardIntelligence(request(body), ["live", path]);
    expect(response.status).toBe(status); expect(await response.json()).toEqual(result);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`https://intelligence.example.test/api/intelligence/live/${path}`);
    expect(init).toMatchObject({ method: "POST", cache: "no-store", redirect: "error" });
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${token}`);
    expect(new Headers(init?.headers).has("Cookie")).toBe(false);
    expect(JSON.parse(init?.body as string)).toEqual(body);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each(["application/json", "application/json; charset=utf-8"])("preserves the exact minimal upstream 201 session with %s", async (contentType) => {
    const body = {
      sessionId: "sess_test_123",
      sdp: "v=0\r\no=- 123 456 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\na=fingerprint:sha-256 AA:BB:CC\r\n",
    };
    fetchMock.mockResolvedValue(Response.json(body, { status: 201, headers: { "Content-Type": contentType, "OpenAI-Request-ID": "provider-private", Authorization: `Bearer ${token}`, Location: "https://provider.example.test/session" } }));
    const response = await forwardIntelligence(request({ sdp: liveSdp }), ["live", "session"]);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(body);
    for (const name of ["OpenAI-Request-ID", "Authorization", "Location"]) expect(response.headers.has(name)).toBe(false);
  });
  it.each(["ice-password", "network-address"])("allows realistic SDP transport metadata without generic privacy false positives: %s", async (variant) => {
    if (variant === "network-address") vi.stubEnv("SNG_INTELLIGENCE_BASE_URL", "https://10.0.0.12");
    const body = {
      ...liveCreated,
      sdp: liveSdp.replace("synthetic-test-only", variant === "ice-password" ? "/synthetic+IcePassword1234" : "synthetic+IcePassword1234")
        + "a=candidate:1 1 UDP 2130706431 10.0.0.12 50000 typ host\r\na=setup:active\r\na=mid:0\r\n",
    };
    fetchMock.mockResolvedValue(Response.json(body, { status: 201 }));
    const response = await forwardIntelligence(request({ sdp: liveSdp }), ["live", "session"]);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(body);
  });
  it.each([
    { ...liveCreated, extra: "rejected" },
    { ...liveCreated, Authorization: `Bearer ${token}` },
    { ...liveCreated, OPENAI_API_KEY: "sk-syntheticPrivateKey123" },
    { ...liveCreated, provider: { url: "https://provider.example.test" } },
    { sdp: liveSdp }, { sessionId: liveSessionId },
    { ...liveCreated, sessionId: "" }, { ...liveCreated, sessionId: "s".repeat(129) },
    { ...liveCreated, sessionId: token }, { ...liveCreated, sessionId: "sk-syntheticPrivateKey123" },
    { ...liveCreated, sdp: "" }, { ...liveCreated, sdp: liveSdp + "a=bad\u0000" },
  ])("rejects extra fields and incomplete session contracts safely", async (body) => {
    fetchMock.mockResolvedValue(Response.json(body, { status: 201 }));
    const response = await forwardIntelligence(request({ sdp: liveSdp }), ["live", "session"]);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ status: 502 });
  });
  it.each([`Bearer ${token}`, token, "sk-syntheticPrivateKey123", "OPENAI_API_KEY=synthetic-only", "Authorization: synthetic-only", "https://provider.example.test/internal", "https://intelligence.example.test/private"])("never returns credentials or URLs embedded in SDP", async (secret) => {
    fetchMock.mockResolvedValue(Response.json({ ...liveCreated, sdp: liveSdp + `a=x-private:${secret}\r\n` }, { status: 201 }));
    const response = await forwardIntelligence(request({ sdp: liveSdp }), ["live", "session"]);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ status: 502 });
  });
  it.each(["text/html", "text/plain", "application/octet-stream"])("rejects upstream media type %s", async (contentType) => {
    fetchMock.mockResolvedValue(Response.json(liveCreated, { status: 201, headers: { "Content-Type": contentType } }));
    const response = await forwardIntelligence(request({ sdp: liveSdp }), ["live", "session"]);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ status: 502 });
  });
  it("returns safe 502 for malformed JSON and never logs successful or rejected SDP", async () => {
    const logs = ["log", "info", "warn", "error", "debug", "trace"] as const;
    const spies = logs.map((name) => vi.spyOn(console, name).mockImplementation(() => {}));
    try {
      fetchMock.mockResolvedValueOnce(Response.json(liveCreated, { status: 201 }))
        .mockResolvedValueOnce(new Response('{"sessionId":', { status: 201, headers: { "Content-Type": "application/json" } }))
        .mockResolvedValueOnce(Response.json({ ...liveCreated, sdp: liveSdp + `a=secret:${token}\r\n` }, { status: 201 }));
      expect((await forwardIntelligence(request({ sdp: liveSdp }), ["live", "session"])).status).toBe(201);
      for (let i = 0; i < 2; i++) {
        const response = await forwardIntelligence(request({ sdp: liveSdp }), ["live", "session"]);
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ status: 502 });
      }
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally { for (const spy of spies) spy.mockRestore(); }
  });
  it.each(["session", "close"])("rejects GET live/%s", async (path) => {
    expect((await forwardIntelligence(request({}, "GET"), ["live", path])).status).toBe(405); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([["live", "delegate"], ["live"], ["live", "other"], ["live", "session", "id"], ["live/session"], ["live", ".."]])("rejects arbitrary paths %j", async (...path) => {
    expect((await forwardIntelligence(request({}), path)).status).toBe(400); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 404, 409, 422, 429, 500, 502, 503])("keeps safe status %s and drops provider diagnostics", async (status) => {
    fetchMock.mockResolvedValue(Response.json({ detail: "secret", token, sdp: liveSdp }, { status }));
    const response = await forwardIntelligence(request({ sdp: liveSdp }), ["live", "session"]);
    expect(response.status).toBe(status); expect(await response.json()).toEqual({ status });
  });
  it("rejects absent auth, incompatible MIME, unknown fields and invalid SDP", async () => {
    const noAuth = request({ sdp: liveSdp }); noAuth.headers.delete("Authorization");
    expect((await forwardIntelligence(noAuth, ["live", "session"])).status).toBe(401);
    expect((await forwardIntelligence(request({}, "POST", "text/html"), ["live", "session"])).status).toBe(415);
    expect((await forwardIntelligence(request({ sdp: liveSdp, model: "override" }), ["live", "session"])).status).toBe(422);
    expect((await forwardIntelligence(request({ sdp: "invalid" }), ["live", "session"])).status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("bounds actual stream bytes without Content-Length and SDP independently", async () => {
    expect((await forwardIntelligence(request({ sdp: liveSdp + "a=" + "x".repeat(33000) }), ["live", "session"])).status).toBe(422);
    expect((await forwardIntelligence(request({ sdp: "x".repeat(65536) }), ["live", "session"])).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([{ ...liveCreated, sdp: "invalid" }, { ...liveCreated, sessionId: "unsafe\u0000id" }, { ...liveCreated, sdp: liveSdp + "a=" + "x".repeat(33000) }])("rejects invalid upstream session contract", async (body) => {
    fetchMock.mockResolvedValue(Response.json(body, { status: 201 }));
    expect((await forwardIntelligence(request({ sdp: liveSdp }), ["live", "session"])).status).toBe(502);
  });
});
