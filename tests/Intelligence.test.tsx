import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntelligenceLauncher } from "@/features/intelligence/components/IntelligenceLauncher";
import { IntelligenceResponseView } from "@/features/intelligence/components/IntelligenceResponseView";
import { AuthContext, AuthProvider, SESSION_TOKEN_KEY } from "@/features/auth/context/AuthProvider";
import { createApiClient } from "@/lib/api/apiClient";
import { manager } from "./managementFixtures";
import { token, user } from "./fixtures";
import { deferred } from "./operationalFixtures";
import { intelligenceResponse, intelligenceResponses, projectId, requestId } from "./intelligenceFixtures";
import { FakeAudio, FakeRecorder, mockVoiceBrowser } from "./intelligenceUiSetup";
const { router } = vi.hoisted(() => ({ router: { replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
beforeEach(() => { mockVoiceBrowser(); });
function context(identity = manager) {
  const invalidateSession = vi.fn();
  return { status: "authenticated" as const, user: identity, error: null, signIn: vi.fn(), logout: vi.fn(), invalidateSession, apiClient: createApiClient({ getSession: () => ({ token, generation: 1 }), invalidateSession }) };
}
function backend(handler?: (path: string, options: RequestInit) => unknown) {
  const mock = vi.fn(async (path: string, options: RequestInit) => {
    if (path === "/api/intelligence/session") return Response.json({ authenticated: true, isManagement: true });
    const result = await (handler ? handler(path, options) : intelligenceResponse);
    return result instanceof Response ? result : Response.json(result);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}
async function open() {
  await userEvent.click(screen.getByRole("button", { name: "Abrir SnG Intelligence" }));
  await waitFor(() => expect(screen.getByLabelText("Tu consulta")).toBeEnabled());
}
describe("Intelligence shell", () => {
  it("appears only for Management, does not request mic or API before opening, and restores trigger focus", async () => {
    const { getUserMedia } = mockVoiceBrowser();
    const fetchMock = backend();
    const state = context(user);
    const view = render(<AuthContext.Provider value={state}><IntelligenceLauncher /></AuthContext.Provider>);
    expect(screen.queryByRole("button", { name: "Abrir SnG Intelligence" })).not.toBeInTheDocument();
    view.rerender(<AuthContext.Provider value={{ ...state, user: manager }}><IntelligenceLauncher /></AuthContext.Provider>);
    expect(fetchMock).not.toHaveBeenCalled();
    await open();
    expect(screen.getByRole("dialog", { name: "SnG Intelligence" })).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir SnG Intelligence" })).toHaveFocus();
  });
  it("sends Enter once, supports Shift+Enter, prevents empty submits and does not autoplay text", async () => {
    const pending = deferred<unknown>();
    const fetchMock = backend(() => pending.promise);
    render(<AuthContext.Provider value={context()}><IntelligenceLauncher /></AuthContext.Provider>);
    await open();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    const input = screen.getByLabelText("Tu consulta");
    await userEvent.type(input, "Hola{Shift>}{Enter}{/Shift}equipo");
    expect(input).toHaveValue("Hola\nequipo");
    await userEvent.keyboard("{Enter}");
    fireEvent.submit(input.closest("form")!);
    expect(screen.getByRole("status")).toHaveTextContent("Analizando");
    expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/chat"))).toHaveLength(1);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({ message: "Hola\nequipo" });
    await act(async () => pending.resolve(intelligenceResponse));
    await screen.findByText(intelligenceResponse.answer);
    expect(screen.queryByText(intelligenceResponse.spokenAnswer)).not.toBeInTheDocument();
    expect(FakeAudio.instances).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Casa Ximena" })).toHaveAttribute("href", `/projects/${projectId}`);
    expect(screen.queryByText(token)).not.toBeInTheDocument();
  });
  it("cancels a pending query and ignores its late answer", async () => {
    const pending = deferred<unknown>();
    const fetchMock = backend(() => pending.promise);
    render(<AuthContext.Provider value={context()}><IntelligenceLauncher /></AuthContext.Provider>);
    await open(); await userEvent.type(screen.getByLabelText("Tu consulta"), "Consulta{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar consulta" }));
    expect(fetchMock.mock.calls[1][1].signal?.aborted).toBe(true);
    await act(async () => pending.resolve(intelligenceResponse));
    expect(screen.queryByText(intelligenceResponse.answer)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tu consulta")).toBeEnabled();
  });
  it.each([403, 422, 429, 503])("handles safe HTTP %s without logging out", async (status) => {
    backend(() => Response.json({ requestId, detail: "provider-private" }, { status }));
    const state = context();
    render(<AuthContext.Provider value={state}><IntelligenceLauncher /></AuthContext.Provider>);
    await open(); await userEvent.type(screen.getByLabelText("Tu consulta"), "Consulta{Enter}");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(requestId);
    expect(alert).not.toHaveTextContent("provider-private");
    if (status === 403) expect(alert).toHaveTextContent("Intelligence está disponible para Gerencia.");
    if (status === 503) expect(alert).toHaveTextContent("Intelligence no está disponible temporalmente.");
    expect(state.invalidateSession).not.toHaveBeenCalled();
    if (status !== 403) expect(screen.getByLabelText("Tu consulta")).toHaveValue("Consulta");
  });
  it("handles session verification failure with retry before enabling the composer", async () => {
    let ready = false;
    vi.stubGlobal("fetch", vi.fn(async () => ready ? Response.json({ authenticated: true, isManagement: true }) : Response.json({}, { status: 503 })));
    render(<AuthContext.Provider value={context()}><IntelligenceLauncher /></AuthContext.Provider>);
    await userEvent.click(screen.getByRole("button", { name: "Abrir SnG Intelligence" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Tu consulta")).toBeDisabled();
    ready = true;
    await userEvent.click(screen.getByRole("button", { name: "Volver a verificar" }));
    await waitFor(() => expect(screen.getByLabelText("Tu consulta")).toBeEnabled());
  });
  it("clears the panel and aborts late requests when Subject changes, with a stable API instance", async () => {
    const pending = deferred<unknown>();
    const fetchMock = backend(() => pending.promise);
    const state = context();
    const view = render(<AuthContext.Provider value={state}><IntelligenceLauncher /></AuthContext.Provider>);
    await open(); await userEvent.type(screen.getByLabelText("Tu consulta"), "Consulta anterior{Enter}");
    const signal = fetchMock.mock.calls[1][1].signal;
    view.rerender(<AuthContext.Provider value={{ ...state, user: { ...manager, subject: "other-test-manager" } }}><IntelligenceLauncher /></AuthContext.Provider>);
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => pending.resolve(intelligenceResponse));
    await open();
    expect(screen.queryByText("Consulta anterior")).not.toBeInTheDocument();
    expect(screen.queryByText(intelligenceResponse.answer)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/session"))).toHaveLength(2);
    view.rerender(<AuthContext.Provider value={{ ...state, user }}><IntelligenceLauncher /></AuthContext.Provider>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir SnG Intelligence" })).not.toBeInTheDocument();
  });
  it("uses the existing provider's global 401 invalidation", async () => {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    vi.stubGlobal("fetch", vi.fn(async (path: string) => path === "/api/auth/me" ? Response.json(manager) : Response.json({}, { status: 401 })));
    render(<AuthProvider><IntelligenceLauncher /></AuthProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Abrir SnG Intelligence" }));
    await waitFor(() => expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull());
    expect(router.replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("submits an autocontained clarification using the official project name", async () => {
    const fetchMock = backend(() => intelligenceResponses[5]);
    render(<AuthContext.Provider value={context()}><IntelligenceLauncher /></AuthContext.Provider>);
    await open(); await userEvent.type(screen.getByLabelText("Tu consulta"), "Cómo va Casa{Enter}");
    await userEvent.click(await screen.findByRole("button", { name: "Consultar Casa Ximena" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/chat"))).toHaveLength(2));
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string).message).toBe("¿Cómo va Casa Ximena?");
  });
  it("shows transcript, uses spokenAnswer for MP3, pauses/resumes/stops and revokes audio on close", async () => {
    FakeRecorder.supported = "audio/mp4";
    const fetchMock = backend((path, options) => {
      if (path.endsWith("/speech")) return new Response(new Uint8Array([73, 68, 51]), { headers: { "Content-Type": "audio/mpeg" } });
      expect(((options.body as FormData).get("file") as File).type).toBe("audio/mp4");
      return { ...intelligenceResponse, transcript: "Consulta por micrófono" };
    });
    render(<AuthContext.Provider value={context()}><IntelligenceLauncher /></AuthContext.Provider>);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Iniciar consulta por voz" }));
    await screen.findByRole("button", { name: "Detener grabación" });
    await userEvent.click(screen.getByRole("button", { name: "Detener grabación" }));
    await screen.findByText("Consulta por micrófono");
    await screen.findByRole("button", { name: "Pausar audio" });
    expect(JSON.parse(fetchMock.mock.calls.find(([path]) => path.endsWith("/speech"))![1].body as string)).toEqual({ text: intelligenceResponse.spokenAnswer, responseType: "direct" });
    await userEvent.click(screen.getByRole("button", { name: "Pausar audio" }));
    expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Reanudar audio" }));
    expect(FakeAudio.instances[0].play).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("button", { name: "Cerrar SnG Intelligence" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-audio");
    expect(FakeAudio.instances[0].pause).toHaveBeenCalledTimes(2);
  });
  it("allows disabling voice autoplay and does not block text after microphone denial", async () => {
    const { getUserMedia } = mockVoiceBrowser();
    const fetchMock = backend(() => ({ ...intelligenceResponse, transcript: "Voz sin reproducción" }));
    const state = context();
    render(<AuthContext.Provider value={state}><IntelligenceLauncher /></AuthContext.Provider>);
    await open();
    getUserMedia.mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"));
    await userEvent.click(screen.getByRole("button", { name: "Iniciar consulta por voz" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Revisa el permiso");
    expect(screen.getByLabelText("Tu consulta")).toBeEnabled();
    await userEvent.click(screen.getByLabelText("Escuchar al consultar por voz"));
    await userEvent.click(screen.getByRole("button", { name: "Iniciar consulta por voz" }));
    await userEvent.click(await screen.findByRole("button", { name: "Detener grabación" }));
    await screen.findByText("Voz sin reproducción");
    expect(fetchMock.mock.calls.some(([path]) => path.endsWith("/speech"))).toBe(false);
  });
});
describe("validated response renderers", () => {
  it.each(intelligenceResponses)("renders $responseType with safe project links and screen answer", (response) => {
    render(<IntelligenceResponseView response={response} onAsk={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText(response.answer)).toBeInTheDocument();
    expect(screen.queryByText(response.spokenAnswer)).not.toBeInTheDocument();
    const references = within(screen.getByRole("navigation", { name: "Referencias de la respuesta" }));
    for (const link of references.getAllByRole("link")) expect(link).toHaveAttribute("href", `/projects/${projectId}`);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    if (response.responseType === "project_status") {
      expect(screen.getByText(/Sin vencimiento/)).toBeInTheDocument();
      expect(screen.getByText("Pendiente · Presupuestos")).toBeInTheDocument();
      expect(screen.getByText(/Sin iniciar/)).toBeInTheDocument();
    }
  });
  it("renders answer as text without HTML execution", () => {
    const { container } = render(<IntelligenceResponseView response={{ ...intelligenceResponse, answer: '<img src=x onerror="alert(1)">' }} onAsk={vi.fn()} onNavigate={vi.fn()} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/<img/)).toBeInTheDocument();
  });
});
