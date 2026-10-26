import { roleContext } from "./roleFixtures";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import OverviewPage from "@/app/(app)/management/page";
import TasksPage from "@/app/(app)/management/tasks/page";
import Home from "@/app/(app)/page";
import { AuthContext, AuthProvider, SESSION_TOKEN_KEY } from "@/features/auth/context/AuthProvider";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { createApiClient } from "@/lib/api/apiClient";
import { formatDate } from "@/lib/formatDate";
import { timingLabels } from "@/features/tasks/TaskList";
import { token, user } from "./fixtures";
import { deferred, mockBackend, renderOperational } from "./operationalFixtures";
import { manager, managementTask, managementTasks, overview } from "./managementFixtures";

const { router } = vi.hoisted(() => ({ router: { replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

function sessionContext() {
  const invalidateSession = vi.fn();
  const apiClient = createApiClient({ getSession: () => ({ token, generation: 1 , activeRole: "Management" as const}), invalidateSession });
  return { status: "authenticated" as const, ...roleContext("Management"), user: manager, error: null, signIn: vi.fn(), logout: vi.fn(), invalidateSession, apiClient };
}

describe("management access and session", () => {
  it.each([OverviewPage, TasksPage])("does not fetch or reveal protected content for a normal account", (Page) => {
    const fetchMock = mockBackend(() => overview);
    renderOperational(<Page />);
    expect(screen.getByRole("alert")).toHaveTextContent("No tienes acceso a la vista de Gerencia.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Proyecto Norte")).not.toBeInTheDocument();
  });
  it("adds a home entry only for the owned active Management role", () => {
    const context = sessionContext();
    const view = render(<AuthContext.Provider value={context}><Home /></AuthContext.Provider>);
    expect(screen.getByRole("link", { name: /Resumen/ })).toHaveAttribute("href", "/management");
    view.rerender(<AuthContext.Provider value={{ ...context, user }}><Home /></AuthContext.Provider>);
    expect(screen.queryByRole("link", { name: /Resumen/ })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Accesos rápidos" })).toBeInTheDocument();
  });
  it.each([OverviewPage, TasksPage])("discards late data and aborts when management access disappears, even for the same Subject", async (Page) => {
    const pending = deferred<unknown>();
    const fetchMock = mockBackend(() => pending.promise);
    const context = sessionContext();
    const view = render(<AuthContext.Provider value={context}><Page /></AuthContext.Provider>);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
    const signal = fetchMock.mock.calls[0][1].signal;
    view.rerender(<AuthContext.Provider value={{ ...context, user }}><Page /></AuthContext.Provider>);
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve(Page === OverviewPage ? overview : managementTasks));
    expect(screen.queryByText("Proyecto Norte")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("No tienes acceso");
  });
  it.each([OverviewPage, TasksPage])("refetches and hides previous data across management Subjects with a stable ApiClient", async (Page) => {
    const pending = deferred<unknown>();
    const payload = Page === OverviewPage ? overview : managementTasks;
    const fetchMock = mockBackend(() => fetchMock.mock.calls.length === 1 ? payload : pending.promise);
    const context = sessionContext();
    const view = render(<AuthContext.Provider value={context}><Page /></AuthContext.Provider>);
    await screen.findByRole("link", { name: "Proyecto Norte" });
    view.rerender(<AuthContext.Provider value={{ ...context, user: { ...manager, subject: "another-synthetic-manager" } }}><Page /></AuthContext.Provider>);
    expect(screen.queryByRole("link", { name: "Proyecto Norte" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve(Page === OverviewPage ? { ...overview, attention: { total: 0, items: [] } } : []));
    expect(screen.queryByRole("link", { name: "Proyecto Norte" })).not.toBeInTheDocument();
  });
  it("restores the management flag through AuthProvider and removes the previous experience on new login", async () => {
    function SessionControls() {
      const { user: identity, signIn } = useAuth();
      return <><p>{identity?.isManagement === true ? "Sesión gerencial" : "Sesión general"}</p><button onClick={() => void signIn("next-test-token")}>Cambiar cuenta</button><OverviewPage /></>;
    }
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    let identity = manager;
    vi.stubGlobal("fetch", vi.fn(async (path: string) => Response.json(path === "/api/auth/me" ? identity : overview)));
    render(<AuthProvider><SessionControls /></AuthProvider>);
    await screen.findByText("Sesión gerencial");
    await screen.findByRole("link", { name: "Proyecto Norte" });
    identity = { ...user, subject: "another-synthetic-user" };
    await userEvent.click(screen.getByRole("button", { name: "Cambiar cuenta" }));
    await screen.findByText("Sesión general");
    expect(screen.queryByRole("link", { name: "Proyecto Norte" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("No tienes acceso");
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBe("next-test-token");
  });
  it.each([401, 403])("uses the real provider for management HTTP %s", async (status) => {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    vi.stubGlobal("fetch", vi.fn(async (path: string) => path === "/api/auth/me" ? Response.json(manager) : Response.json({ detail: "secret diagnostic" }, { status })));
    render(<AuthProvider><OverviewPage /></AuthProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes acceso");
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBe(status === 401 ? null : token);
    if (status === 401) expect(router.replace).toHaveBeenCalledWith("/login");
    else expect(router.replace).not.toHaveBeenCalled();
    expect(screen.queryByText(/secret diagnostic/)).not.toBeInTheDocument();
  });
  it.each([OverviewPage, TasksPage])("aborts its request on unmount", (Page) => {
    const fetchMock = mockBackend(() => new Promise(() => {}));
    const view = renderOperational(<Page />, manager);
    const signal = fetchMock.mock.calls[0][1].signal;
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});

describe("management overview", () => {
  it("renders authoritative indicators, area summaries and attention in backend order, including nulls and truncation", async () => {
    const fetchMock = mockBackend(() => overview);
    renderOperational(<OverviewPage />, manager);
    await screen.findByRole("link", { name: "Proyecto Norte" });
    const kpis = screen.getByLabelText("Indicadores de operación");
    for (const [label, value] of [["Total de proyectos", "12"], ["Tareas activas", "7"], ["Tareas atrasadas", "1"], ["Vencen hoy", "1"]]) {
      expect(within(within(kpis).getByText(label).parentElement!).getByText(value)).toBeInTheDocument();
    }
    const work = screen.getByRole("region", { name: "Estado del trabajo" });
    for (const [label, value] of [["Pendientes", "3"], ["En curso", "4"], ["Completadas", "5"]]) expect(within(work).getByText(label).parentElement).toHaveTextContent(value);
    const areas = screen.getByRole("region", { name: "Resumen por área" });
    expect(within(areas).getAllByRole("row")).toHaveLength(3);
    expect(within(areas).getByRole("row", { name: /Presupuestos/ })).toHaveTextContent("Presupuestos223101");
    const attention = screen.getByRole("region", { name: "Requieren atención" });
    expect(within(attention).getAllByRole("listitem").map((item) => within(item).getByRole("link").textContent)).toEqual(["Proyecto Norte", "Proyecto Sur"]);
    expect(within(attention).getByRole("link", { name: "Proyecto Norte" })).toHaveAttribute("href", "/projects/project-1");
    expect(attention).toHaveTextContent("Sin SG");
    expect(attention).toHaveTextContent("Sin vencimiento");
    expect(attention).toHaveTextContent("Sin iniciar");
    expect(attention).toHaveTextContent(formatDate(managementTask.deadlineAt));
    expect(attention).toHaveTextContent("Mostrando 2 de 17 tareas que requieren atención");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/management/overview");
  });
  it("renders zero counts and empty areas/attention without invented rows", async () => {
    mockBackend(() => ({ ...overview, totalProjects: 0, tasks: { pending: 0, inProgress: 0, completed: 0 }, leadTime: Object.fromEntries(Object.keys(overview.leadTime).map((key) => [key, 0])), areas: [], attention: { total: 0, items: [] } }));
    renderOperational(<OverviewPage />, manager);
    expect(await screen.findByText("Todavía no hay proyectos.")).toBeInTheDocument();
    expect(screen.getByText("Todavía no hay tareas registradas.")).toBeInTheDocument();
    expect(screen.getByText("Todavía no hay áreas con tareas.")).toBeInTheDocument();
    expect(screen.getByText("No hay tareas que requieran atención en este momento.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it.each([503, "network"])("shows safe failure %s and retries", async (failure) => {
    let failed = true;
    mockBackend(() => {
      if (!failed) return overview;
      if (failure === "network") throw new Error("secret network path");
      return Response.json({ detail: "secret network path" }, { status: 503 });
    });
    renderOperational(<OverviewPage />, manager);
    await screen.findByRole("alert");
    expect(screen.queryByText(/secret network path/)).not.toBeInTheDocument();
    failed = false;
    await userEvent.click(screen.getByRole("button", { name: "Volver a cargar" }));
    await screen.findByRole("link", { name: "Proyecto Norte" });
  });
});

describe("management operation", () => {
  it("keeps backend ordering, completed and legacy tasks, nullable dates and project links", async () => {
    mockBackend(() => managementTasks);
    renderOperational(<TasksPage />, manager);
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("link").map((link) => link.textContent)).toEqual(managementTasks.map((task) => task.projectName));
    const pending = within(table).getByRole("row", { name: /Proyecto Sur/ });
    expect(pending).toHaveTextContent("Sin SG");
    expect(pending).toHaveTextContent("Sin iniciar");
    expect(pending).toHaveTextContent("Sin vencimiento");
    expect(pending).toHaveTextContent("Cali · Classic");
    expect(within(table).getByRole("row", { name: /Proyecto Histórico/ })).toHaveTextContent("Sin seguimiento histórico");
    expect(within(table).getByRole("row", { name: /Proyecto Histórico/ })).toHaveTextContent("Otra tarea");
    expect(within(table).getByRole("row", { name: /Proyecto Terminado/ })).toHaveTextContent(formatDate(managementTasks[3].completedAt));
    expect(within(table).getByRole("link", { name: "Proyecto Norte" })).toHaveAttribute("href", "/projects/project-1");
  });
  it("filters area/status locally, combines filters, preserves order and resets", async () => {
    const fetchMock = mockBackend(() => managementTasks);
    renderOperational(<TasksPage />, manager);
    await screen.findByRole("table");
    await userEvent.selectOptions(screen.getByLabelText("Área"), "Commercial");
    expect(within(screen.getByRole("table")).getAllByRole("link").map((link) => link.textContent)).toEqual(["Proyecto Sur", "Proyecto Terminado"]);
    await userEvent.selectOptions(screen.getByLabelText("Estado"), "Completed");
    expect(within(screen.getByRole("table")).getAllByRole("link")).toHaveLength(1);
    await userEvent.selectOptions(screen.getByLabelText("Situación"), "Overdue");
    expect(screen.getByText("No hay tareas que coincidan con los filtros.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Restablecer filtros" }));
    expect(within(screen.getByRole("table")).getAllByRole("link")).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/management/tasks");
  });
  it.each(Object.entries(timingLabels))("filters the backend situation %s without computing dates", async (value, label) => {
    mockBackend(() => [{ ...managementTask, leadTimeStatus: value }, { ...managementTask, taskId: "other", projectName: "Otra obra", leadTimeStatus: value === "NotStarted" ? "Overdue" : "NotStarted" }]);
    renderOperational(<TasksPage />, manager);
    await screen.findByRole("table");
    await userEvent.selectOptions(screen.getByLabelText("Situación"), value);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("link")).toHaveLength(1);
    expect(within(table).getByText(label)).toBeInTheDocument();
  });
  it.each(["proyecto sur", "CLIENTE SUR", "cALI", "sg001"])("searches locally ignoring case: %s", async (query) => {
    const fetchMock = mockBackend(() => managementTasks);
    renderOperational(<TasksPage />, manager);
    await screen.findByRole("table");
    await userEvent.type(screen.getByRole("searchbox"), query);
    const links = within(screen.getByRole("table")).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(query === "sg001" ? ["Proyecto Norte", "Proyecto Histórico", "Proyecto Terminado"] : ["Proyecto Sur"]);
    await userEvent.click(screen.getByRole("button", { name: "Restablecer filtros" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("handles an empty collection", async () => {
    mockBackend(() => []);
    renderOperational(<TasksPage />, manager);
    expect(await screen.findByText("Todavía no hay tareas registradas.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
