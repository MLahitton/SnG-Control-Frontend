import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, AuthProvider, SESSION_TOKEN_KEY } from "@/features/auth/context/AuthProvider";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { IntelligenceLauncher } from "@/features/intelligence/components/IntelligenceLauncher";
import { createApiClient } from "@/lib/api/apiClient";
import { manager } from "./managementFixtures";
import { token, user } from "./fixtures";
import { liveCreated, liveCaption, completedCall } from "./liveFixtures";
import { mockLiveBrowser, LivePeer } from "./liveBrowser";
import { intelligenceResponse } from "./intelligenceFixtures";
import { FakeRecorder, mockVoiceBrowser } from "./intelligenceUiSetup";
const { router } = vi.hoisted(() => ({ router: { replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
function context() {
  return { status: "authenticated" as const, user: manager, error: null, signIn: vi.fn(), logout: vi.fn(), invalidateSession: vi.fn(), apiClient: createApiClient({ getSession: () => ({ token, generation: 1 }), invalidateSession: vi.fn() }) };
}
function network() {
  const fetchMock = vi.fn<(path: string, options: RequestInit) => Promise<Response>>(async (path) => {
    if (path === "/api/auth/me") return Response.json(manager);
    if (path === "/api/intelligence/session") return Response.json({ authenticated: true, isManagement: true });
    if (path.endsWith("/live/session")) return Response.json(liveCreated);
    if (path.endsWith("/live/close")) return Response.json({ closed: true });
    if (path.endsWith("/voice/speech")) return new Response("audio", { headers: { "Content-Type": "audio/mpeg" } });
    return Response.json({ ...intelligenceResponse, transcript: "Consulta básica" });
  });
  vi.stubGlobal("fetch", fetchMock); return fetchMock;
}
async function open() {
  await userEvent.click(await screen.findByRole("button", { name: "Abrir SnG Intelligence" }));
  await waitFor(() => expect(screen.getByLabelText("Tu consulta")).toBeEnabled());
}
async function start() {
  await open();
  await userEvent.click(screen.getByRole("button", { name: "Iniciar conversación por voz" }));
  await waitFor(() => expect(LivePeer.instances[0]?.setRemoteDescription).toHaveBeenCalled());
  act(() => LivePeer.instances[0].started());
}
beforeEach(() => { mockLiveBrowser(); network(); });
describe("continuous voice in the existing panel", () => {
  it.each([201, 502])("one microphone click creates exactly one session under StrictMode, including HTTP %s", async (status) => {
    const fetchMock = network();
    const normal = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (path, init) => path.endsWith("/live/session")
      ? Response.json(status === 201 ? liveCreated : { status }, { status }) : normal(path, init));
    const state = context();
    const content = () => <StrictMode><AuthContext.Provider value={state}><IntelligenceLauncher /></AuthContext.Provider></StrictMode>;
    const view = render(content());
    await open();
    expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/live/session"))).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Iniciar conversación por voz" }));
    if (status === 201) {
      await waitFor(() => expect(LivePeer.instances[0]?.setRemoteDescription).toHaveBeenCalled());
      act(() => LivePeer.instances[0].started());
    } else await screen.findByRole("alert");
    view.rerender(content());
    await act(async () => {});
    const calls = fetchMock.mock.calls.filter(([path]) => path.endsWith("/live/session"));
    expect(calls).toHaveLength(1);
    expect(calls[0][1].method).toBe("POST");
    view.unmount();
    await act(async () => {});
    expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/live/session"))).toHaveLength(1);
  });
  it("offers live as the primary microphone with accessible state/mute/finish, no recording send", async () => {
    const { track } = mockLiveBrowser(); render(<AuthContext.Provider value={context()}><IntelligenceLauncher /></AuthContext.Provider>);
    await start();
    expect(screen.getByRole("status", { name: "Estado de voz en vivo" })).toHaveTextContent("Escuchando");
    expect(screen.queryByRole("button", { name: "Detener grabación" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Silenciar micrófono" })); expect(track.enabled).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Activar micrófono" })); expect(track.enabled).toBe(true);
    act(() => LivePeer.instances[0].channel.emit(liveCaption("assistant", "Encontré dos proyectos.")));
    expect(screen.getByRole("status", { name: "Estado de voz en vivo" })).toHaveTextContent("Respondiendo");
    act(() => LivePeer.instances[0].channel.emit(liveCaption("user", "La de Ximena", 1000)));
    expect(screen.getByText("La de Ximena")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Estado de voz en vivo" })).toHaveTextContent("Te escucho");
    await userEvent.click(screen.getByRole("button", { name: "Finalizar conversación" }));
    await screen.findByRole("button", { name: "Iniciar conversación por voz" });
    expect(track.stop).toHaveBeenCalled();
  });
  it("keeps text stateless while voice retains context and presents delegated references", async () => {
    const fetchMock = network(); render(<AuthContext.Provider value={context()}><IntelligenceLauncher /></AuthContext.Provider>);
    await start();
    await act(async () => LivePeer.instances[0].channel.emit(completedCall()));
    expect(screen.getByRole("region", { name: "Datos consultados por voz" })).toHaveTextContent(intelligenceResponse.answer);
    await userEvent.type(screen.getByLabelText("Tu consulta"), "Consulta de texto{Enter}");
    await waitFor(() => expect(fetchMock.mock.calls.some(([path]) => path.endsWith("/chat"))).toBe(true));
    const call = fetchMock.mock.calls.find(([path]) => path.endsWith("/chat"))!;
    expect(JSON.parse(call[1].body as string)).toEqual({ message: "Consulta de texto" });
    expect(LivePeer.instances).toHaveLength(1);
  });
  it.each(["unsupported", "unavailable"])("offers explicit functional basic fallback for %s", async (failure) => {
    mockVoiceBrowser();
    if (failure === "unsupported") vi.stubGlobal("RTCPeerConnection", undefined);
    else mockLiveBrowser();
    const fetchMock = network(); const normal = fetchMock.getMockImplementation()!;
    if (failure === "unavailable") fetchMock.mockImplementation(async (path, init) => path.endsWith("/live/session") ? Response.json({}, { status: 503 }) : normal(path, init));
    render(<AuthContext.Provider value={context()}><IntelligenceLauncher /></AuthContext.Provider>);
    await open(); await userEvent.click(screen.getByRole("button", { name: "Iniciar conversación por voz" }));
    await screen.findByRole("alert");
    if (failure === "unavailable") expect(fetchMock.mock.calls.some(([path]) => path.endsWith("/live/session"))).toBe(true);
    expect(FakeRecorder.instances).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Usar modo de voz básico" }));
    await userEvent.click(screen.getByRole("button", { name: "Iniciar consulta por voz" }));
    await userEvent.click(await screen.findByRole("button", { name: "Detener grabación" }));
    await screen.findByText("Consulta básica");
    expect(fetchMock.mock.calls.some(([path]) => path.endsWith("/voice"))).toBe(true);
    expect(fetchMock.mock.calls.some(([path]) => path.endsWith("/voice/speech"))).toBe(true);
  });
  it("explains secure-context requirements without requesting permission", async () => {
    const { getUserMedia } = mockLiveBrowser(); vi.stubGlobal("isSecureContext", false);
    render(<AuthContext.Provider value={context()}><IntelligenceLauncher /></AuthContext.Provider>);
    await open(); await userEvent.click(screen.getByRole("button", { name: "Iniciar conversación por voz" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("HTTPS o localhost"); expect(getUserMedia).not.toHaveBeenCalled();
  });
  it.each(["panel", "subject", "logout", "flag"])("releases microphone, RTC and captions on %s change", async (action) => {
    const { track } = mockLiveBrowser(); const state = context();
    const view = render(<AuthContext.Provider value={state}><IntelligenceLauncher /></AuthContext.Provider>);
    await start(); act(() => LivePeer.instances[0].channel.emit(liveCaption("user", "Dato anterior")));
    if (action === "panel") await userEvent.click(screen.getByRole("button", { name: "Cerrar SnG Intelligence" }));
    else view.rerender(<AuthContext.Provider value={{ ...state, ...(action === "logout" ? { status: "unauthenticated", user: null } : { user: action === "flag" ? user : { ...manager, subject: "next-synthetic-subject" } }) }}><IntelligenceLauncher /></AuthContext.Provider>);
    await waitFor(() => expect(LivePeer.instances[0].close).toHaveBeenCalled());
    expect(track.stop).toHaveBeenCalled(); expect(screen.queryByText("Dato anterior")).not.toBeInTheDocument();
    if (action === "panel" || action === "subject") { await open(); expect(screen.queryByText("Dato anterior")).not.toBeInTheDocument(); }
  });
  it("survives route-child navigation with the same mounted shell", async () => {
    const state = context(); const view = render(<AuthContext.Provider value={state}><h1>Gerencia</h1><IntelligenceLauncher /></AuthContext.Provider>);
    await start();
    view.rerender(<AuthContext.Provider value={state}><h1>Proyecto</h1><IntelligenceLauncher /></AuthContext.Provider>);
    expect(LivePeer.instances).toHaveLength(1); expect(LivePeer.instances[0].close).not.toHaveBeenCalled();
    expect(screen.getByRole("status", { name: "Estado de voz en vivo" })).toHaveTextContent("Escuchando");
  });
  it("real provider logout destroys live state and revokes with the old session credential", async () => {
    const { track } = mockLiveBrowser(); const fetchMock = network(); sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    function Controls() { const { logout } = useAuth(); return <><button onClick={logout}>Salir de sesión</button><IntelligenceLauncher /></>; }
    render(<AuthProvider><Controls /></AuthProvider>); await start();
    fireEvent.click(screen.getByRole("button", { name: "Salir de sesión" }));
    await waitFor(() => expect(LivePeer.instances[0].close).toHaveBeenCalled());
    expect(track.stop).toHaveBeenCalled(); expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    const close = fetchMock.mock.calls.find(([path]) => path.endsWith("/live/close"))!;
    expect(new Headers(close[1].headers).get("Authorization")).toBe(`Bearer ${token}`);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
