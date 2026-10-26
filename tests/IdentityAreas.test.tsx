import { useEffect, useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, ACTIVE_ROLE_KEY, SESSION_TOKEN_KEY } from "@/features/auth/context/AuthProvider";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { AppShell } from "@/features/shell/components/AppShell";
import { ProjectDetailPage } from "@/features/projects/ProjectDetailPage";
import { TasksPage } from "@/features/tasks/TasksPage";
import { isCurrentUser, type CurrentUser } from "@/features/auth/types/auth";
import { client, project, task, inProgressTask } from "./operationalFixtures";
import { projectDocuments } from "./documentFixtures";
import { user, token } from "./fixtures";

const { router } = vi.hoisted(() => ({ router: { replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/" }));
const multi: CurrentUser = { ...user, isManagement: true, roles: ["CommercialAdvisor", "Budgets", "CommercialHead", "Management"] };
const cleanup = vi.fn();
function Probe() {
  const { activeRole, apiClient, setActiveRole } = useAuth();
  const [local, setLocal] = useState(0);
  useEffect(() => () => cleanup(), []);
  return <><p>Área: {activeRole}</p><button onClick={() => setLocal(local + 1)}>Local {local}</button>
    <button onClick={() => { void apiClient.get("projects").catch(() => {}); }}>Consultar</button>
    <button onClick={() => setActiveRole("Accounting")}>Solicitar futura</button></>;
}
function mount(identity: CurrentUser = multi, child = <Probe />) {
  sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  const fetchMock = vi.fn(async (path: string) => path === "/api/auth/me" ? Response.json(identity) : Response.json([]));
  vi.stubGlobal("fetch", fetchMock);
  const view = render(<AuthProvider><AppShell>{child}</AppShell></AuthProvider>);
  return { ...view, fetchMock };
}
beforeEach(() => { sessionStorage.clear(); cleanup.mockClear(); router.replace.mockClear(); });

describe("Identity and active areas", () => {
  it("shows no operational content for an account without roles", async () => {
    const { fetchMock } = mount({ ...user, roles: [] });
    expect(await screen.findByText("Tu cuenta no tiene un área asignada en SnG Control.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("automatically selects the sole role and defaults task queries to Budgets", async () => {
    const { fetchMock } = mount({ ...user, roles: ["Budgets"] }, <TasksPage />);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes("area=Budgets"))).toBe(true));
    expect(screen.queryByLabelText("Área")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Estado")).toHaveValue("Pending");
    expect(screen.queryByRole("link", { name: "Crear proyecto" })).not.toBeInTheDocument();
  });
  it("selects only owned implemented roles, resets local state, cancels requests and keeps the Google token", async () => {
    const { fetchMock } = mount();
    await screen.findByText("Selecciona el área con la que vas a trabajar");
    expect(screen.queryByText("Contabilidad")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Asesor Comercial" }));
    expect(screen.getByRole("link", { name: "Clientes" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Local 0" }));
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_url: string, init?: RequestInit) => { signal = init?.signal ?? undefined; return new Promise<Response>(() => {}); });
    await userEvent.click(screen.getByRole("button", { name: "Consultar" }));
    await userEvent.selectOptions(screen.getByLabelText("Trabajando como"), "Budgets");
    expect(signal?.aborted).toBe(true);
    expect(cleanup).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Local 0" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clientes" })).toBeInTheDocument();
    expect(screen.getByText("Área: Budgets")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Solicitar futura" }));
    expect(screen.getByText("Área: Budgets")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Trabajando como"), "CommercialHead");
    expect(screen.getByText("Área: CommercialHead")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Trabajando como"), "Management");
    expect(router.replace).toHaveBeenLastCalledWith("/management");
    expect(screen.getByRole("link", { name: "Resumen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir SnG Intelligence" })).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBe(token);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/auth/me")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(sessionStorage.getItem(ACTIVE_ROLE_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
  });
  it.each(["Budgets", "Accounting", "Unknown"])("revalidates persisted preference %s against official roles", async (role) => {
    sessionStorage.setItem(ACTIVE_ROLE_KEY, JSON.stringify({ subject: multi.subject, role }));
    mount();
    if (role === "Budgets") expect(await screen.findByText("Área: Budgets")).toBeInTheDocument();
    else {
      await screen.findByText("Selecciona el área con la que vas a trabajar");
      expect(sessionStorage.getItem(ACTIVE_ROLE_KEY)).toBeNull();
    }
  });
  it("discards a preference belonging to another subject", async () => {
    sessionStorage.setItem(ACTIVE_ROLE_KEY, JSON.stringify({ subject: "previous-account", role: "Management" }));
    mount(); await screen.findByText("Selecciona el área con la que vas a trabajar");
    expect(sessionStorage.getItem(ACTIVE_ROLE_KEY)).toBeNull();
  });
  it.each([["SuperAdmin"], [1], ["Budgets", "Budgets"], null])("rejects malformed role contract %j", roles => {
    expect(isCurrentUser({ ...user, roles })).toBe(false);
  });
  it("same Subject sees only its selected workflow controls and preserves project responsibility", async () => {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    let commercial = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/me") return Response.json(multi);
      const role = new Headers(init?.headers).get("X-SnG-Active-Role");
      expect(multi.roles).toContain(role);
      if (url.endsWith("/tasks")) return Response.json(commercial ? [
        { ...inProgressTask, status: "Completed", assignedToGoogleSubject: user.subject },
        { ...inProgressTask, id: "review-task", area: "Commercial", type: "ReviewQuotation", assignedToGoogleSubject: user.subject },
      ] : [{ ...task, assignedToGoogleSubject: user.subject }]);
      if (url.endsWith("/documents")) return Response.json(projectDocuments);
      if (url.endsWith("/notifications")) return Response.json([]);
      if (url.includes("/clients/")) return Response.json(client);
      return Response.json({ ...project, sgCode: commercial ? "SG001" : null });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthProvider><AppShell><ProjectDetailPage id={project.id} /></AppShell></AuthProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Asesor Comercial" }));
    expect(await screen.findByRole("button", { name: "Enviar a Presupuestos" })).toBeEnabled();
    expect(screen.queryByLabelText("Código SG")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Trabajando como"), "Budgets");
    expect(await screen.findByLabelText("Código SG")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Enviar a Presupuestos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Seleccionar archivos" })).not.toBeInTheDocument();
    commercial = true;
    await userEvent.selectOptions(screen.getByLabelText("Trabajando como"), "CommercialHead");
    expect(await screen.findByLabelText("Seleccionar XLSX comercial")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Seleccionar archivos" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Código SG")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Cotización de Presupuestos" })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Trabajando como"), "Management");
    await screen.findByRole("heading", { name: project.name });
    const documents = await screen.findByRole("region", { name: "Documentos del proyecto" });
    expect(within(documents).queryByRole("button", { name: "Seleccionar archivos" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Seleccionar XLSX comercial")).not.toBeInTheDocument();
    expect(screen.getAllByText(user.name!).length).toBeGreaterThan(0);
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBe(token);
    await act(async () => {});
  });
});
