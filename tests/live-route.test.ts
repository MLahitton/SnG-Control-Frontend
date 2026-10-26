// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { POST } from "@/app/api/intelligence/[...path]/route";
import * as contracts from "@/features/intelligence/live/contracts";
import * as semantic from "@/features/intelligence/parser";
import { liveCreated, liveSdp } from "./liveFixtures";
import { token } from "./fixtures";

const upstream = vi.fn<typeof fetch>();
const context = () => ({ params: Promise.resolve({ path: ["live", "session"] }) });
const request = () => new Request("https://frontend.example.test/api/intelligence/live/session", {
  method: "POST", headers: { Authorization: `Bearer ${token}`, "X-SnG-Active-Role": "Management", "Content-Type": "application/json" }, body: JSON.stringify({ sdp: liveSdp }),
});
function traceEntries() {
  return vi.mocked(console.info).mock.calls.map(([event, metadata]) => ({ event, ...JSON.parse(metadata as string) })) as Array<Record<string, unknown>>;
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("SNG_INTELLIGENCE_BASE_URL", "https://intelligence.example.test");
  vi.stubGlobal("fetch", upstream); upstream.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("the actual /api/intelligence/live/session POST handler", () => {
  it.each([
    "http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time",
    "http://www.webrtc.org/experiments/rtp-hdrext/abs-capture-time",
    "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
    "http://www.webrtc.org/experiments/rtp-hdrext/transport-wide-cc-02",
  ])("preserves a standard RTP extension URI through the actual handler: %s", async (uri) => {
    const body = { ...liveCreated, sdp: liveSdp + `a=extmap:2/sendrecv ${uri}\r\n` };
    upstream.mockResolvedValue(Response.json(body, { status: 201, headers: { "Content-Type": "application/json; charset=utf-8" } }));
    const response = await POST(request(), context());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(body);
    expect(traceEntries().at(-1)?.stage).toBe("response_returned");
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it.each([
    "a=extmap:2 https://provider.example.test/private",
    "a=extmap:2 http://www.webrtc.org.evil.test/experiments/rtp-hdrext/abs-send-time",
    "a=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time?private=value",
    "a=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time#private",
    "a=x:http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time",
    "a=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time https://provider.example.test/private",
    `a=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time ${token}`,
    "a=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time sk-syntheticPrivateKey123",
  ])("does not exempt arbitrary URLs or credentials alongside RTP identifiers", async (attribute) => {
    upstream.mockResolvedValue(Response.json({ ...liveCreated, sdp: liveSdp + attribute + "\r\n" }, { status: 201 }));
    const response = await POST(request(), context());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ status: 502 });
    expect(traceEntries().at(-1)).toMatchObject({ stage: "live_session_security_validated", securityField: "sdp", error_class: "SecurityError" });
    expect(JSON.stringify(traceEntries()).includes(attribute)).toBe(false);
  });
  it("does not apply the SDP URI exception to sessionId", async () => {
    upstream.mockResolvedValue(Response.json({ ...liveCreated, sessionId: "http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time" }, { status: 201 }));
    const response = await POST(request(), context());
    expect(response.status).toBe(502);
    expect(traceEntries().at(-1)).toMatchObject({ securityField: "sessionId", securityRule: "HttpUrl" });
  });

  it.each([
    { sessionId: "opaque:synthetic/session+1=", sdp: liveSdp },
    { ...liveCreated, sdp: "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=mid:0\r\n" },
    { ...liveCreated, sdp: "v=0\r\n\r\n" },
    { ...liveCreated, sdp: "v=0\na=x:" + "x".repeat(32760) },
  ])("preserves the explicitly requested opaque ID/SDP contract through the route", async (body) => {
    upstream.mockResolvedValue(Response.json(body, { status: 201, headers: { "Content-Type": "application/json; charset=utf-8" } }));
    const response = await POST(request(), context());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(body);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("traces all eleven stages and calls only the Live session parser for upstream 201", async () => {
    const liveParser = vi.spyOn(contracts, "parseLiveSession");
    const chatParser = vi.spyOn(semantic, "parseResponse");
    const legacyParser = vi.spyOn(semantic, "parseSession");
    const body = { ...liveCreated, sdp: liveSdp + "a=candidate:1 1 UDP 2130706431 10.0.0.12 50000 typ host\r\na=setup:active\r\na=mid:0\r\n" };
    upstream.mockResolvedValue(new Response(JSON.stringify(body), { status: 201, headers: { "Content-Type": "application/json; charset=utf-8" } }));
    const response = await POST(request(), context());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(body);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(liveParser).toHaveBeenCalledTimes(1);
    expect(chatParser).not.toHaveBeenCalled(); expect(legacyParser).not.toHaveBeenCalled();
    const entries = traceEntries();
    expect(entries.map((e) => e.stage)).toEqual([
      "request_received", "upstream_fetch_started", "upstream_received", "upstream_status_validated",
      "upstream_content_type_validated", "upstream_body_read", "json_parsed", "live_session_contract_parsed",
      "live_session_security_validated", "response_serialized", "response_returned",
    ]);
    expect(entries.at(-1)).toMatchObject({
      upstreamStatus: 201, upstreamContentType: "application/json", bodySize: new TextEncoder().encode(JSON.stringify(body)).length,
      keys: ["sessionId", "sdp"], sessionIdType: "string", sessionIdLength: body.sessionId.length,
      sdpType: "string", sdpLength: body.sdp.length, startsWithV0: true, containsCRLF: true, containsLF: true,
      hasNullByte: false, hasMediaLine: true, hasAttributeLine: true,
    });
    const logs = JSON.stringify(entries);
    for (const secret of [body.sessionId, body.sdp, token, "10.0.0.12", "intelligence.example.test"]) expect(logs.includes(secret)).toBe(false);
  });

  it.each([
    ["invalid-json", "json_parsed", "SyntaxError"],
    ["wrong-contract", "live_session_contract_parsed", "UnexpectedSessionFields"],
    ["secret", "live_session_security_validated", "SecurityError"],
    ["wrong-type", "upstream_content_type_validated", "ContentTypeError"],
    ["upstream-error", "upstream_status_validated", "UpstreamStatusError"],
    ["read-error", "upstream_body_read", "UnknownError"],
    ["oversized", "upstream_body_read", "BodyTooLarge"],
    ["fetch-error", "upstream_received", "UnknownError"],
    ["serialization-error", "response_serialized", "TypeError"],
  ])("reports the precise failing stage for %s without exposing error contents", async (scenario, stage, category) => {
    const privateError = new Error(`private ${token} ${liveSdp}`); privateError.name = token;
    let response = new Response(JSON.stringify(liveCreated), { status: 201, headers: { "Content-Type": "application/json" } });
    if (scenario === "invalid-json") response = new Response('{"sdp":', { status: 201, headers: { "Content-Type": "application/json" } });
    if (scenario === "wrong-contract") response = Response.json({ ...liveCreated, [token]: "private" }, { status: 201 });
    if (scenario === "secret") response = Response.json({ ...liveCreated, sdp: liveSdp + `a=x:${token}\r\n` }, { status: 201 });
    if (scenario === "wrong-type") response = new Response("private", { status: 201, headers: { "Content-Type": `text/${token}` } });
    if (scenario === "upstream-error") response = Response.json({ detail: privateError.message }, { status: 503 });
    if (scenario === "read-error") response = new Response(new ReadableStream({ start(controller) { controller.error(privateError); } }), { status: 201, headers: { "Content-Type": "application/json" } });
    if (scenario === "oversized") response = new Response("x".repeat(512 * 1024 + 1), { status: 201, headers: { "Content-Type": "application/json" } });
    upstream.mockResolvedValue(response);
    if (scenario === "fetch-error") upstream.mockRejectedValue(privateError);
    if (scenario === "serialization-error") vi.spyOn(Response, "json").mockImplementationOnce(() => { throw new TypeError(privateError.message); });
    const result = await POST(request(), context());
    const status = scenario === "upstream-error" ? 503 : 502;
    expect(result.status).toBe(status); expect(await result.json()).toEqual({ status });
    const entries = traceEntries();
    expect(entries.at(-1)).toMatchObject({ event: "live_bridge_failure", stage, error_class: category });
    expect(entries.some((e) => e.stage === "response_returned")).toBe(false);
    const logs = JSON.stringify(entries);
    for (const secret of [token, liveSdp, liveCreated.sessionId, "private"]) expect(logs.includes(secret)).toBe(false);
    if (scenario === "wrong-contract") expect(entries.at(-1)?.keys).toEqual(["sessionId", "sdp", "[unexpected]"]);
  });
  it("emits no diagnostics in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    upstream.mockResolvedValue(Response.json(liveCreated, { status: 201 }));
    expect((await POST(request(), context())).status).toBe(201);
    upstream.mockRejectedValue(new Error("private"));
    expect((await POST(request(), context())).status).toBe(502);
    expect(console.info).not.toHaveBeenCalled();
  });
});
