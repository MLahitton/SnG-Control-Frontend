import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "@/features/auth/context/AuthProvider";
import type { AvailableRole } from "@/features/auth/types/auth";
import { TasksPage } from "@/features/tasks/TasksPage";
import { createApiClient } from "@/lib/api/apiClient";
import { user, token } from "./fixtures";
import { roleContext } from "./roleFixtures";
import { deferred, mockBackend, project, task, renderOperational } from "./operationalFixtures";

const cases = [
  ["Budgets", "Budgets", "Pending", "Presupuestos", "No tienes tareas de Presupuestos en este estado."],
  ["CommercialHead", "Commercial", "InProgress", "Jefe Comercial", "No tienes revisiones comerciales en este estado."],
  ["CommercialAdvisor", "Commercial", "InProgress", "Asesor Comercial", "No tienes tareas comerciales en este estado."],
] as const;
describe("personal task inbox", () => {
  it.each(cases)("%s fixes the area, starts at the workflow status and allows completed history", async (role, area, status, label, empty) => {
    const fetch = mockBackend(() => []);
    renderOperational(<TasksPage />, { ...user, roles: [role] });
    expect(await screen.findByText(empty)).toBeInTheDocument();
    expect(screen.getByText(`Trabajo asignado a ${label}`)).toBeInTheDocument();
    expect(screen.queryByLabelText("Área")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Estado")).toHaveValue(status);
    expect(fetch).toHaveBeenCalledWith(`/api/backend/project-tasks?area=${area}&status=${status}`, expect.anything());
    for (const next of ["Pending", "InProgress", "Completed"]) {
      await userEvent.selectOptions(screen.getByLabelText("Estado"), next);
      await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/backend/project-tasks?area=${area}&status=${next}`, expect.anything()));
    }
  });
  it("does not query the personal inbox or project names for Management", () => {
    const fetch = mockBackend(() => []);
    renderOperational(<TasksPage />, { ...user, roles: ["Management"], isManagement: true });
    expect(screen.getByRole("link", { name: "Consultar operación de Gerencia" })).toHaveAttribute("href", "/management/tasks");
    expect(screen.queryByLabelText("Estado")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("same Subject resets status, aborts old requests and discards data when switching area", async () => {
    const old = deferred<unknown>();
    const fetch = mockBackend((path, init) => {
      if (path === "projects") return [project];
      const role = new Headers(init.headers).get("X-SnG-Active-Role");
      if (role === "Budgets") return path.includes("Completed") ? old.promise : [task];
      return [{ ...task, id: "head-task", type: "ReviewQuotation", area: "Commercial", status: "InProgress" }];
    });
    function context(role: AvailableRole) {
      return { status: "authenticated" as const, ...roleContext(role), user: { ...user, roles: ["Budgets", "CommercialHead"] as AvailableRole[] }, error: null,
        signIn: vi.fn(), logout: vi.fn(), invalidateSession: vi.fn(),
        apiClient: createApiClient({ getSession: () => ({ token, generation: 1, activeRole: role }), invalidateSession: vi.fn() }) };
    }
    const view = render(<AuthContext.Provider value={context("Budgets")}><TasksPage /></AuthContext.Provider>);
    await screen.findByText("Preparar cotización");
    await userEvent.selectOptions(screen.getByLabelText("Estado"), "Completed");
    const signal = fetch.mock.calls.find(([path]) => path.includes("Completed"))![1].signal;
    view.rerender(<AuthContext.Provider value={context("CommercialHead")}><TasksPage /></AuthContext.Provider>);
    expect(signal?.aborted).toBe(true);
    expect(screen.getByLabelText("Estado")).toHaveValue("InProgress");
    await screen.findByText("Revisar cotización");
    expect(fetch).toHaveBeenCalledWith("/api/backend/project-tasks?area=Commercial&status=InProgress", expect.anything());
    await act(async () => old.resolve([{ ...task, status: "Completed" }]));
    expect(screen.queryByText("Preparar cotización")).not.toBeInTheDocument();
    expect(screen.getByText("Revisar cotización")).toBeInTheDocument();
  });
});
