import { roleContext } from "./roleFixtures";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "@/features/auth/context/AuthProvider";
import { IntelligenceLauncher } from "@/features/intelligence/components/IntelligenceLauncher";
import { useConversation } from "@/features/intelligence/hooks/useConversation";
import { createApiClient } from "@/lib/api/apiClient";
import { manager } from "./managementFixtures";
import { token } from "./fixtures";
import { conversationCreated, intelligenceResponse } from "./intelligenceFixtures";
import { liveCreated } from "./liveFixtures";
import { mockLiveBrowser, LivePeer } from "./liveBrowser";
import { deferred } from "./operationalFixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
const client = () => createApiClient({ getSession: () => ({ token, generation: 1 , activeRole: "Management" as const}), invalidateSession: vi.fn() });
function identity() {
  return { status: "authenticated" as const, ...roleContext("Management"), user: manager, error: null, signIn: vi.fn(), logout: vi.fn(), invalidateSession: vi.fn(), apiClient: client() };
}
function network() {
  let creates = 0;
  const mock = vi.fn(async (path: string, _init: RequestInit) => {
    expect(_init.method).toBeDefined();
    if (path.endsWith("/conversation/resume")) { if (!creates) creates = 1; return Response.json({ ...conversationCreated, conversationId: String(creates).repeat(43) }); }
    if (path.endsWith("/conversation")) return Response.json({ ...conversationCreated, conversationId: String(++creates).repeat(43) }, { status: 201 });
    if (path.endsWith("/close")) return Response.json({ closed: true });
    if (path.endsWith("/live/session")) return Response.json(liveCreated);
    if (path.endsWith("/session")) return Response.json({ authenticated: true, isManagement: true });
    return Response.json(intelligenceResponse);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}
async function open() {
  await userEvent.click(screen.getByRole("button", { name: "Abrir SnG Intelligence" }));
  await waitFor(() => expect(screen.getByLabelText("Tu consulta")).toBeEnabled());
}
beforeEach(() => { mockLiveBrowser(); });

describe("Durable conversation lifecycle", () => {
  it("resumes only on first open, survives panel close and internal navigation, with no browser persistence", async () => {
    const fetchMock = network();
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const state = identity();
    const view = render(<AuthContext.Provider value={state}><h1>Gerencia</h1><IntelligenceLauncher /></AuthContext.Provider>);
    expect(fetchMock).not.toHaveBeenCalled();
    await open();
    await userEvent.type(screen.getByLabelText("Tu consulta"), "Casa{Enter}");
    await screen.findByText(intelligenceResponse.answer);
    await userEvent.click(screen.getByRole("button", { name: "Cerrar SnG Intelligence" }));
    view.rerender(<AuthContext.Provider value={state}><h1>Proyecto</h1><IntelligenceLauncher /></AuthContext.Provider>);
    await open();
    expect(screen.getByText(intelligenceResponse.answer)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Tu consulta"), "Sus documentos{Enter}");
    await waitFor(() => expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/chat"))).toHaveLength(2));
    const bodies = fetchMock.mock.calls.filter(([path]) => path.endsWith("/chat")).map(([, init]) => JSON.parse(init.body as string));
    expect(bodies.map((b) => b.conversationId)).toEqual(["1".repeat(43), "1".repeat(43)]);
    expect(fetchMock.mock.calls.filter(([p]) => p.endsWith("/conversation/resume"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([p]) => p.endsWith("/conversation/close"))).toHaveLength(0);
    expect(storage).not.toHaveBeenCalled();
  });
  it("uses the same ID for Live, preserves it on stop and reopening, then sends text in that conversation", async () => {
    const fetchMock = network();
    render(<AuthContext.Provider value={identity()}><IntelligenceLauncher /></AuthContext.Provider>);
    await open();
    for (let i = 0; i < 2; i++) {
      await userEvent.click(screen.getByRole("button", { name: "Iniciar conversación por voz" }));
      await waitFor(() => expect(LivePeer.instances[i]?.setRemoteDescription).toHaveBeenCalled());
      act(() => LivePeer.instances[i].started());
      expect(screen.getByLabelText("Tu consulta")).toBeDisabled();
      await userEvent.click(screen.getByRole("button", { name: "Finalizar conversación" }));
      await waitFor(() => expect(screen.getByLabelText("Tu consulta")).toBeEnabled());
    }
    await userEvent.type(screen.getByLabelText("Tu consulta"), "El segundo{Enter}");
    await screen.findByText(intelligenceResponse.answer);
    const requests = fetchMock.mock.calls.filter(([p]) => p.endsWith("/live/session") || p.endsWith("/chat"));
    expect(requests).toHaveLength(3);
    expect(requests.every(([, init]) => JSON.parse(init.body as string).conversationId === "1".repeat(43))).toBe(true);
    expect(fetchMock.mock.calls.some(([p]) => p.endsWith("/conversation/close"))).toBe(false);
  });
  it("new conversation closes Live and the old context, clears messages and creates a different ID", async () => {
    const fetchMock = network();
    render(<AuthContext.Provider value={identity()}><IntelligenceLauncher /></AuthContext.Provider>);
    await open();
    await userEvent.type(screen.getByLabelText("Tu consulta"), "Anterior{Enter}");
    await screen.findByText(intelligenceResponse.answer);
    await userEvent.click(screen.getByRole("button", { name: "Iniciar conversación por voz" }));
    await waitFor(() => expect(LivePeer.instances[0]?.setRemoteDescription).toHaveBeenCalled());
    act(() => LivePeer.instances[0].started());
    await userEvent.click(screen.getByRole("button", { name: "Nueva conversación" }));
    await waitFor(() => expect(screen.getByLabelText("Tu consulta")).toBeEnabled());
    expect(screen.queryByText("Anterior")).not.toBeInTheDocument();
    expect(screen.queryByText(intelligenceResponse.answer)).not.toBeInTheDocument();
    expect(LivePeer.instances[0].close).toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([p]) => p.endsWith("/conversation"))).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([p]) => p.endsWith("/conversation/close"))).toBe(false);
    await userEvent.type(screen.getByLabelText("Tu consulta"), "Nueva{Enter}");
    const chats = fetchMock.mock.calls.filter(([p]) => p.endsWith("/chat"));
    expect(JSON.parse(chats[1][1].body as string).conversationId).toBe("2".repeat(43));
  });
  it.each(["logout", "subject"])("clears local state without closing durable history on %s while aborting a pending request", async (action) => {
    const fetchMock = network(); const normal = fetchMock.getMockImplementation()!;
    const pending = deferred<Response>();
    fetchMock.mockImplementation((path, init) => path.endsWith("/chat") ? pending.promise : normal(path, init));
    const state = identity();
    const view = render(<AuthContext.Provider value={state}><IntelligenceLauncher /></AuthContext.Provider>);
    await open();
    await userEvent.type(screen.getByLabelText("Tu consulta"), "Anterior{Enter}");
    const chat = fetchMock.mock.calls.find(([p]) => p.endsWith("/chat"))!;
    view.rerender(<AuthContext.Provider value={{ ...state, ...(action === "logout" ? { status: "unauthenticated", user: null } : { user: { ...manager, subject: "different" } }) }}><IntelligenceLauncher /></AuthContext.Provider>);
    expect(chat[1].signal?.aborted).toBe(true);
    expect(screen.queryByText("Anterior")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([p]) => p.endsWith("/conversation/close"))).toBe(false);
    await act(async () => pending.resolve(Response.json(intelligenceResponse)));
    expect(screen.queryByText(intelligenceResponse.answer)).not.toBeInTheDocument();
    if (action === "subject") {
      await open();
      expect(fetchMock.mock.calls.filter(([p]) => p.endsWith("/conversation/resume"))).toHaveLength(2);
    }
  });
  it("does not create a replacement if reset finishes after unmount", async () => {
    const fetchMock = network(); const normal = fetchMock.getMockImplementation()!;
    const close = deferred<Response>();
    fetchMock.mockImplementation((path, init) => path.endsWith("/conversation") ? close.promise : normal(path, init));
    const api = client();
    const view = renderHook(() => useConversation(api, true));
    await waitFor(() => expect(view.result.current.id).toBe("1".repeat(43)));
    let resetting: Promise<void>;
    act(() => { resetting = view.result.current.reset(); });
    view.unmount();
    await act(async () => { close.resolve(Response.json({ ...conversationCreated, conversationId: "2".repeat(43) })); await resetting; });
    expect(fetchMock.mock.calls.filter(([p]) => p.endsWith("/conversation/resume"))).toHaveLength(1);
  });
  it("ignores a late resume after unmount without closing the durable conversation", async () => {
    const pending = deferred<Response>();
    const fetchMock = network(); const normal = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((path, init) => path.endsWith("/conversation/resume") ? pending.promise : normal(path, init));
    const api = client(); const view = renderHook(() => useConversation(api, true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    view.unmount();
    await act(async () => pending.resolve(Response.json(conversationCreated)));
    expect(fetchMock.mock.calls.some(([p]) => p.endsWith("/conversation/close"))).toBe(false);
  });
  it("manual retry after resume failure revalidates access and resumes once", async () => {
    const fetchMock = network(); const normal = fetchMock.getMockImplementation()!;
    let attempts = 0;
    fetchMock.mockImplementation((path, init) => path.endsWith("/conversation/resume") && ++attempts === 1 ? Promise.resolve(Response.json({}, { status: 503 })) : normal(path, init));
    render(<AuthContext.Provider value={identity()}><IntelligenceLauncher /></AuthContext.Provider>);
    await userEvent.click(screen.getByRole("button", { name: "Abrir SnG Intelligence" }));
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "Volver a verificar" }));
    await waitFor(() => expect(screen.getByLabelText("Tu consulta")).toBeEnabled());
    expect(fetchMock.mock.calls.filter(([p]) => p.endsWith("/conversation/resume"))).toHaveLength(2);
    expect(fetchMock.mock.calls.filter(([p]) => p.endsWith("/session"))).toHaveLength(2);
  });
  it("expired context does not retry a question in a silently created conversation", async () => {
    const fetchMock = network(); const normal = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((path, init) => path.endsWith("/chat") ? Promise.resolve(Response.json({}, { status: 404 })) : normal(path, init));
    render(<AuthContext.Provider value={identity()}><IntelligenceLauncher /></AuthContext.Provider>);
    await open();
    fireEvent.change(screen.getByLabelText("Tu consulta"), { target: { value: "El segundo" } });
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByRole("alert");
    expect(fetchMock.mock.calls.filter(([p]) => p.endsWith("/conversation/resume"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([p]) => p.endsWith("/chat"))).toHaveLength(1);
  });
});


describe("durable resume and bounded recovery", () => {
  it("resumes the same server ID after a full component unmount without browser storage", async () => {
    const fetchMock = network();
    const api = client();
    const first = renderHook(() => useConversation(api, true));
    await waitFor(() => expect(first.result.current.id).toBe("1".repeat(43)));
    first.unmount();
    const second = renderHook(() => useConversation(api, true));
    await waitFor(() => expect(second.result.current.id).toBe("1".repeat(43)));
    expect(fetchMock.mock.calls.filter(([p]) => p.endsWith("/conversation/resume"))).toHaveLength(2);
    expect(fetchMock.mock.calls.some(([p]) => p.endsWith("/conversation") || p.endsWith("/conversation/close"))).toBe(false);
  });
  it.each([false, true])("retries text exactly once after the specific 404, repeated error=%s", async (repeated) => {
    const fetchMock = network(); const normal = fetchMock.getMockImplementation()!;
    let chats = 0; let resumes = 0;
    fetchMock.mockImplementation((path, init) => {
      if (path.endsWith("/conversation/resume")) return Promise.resolve(Response.json({ ...conversationCreated, conversationId: String(++resumes).repeat(43) }));
      if (path.endsWith("/chat") && (++chats === 1 || repeated)) return Promise.resolve(Response.json({ code: "conversation_unavailable" }, { status: 404 }));
      return normal(path, init);
    });
    render(<AuthContext.Provider value={identity()}><IntelligenceLauncher /></AuthContext.Provider>);
    await open();
    await userEvent.type(screen.getByLabelText("Tu consulta"), "El segundo{Enter}");
    if (repeated) await screen.findByRole("alert"); else await screen.findByText(intelligenceResponse.answer);
    const bodies = fetchMock.mock.calls.filter(([p]) => p.endsWith("/chat")).map(([, init]) => JSON.parse(init.body as string));
    expect(bodies).toEqual([{ message: "El segundo", conversationId: "1".repeat(43) }, { message: "El segundo", conversationId: "2".repeat(43) }]);
    expect(resumes).toBe(2);
  });
  it.each([409, 429, 500, 502, 503, 504])("does not retry text for status %s even with a misleading code", async (status) => {
    const fetchMock = network(); const normal = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((path, init) => path.endsWith("/chat") ? Promise.resolve(Response.json({ code: "conversation_unavailable" }, { status })) : normal(path, init));
    render(<AuthContext.Provider value={identity()}><IntelligenceLauncher /></AuthContext.Provider>);
    await open();
    await userEvent.type(screen.getByLabelText("Tu consulta"), "Consulta{Enter}");
    await screen.findByRole("alert");
    expect(fetchMock.mock.calls.filter(([p]) => p.endsWith("/chat"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([p]) => p.endsWith("/conversation/resume"))).toHaveLength(1);
  });
  it.each([false, true])("releases the provisional Live resources before resume, retry fails=%s", async (repeated) => {
    const { track, getUserMedia } = mockLiveBrowser();
    const fetchMock = network(); const normal = fetchMock.getMockImplementation()!;
    let lives = 0; let resumes = 0;
    fetchMock.mockImplementation((path, init) => {
      if (path.endsWith("/conversation/resume") && ++resumes > 1) {
        expect(LivePeer.instances[0].close).toHaveBeenCalled();
        expect(LivePeer.instances[0].channel.close).toHaveBeenCalled();
        expect(track.stop).toHaveBeenCalled();
        return Promise.resolve(Response.json({ ...conversationCreated, conversationId: "2".repeat(43) }));
      }
      if (path.endsWith("/live/session") && (++lives === 1 || repeated)) return Promise.resolve(Response.json({ code: "conversation_unavailable" }, { status: 404 }));
      return normal(path, init);
    });
    render(<AuthContext.Provider value={identity()}><IntelligenceLauncher /></AuthContext.Provider>);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Iniciar conversación por voz" }));
    if (repeated) await screen.findByText("La conversación en vivo no está disponible. Puedes intentar de nuevo o usar voz básica.");
    else await waitFor(() => expect(LivePeer.instances[1]?.setRemoteDescription).toHaveBeenCalled());
    expect(lives).toBe(2); expect(resumes).toBe(2); expect(getUserMedia).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.filter(([p]) => p.endsWith("/live/session")).map(([, init]) => JSON.parse(init.body as string));
    expect(bodies.map((b) => b.conversationId)).toEqual(["1".repeat(43), "2".repeat(43)]);
    if (repeated) expect(LivePeer.instances[1].close).toHaveBeenCalled();
  });
  it("keeps the conversation after Live expiry and reconnects voice to the same ID", async () => {
    const fetchMock = network();
    render(<AuthContext.Provider value={identity()}><IntelligenceLauncher /></AuthContext.Provider>);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Iniciar conversación por voz" }));
    await waitFor(() => expect(LivePeer.instances[0]?.setRemoteDescription).toHaveBeenCalled());
    act(() => { LivePeer.instances[0].started(); LivePeer.instances[0].channel.emit({ type: "session.closed", reason: "expired" }); });
    await screen.findByText("La sesión de voz terminó. Puedes volver a conectar la voz y continuar esta conversación.");
    await waitFor(() => expect(screen.getByLabelText("Tu consulta")).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Iniciar conversación por voz" }));
    await waitFor(() => expect(LivePeer.instances[1]?.setRemoteDescription).toHaveBeenCalled());
    const bodies = fetchMock.mock.calls.filter(([p]) => p.endsWith("/live/session")).map(([, init]) => JSON.parse(init.body as string));
    expect(bodies.map((b) => b.conversationId)).toEqual(["1".repeat(43), "1".repeat(43)]);
    expect(fetchMock.mock.calls.filter(([p]) => p.endsWith("/conversation/resume"))).toHaveLength(1);
  });
});

it.each([409, 429, 500, 502, 503, 504])("does not retry Live on status %s", async (status) => {
  const fetchMock = network(); const normal = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((path, init) => path.endsWith("/live/session") ? Promise.resolve(Response.json({ code: "conversation_unavailable" }, { status })) : normal(path, init));
  render(<AuthContext.Provider value={identity()}><IntelligenceLauncher /></AuthContext.Provider>);
  await open();
  await userEvent.click(screen.getByRole("button", { name: "Iniciar conversación por voz" }));
  await waitFor(() => expect(LivePeer.instances[0]?.close).toHaveBeenCalled());
  expect(fetchMock.mock.calls.filter(([p]) => p.endsWith("/live/session"))).toHaveLength(1);
  expect(fetchMock.mock.calls.filter(([p]) => p.endsWith("/conversation/resume"))).toHaveLength(1);
});
it("unmount during Live recovery never opens another peer from a late resume", async () => {
  const fetchMock = network(); const normal = fetchMock.getMockImplementation()!;
  const resumed = deferred<Response>(); let resumes = 0;
  fetchMock.mockImplementation((path, init) => {
    if (path.endsWith("/conversation/resume") && ++resumes === 2) return resumed.promise;
    if (path.endsWith("/live/session")) return Promise.resolve(Response.json({ code: "conversation_unavailable" }, { status: 404 }));
    return normal(path, init);
  });
  const view = render(<AuthContext.Provider value={identity()}><IntelligenceLauncher /></AuthContext.Provider>);
  await open();
  await userEvent.click(screen.getByRole("button", { name: "Iniciar conversación por voz" }));
  await waitFor(() => expect(resumes).toBe(2));
  view.unmount();
  await act(async () => resumed.resolve(Response.json(conversationCreated)));
  expect(LivePeer.instances).toHaveLength(1);
  expect(LivePeer.instances[0].close).toHaveBeenCalled();
});
