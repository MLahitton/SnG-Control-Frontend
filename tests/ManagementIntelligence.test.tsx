import { roleContext } from "./roleFixtures";
import { conversationCreated } from "./intelligenceFixtures";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppLayout from "@/app/(app)/layout";
import OverviewPage from "@/app/(app)/management/page";
import { AuthContext, AuthProvider, SESSION_TOKEN_KEY } from "@/features/auth/context/AuthProvider";
import { createApiClient } from "@/lib/api/apiClient";
import { manager, overview } from "./managementFixtures";
import { token, user } from "./fixtures";
import { deferred } from "./operationalFixtures";
import { intelligenceResponse, projectId } from "./intelligenceFixtures";
import { FakeAudio, FakeRecorder, mockVoiceBrowser } from "./intelligenceUiSetup";

const { router, location } = vi.hoisted(() => ({ router: { replace: vi.fn() }, location: { pathname: "/management" } }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => location.pathname }));
beforeEach(() => { mockVoiceBrowser(); location.pathname = "/management"; });
function context() {
  const invalidateSession = vi.fn();
  return { status: "authenticated" as const, ...roleContext("Management"), user: manager, error: null, signIn: vi.fn(), logout: vi.fn(), invalidateSession,
    apiClient: createApiClient({ getSession: () => ({ token, generation: 1 , activeRole: "Management" as const}), invalidateSession }) };
}
function backend(handler?: (path: string, options: RequestInit) => unknown) {
  const mock = vi.fn(async (path: string, options: RequestInit) => {
    if (path === "/api/auth/me") return Response.json(manager);
    if (path === "/api/intelligence/conversation") return Response.json(conversationCreated, { status: 201 });
    if (path === "/api/intelligence/conversation/close") return Response.json({ closed: true });
    if (path === "/api/intelligence/session") return Response.json({ authenticated: true, isManagement: true });
    const result = handler ? await handler(path, options) : path === "/api/backend/management/overview" ? overview : intelligenceResponse;
    return result instanceof Response ? result : Response.json(result);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}
async function open() {
  await userEvent.click(screen.getByRole("button", { name: "Abrir SnG Intelligence" }));
  await waitFor(() => expect(screen.getByLabelText("Tu consulta")).toBeEnabled());
}

describe("Management and Intelligence integration", () => {
  it.each([false, true])("preserves the shared shell on project navigation (mobile=%s)", async (mobile) => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: mobile })));
    const fetchMock = backend();
    const state = context();
    const view = render(<AuthContext.Provider value={state}><AppLayout><OverviewPage /></AppLayout></AuthContext.Provider>);
    await screen.findByRole("link", { name: "Proyecto Norte" });
    await open();
    await userEvent.type(screen.getByLabelText("Tu consulta"), "Consulta{Enter}");
    await screen.findByText(intelligenceResponse.answer);
    const reference = within(screen.getByRole("navigation", { name: "Referencias de la respuesta" })).getByRole("link", { name: "Casa Ximena" });
    expect(reference).toHaveAttribute("href", `/projects/${projectId}`);
    // Simulate Next replacing only the route child of the persistent app layout.
    reference.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(reference);
    location.pathname = `/projects/${projectId}`;
    view.rerender(<AuthContext.Provider value={state}><AppLayout><h1>Detalle del proyecto</h1></AppLayout></AuthContext.Provider>);
    expect(screen.getByRole("main")).toHaveTextContent("Detalle del proyecto");
    expect(within(screen.getByRole("navigation", { name: "Principal" })).getByRole("link", { name: "Proyectos" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Resumen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir SnG Intelligence" })).toBeInTheDocument();
    if (mobile) {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await open();
      expect(screen.getByText(intelligenceResponse.answer)).toBeInTheDocument();
    } else {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText(intelligenceResponse.answer)).toBeInTheDocument();
    }
    expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/session"))).toHaveLength(1);
  });

  it("aborts both pending experiences and rejects late results when Subject loses Management", async () => {
    const management = deferred<unknown>(), intelligence = deferred<unknown>();
    const fetchMock = backend((path) => path.startsWith("/api/backend/") ? management.promise : intelligence.promise);
    const state = context();
    const view = render(<AuthContext.Provider value={state}><AppLayout><OverviewPage /></AppLayout></AuthContext.Provider>);
    await open();
    await userEvent.type(screen.getByLabelText("Tu consulta"), "Consulta anterior{Enter}");
    const signals = fetchMock.mock.calls.filter(([path]) => path.endsWith("/overview") || path.endsWith("/chat")).map(([, init]) => init.signal);
    expect(signals).toHaveLength(2);
    view.rerender(<AuthContext.Provider value={{ ...state, user: { ...user, subject: "new-general-account" } }}><AppLayout><OverviewPage /></AppLayout></AuthContext.Provider>);
    expect(signals.every((signal) => signal?.aborted)).toBe(true);
    await act(async () => { management.resolve(overview); intelligence.resolve(intelligenceResponse); });
    expect(screen.getByRole("alert")).toHaveTextContent("No tienes acceso");
    expect(screen.queryByRole("link", { name: "Resumen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir SnG Intelligence" })).not.toBeInTheDocument();
    expect(screen.queryByText("Proyecto Norte")).not.toBeInTheDocument();
    expect(screen.queryByText(intelligenceResponse.answer)).not.toBeInTheDocument();
    expect(screen.queryByText("Consulta anterior")).not.toBeInTheDocument();
  });

  it.each(["recording", "speech"])("disposes %s and prior data on a Management-to-Management Subject change", async (resource) => {
    const { stopTrack } = mockVoiceBrowser();
    let next = false;
    backend((path) => {
      if (path.endsWith("/overview")) return next ? { ...overview, attention: { total: 0, items: [] } } : overview;
      if (path.endsWith("/speech")) return new Response(new Uint8Array([73, 68, 51]), { headers: { "Content-Type": "audio/mpeg" } });
      return intelligenceResponse;
    });
    const state = context();
    const view = render(<AuthContext.Provider value={state}><AppLayout><OverviewPage /></AppLayout></AuthContext.Provider>);
    await screen.findByRole("link", { name: "Proyecto Norte" });
    await open();
    await userEvent.type(screen.getByLabelText("Tu consulta"), "Consulta anterior{Enter}");
    await screen.findByText(intelligenceResponse.answer);
    if (resource === "recording") {
      await userEvent.click(screen.getByRole("button", { name: "Usar modo de voz básico" }));
      await userEvent.click(screen.getByRole("button", { name: "Iniciar consulta por voz" }));
      await screen.findByRole("button", { name: "Detener grabación" });
    } else {
      await userEvent.click(screen.getByRole("button", { name: "Escuchar respuesta" }));
      await screen.findByRole("button", { name: "Pausar audio" });
    }
    next = true;
    view.rerender(<AuthContext.Provider value={{ ...state, user: { ...manager, subject: "next-management-account" } }}><AppLayout><OverviewPage /></AppLayout></AuthContext.Provider>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Proyecto Norte" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resumen" })).toBeInTheDocument();
    if (resource === "recording") {
      expect(stopTrack).toHaveBeenCalled();
      expect(FakeRecorder.instances[0].state).toBe("inactive");
    } else {
      expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-audio");
    }
    await open();
    expect(screen.queryByText("Consulta anterior")).not.toBeInTheDocument();
    expect(screen.queryByText(intelligenceResponse.answer)).not.toBeInTheDocument();
  });

  it.each(["management", "intelligence"])("keeps the real session and the other experience after %s HTTP 403", async (denied) => {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    backend((path) => {
      const management = path === "/api/backend/management/overview";
      if ((management && denied === "management") || (!management && denied === "intelligence")) return Response.json({}, { status: 403 });
      return management ? overview : intelligenceResponse;
    });
    render(<AuthProvider><AppLayout><OverviewPage /></AppLayout></AuthProvider>);
    await screen.findByRole("button", { name: "Abrir SnG Intelligence" });
    if (denied === "management") expect(await screen.findByRole("alert")).toHaveTextContent("No tienes acceso");
    else await screen.findByRole("link", { name: "Proyecto Norte" });
    await open();
    await userEvent.type(screen.getByLabelText("Tu consulta"), "Consulta{Enter}");
    if (denied === "intelligence") expect(await screen.findByRole("alert")).toHaveTextContent("Intelligence está disponible para Gerencia");
    else await screen.findByText(intelligenceResponse.answer);
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBe(token);
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Resumen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir SnG Intelligence" })).toBeInTheDocument();
  });
});
