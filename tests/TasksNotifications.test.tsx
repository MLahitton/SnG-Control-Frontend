import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TasksPage } from "@/features/tasks/TasksPage";
import { TaskList, TaskTimingStatus } from "@/features/tasks/TaskList";
import type { LeakTimeStatus } from "@/features/tasks/types";
import { NotificationsPage } from "@/features/notifications/NotificationsPage";
import { formatDate } from "@/lib/formatDate";
import { project, task, notification, deferred, mockBackend, renderOperational } from "./operationalFixtures";

describe("Tasks", () => {
  it("sends both explicit filters, resolves project names once and never requests individual projects", async () => {
    const fetchMock = mockBackend((path) => path === "projects" ? [project] : [task, { ...task, id: "task-2" }]);
    renderOperational(<TasksPage />);
    expect(await screen.findAllByRole("link", { name: project.name })).toHaveLength(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/backend/project-tasks?area=Commercial&status=Pending");
    await userEvent.selectOptions(screen.getByLabelText("Área"), "Budgets");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/backend/project-tasks?area=Budgets&status=Pending", expect.anything()));
    await userEvent.selectOptions(screen.getByLabelText("Estado"), "InProgress");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/backend/project-tasks?area=Budgets&status=InProgress", expect.anything()));
    await userEvent.selectOptions(screen.getByLabelText("Estado"), "Completed");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/backend/project-tasks?area=Budgets&status=Completed", expect.anything()));
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/projects"))).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/projects/"))).toBe(false);
  });
  it("discards a late response from the previous filter", async () => {
    const old = deferred<unknown>();
    mockBackend((path) => path === "projects" ? [project] : path.includes("area=Commercial") ? old.promise : []);
    renderOperational(<TasksPage />);
    await userEvent.selectOptions(screen.getByLabelText("Área"), "Budgets");
    expect(await screen.findByText("No hay tareas para mostrar.")).toBeInTheDocument();
    await act(async () => old.resolve([task]));
    expect(screen.queryByText("Preparar cotización")).not.toBeInTheDocument();
  });
  it.each<[LeakTimeStatus, string]>([
    ["NotStarted", "Sin iniciar"], ["OnTrack", "En tiempo"], ["DueSoon", "Vence pronto"], ["DueToday", "Vence hoy"],
    ["Overdue", "Atrasada"], ["CompletedOnTime", "Completada a tiempo"], ["CompletedLate", "Completada con retraso"], ["UntrackedLegacy", "Sin seguimiento histórico"],
  ])("presents %s exactly from backend", (leakTimeStatus, label) => {
    render(<TaskTimingStatus task={{ ...task, leakTimeStatus, deadlineAt: "2020-01-01T22:00:00Z" }} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
  it("shows no invented deadline when preparation has not started", () => {
    render(<TaskTimingStatus task={task} />);
    expect(screen.getByText("Vence: Sin fecha asignada")).toBeInTheDocument();
    expect(screen.getByText("El plazo comienza al asignar el SG.")).toBeInTheDocument();
  });
  it("renders supported task types, states and historical overdue evidence", () => {
    render(<TaskList tasks={[
      task, { ...task, id: "2", type: "ReviewQuotation", status: "InProgress", area: "Commercial" },
      { ...task, id: "3", type: "PresentQuotationToClient", status: "Completed", wasOverdue: true },
    ]} />);
    for (const label of ["Preparar cotización", "Revisar cotización", "Presentar cotización al cliente", "Pendiente", "En curso", "Completada", "Área: Comercial", "Registró atraso."]) expect(screen.getByText(label)).toBeInTheDocument();
  });
  it("formats date and hour in Colombia regardless of the browser timezone", () => {
    expect(formatDate("2026-10-21T02:00:00Z")).toMatch(/20\/10\/2026.*9:00/);
    expect(formatDate(null)).toBe("Sin fecha");
  });
  it("shows safe load errors and allows retry", async () => {
    mockBackend((path) => path === "projects" ? [project] : Response.json({}, { status: 403 }));
    renderOperational(<TasksPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes permiso");
  });
});

describe("Notifications", () => {
  it("requests personal notifications without query params and keeps all history states", async () => {
    const fetchMock = mockBackend(() => [
      notification,
      { ...notification, id: "2", title: "Atraso actual", kind: "Overdue", state: "Active", deadlineAt: "2026-10-20T22:00:00Z" },
      { ...notification, id: "3", title: "Atraso anterior", kind: "Overdue", state: "Resolved", resolvedAt: "2026-10-21T15:00:00Z" },
    ]);
    renderOperational(<NotificationsPage />);
    await screen.findByText(notification.title);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/notifications");
    for (const label of ["Informativa", "Activa", "Resuelta", "Alerta de atraso activa", "Historial de atraso", "Atraso anterior"]) expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getAllByText(notification.message)).toHaveLength(3);
    for (const link of screen.getAllByRole("link", { name: "Abrir proyecto" })) expect(link).toHaveAttribute("href", "/projects/project-1");
    expect(screen.getByText(/Vence:.*20\/10\/2026/)).toBeInTheDocument();
    expect(screen.queryByText(/private-recipient|leído|unread|dismiss/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("shows empty personal notifications", async () => {
    mockBackend(() => []); renderOperational(<NotificationsPage />);
    expect(await screen.findByText("No hay notificaciones para mostrar.")).toBeInTheDocument();
  });
  it("shows safe failures without leaking raw errors", async () => {
    mockBackend(() => { throw new Error("secret backend URL"); });
    renderOperational(<NotificationsPage />);
    await screen.findByRole("alert");
    expect(screen.queryByText(/secret backend/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver a cargar" })).toBeInTheDocument();
  });
});
