// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { forwardIntelligence } from "@/features/intelligence/server/bridge";
import { parseConversation } from "@/features/intelligence/conversation";
import { IntelligenceContractError } from "@/features/intelligence/parser";
import { conversationCreated } from "./intelligenceFixtures";
import { token } from "./fixtures";
import { liveSdp, liveCreated } from "./liveFixtures";
const fetchMock = vi.fn<typeof fetch>();
function request(body: unknown = {}, method = "POST") {
  return new Request("https://frontend.example.test/api/intelligence/conversation", { method, ...(method === "POST" ? { body: JSON.stringify(body) } : {}), headers: { Authorization: `Bearer ${token}`, "X-SnG-Active-Role": "Management", "Content-Type": "application/json" } });
}
beforeEach(() => { vi.stubEnv("SNG_INTELLIGENCE_BASE_URL", "https://intelligence.example.test"); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
it("allows only explicit create/close with validated fields and preserves 201", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(conversationCreated, { status: 201 }));
  const created = await forwardIntelligence(request(), ["conversation"]);
  expect(created.status).toBe(201); expect(await created.json()).toEqual(conversationCreated);
  expect(created.headers.get("Cache-Control")).toBe("no-store");
  expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Authorization")).toBe(`Bearer ${token}`);
  fetchMock.mockResolvedValueOnce(Response.json({ closed: true }));
  expect((await forwardIntelligence(request({ conversationId: conversationCreated.conversationId }), ["conversation", "close"])).status).toBe(200);
});
it.each([{ subject: "forged" }, { conversationId: "a".repeat(43) }, { history: [] }])("rejects caller-selected create fields %j", async (body) => {
  expect((await forwardIntelligence(request(body), ["conversation"])).status).toBe(422); expect(fetchMock).not.toHaveBeenCalled();
});
it.each([{}, { conversationId: "../" }, { conversationId: "a".repeat(43), token: "forged" }])("rejects malformed close %j", async (body) => {
  expect((await forwardIntelligence(request(body), ["conversation", "close"])).status).toBe(422); expect(fetchMock).not.toHaveBeenCalled();
});
it("forwards conversationId in Live creation without changing SDP or response", async () => {
  fetchMock.mockResolvedValue(Response.json(liveCreated, { status: 201 }));
  const body = { sdp: liveSdp, conversationId: conversationCreated.conversationId };
  const result = await forwardIntelligence(request(body), ["live", "session"]);
  expect(result.status).toBe(201); expect(await result.json()).toEqual(liveCreated);
  expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual(body);
});
it("rejects extra provider fields, unsafe expiry and unsupported routes/methods", async () => {
  for (const body of [{ ...conversationCreated, token }, { ...conversationCreated, expiresAt: token }]) {
    fetchMock.mockResolvedValue(Response.json(body));
    expect((await forwardIntelligence(request(), ["conversation"])).status).toBe(502);
  }
  expect((await forwardIntelligence(request({}, "GET"), ["conversation"])).status).toBe(405);
  expect((await forwardIntelligence(request(), ["conversation", "history"])).status).toBe(400);
});

it("resumes through an explicit route and rejects caller identity", async () => {
  fetchMock.mockResolvedValue(Response.json(conversationCreated));
  const result = await forwardIntelligence(request(), ["conversation", "resume"]);
  expect(result.status).toBe(200); expect(await result.json()).toEqual(conversationCreated);
  expect((await forwardIntelligence(request({ subject: "other" }), ["conversation", "resume"])).status).toBe(422);
});
it.each([404, 409, 429, 500, 502, 503, 504])("forwards only the recoverable code at 404, status=%s", async (status) => {
  fetchMock.mockResolvedValue(Response.json({ error: "conversation_unavailable", detail: token, secret: token }, { status }));
  const result = await forwardIntelligence(request(), ["conversation", "resume"]);
  expect(await result.json()).toEqual({ status, ...(status === 404 ? { code: "conversation_unavailable" } : {}) });
});
it("strips arbitrary 404 diagnostics instead of triggering recovery", async () => {
  fetchMock.mockResolvedValue(Response.json({ error: "other_missing_resource", message: token }, { status: 404 }));
  expect(await (await forwardIntelligence(request(), ["conversation", "resume"])).json()).toEqual({ status: 404 });
});

for (const field of ["createdAt", "lastActivityAt"] as const) {
  it.each([
    "2026-10-27T18:47:00Z",
    "2026-10-27T18:47:00+00:00",
    "2026-10-27T13:47:00-05:00",
    "2026-10-28T03:47:00+09:00",
    "2026-10-27T13:47:00.123456-05:00",
  ])(`preserves ${field} with explicit timezone: %s`, (timestamp) => {
    const payload = { ...conversationCreated, [field]: timestamp };
    expect(parseConversation(payload)).toEqual(payload);
  });
  it.each([
    "2026-10-27T13:47:00",
    "invalid",
    "2026-10-27T13:47:00-05:00 extra",
    "extra 2026-10-27T13:47:00-05:00",
    "2026-10-27T13:47:00+25:00",
    "2026-10-27T13:47:00+09:60",
  ])(`rejects invalid or timezone-free ${field}: %s`, (timestamp) => {
    expect(() => parseConversation({ ...conversationCreated, [field]: timestamp })).toThrow(IntelligenceContractError);
  });
}
it("preserves a 200 resume response with PostgreSQL Colombia offsets and microseconds", async () => {
  const payload = {
    ...conversationCreated,
    createdAt: "2026-10-27T13:47:00.123456-05:00",
    lastActivityAt: "2026-10-27T14:02:03.654321-05:00",
  };
  fetchMock.mockResolvedValueOnce(Response.json(payload, { status: 200 }));
  const result = await forwardIntelligence(request(), ["conversation", "resume"]);
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual(payload);
  expect(result.headers.get("Cache-Control")).toBe("no-store");
});
