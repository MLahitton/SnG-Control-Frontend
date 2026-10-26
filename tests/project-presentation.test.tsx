import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectHeader } from "@/features/projects/ProjectHeader";
import { ProjectStatusStrip } from "@/features/projects/ProjectStatusStrip";
import Home from "@/app/(app)/page";
import { client, project, task, inProgressTask, notification, renderOperational } from "./operationalFixtures";
import { formatDate } from "@/lib/formatDate";
import { TaskList } from "@/features/tasks/TaskList";
import { NotificationList } from "@/features/notifications/NotificationList";

describe("project workspace presentation", () => {
  it("shows compact task information and backend dates directly without cards", () => {
    const { container } = render(<TaskList tasks={[inProgressTask, { ...task, id: "completed-task", status: "Completed", completedAt: "2026-10-17T15:00:00Z", wasOverdue: true }]} compact />);
    expect(screen.getByText("En curso")).toBeVisible();
    expect(screen.getByText("En tiempo")).toBeVisible();
    expect(screen.getByText("Completada")).toBeVisible();
    expect(screen.getByText("Registró atraso.")).toBeVisible();
    expect(screen.getAllByText("Área: Presupuestos")).toHaveLength(2);
    expect(screen.getByText(`Vence: ${formatDate(inProgressTask.deadlineAt)}`)).toBeVisible();
    expect(container).toHaveTextContent(formatDate(inProgressTask.startedAt));
    expect(container).toHaveTextContent(formatDate(task.assignedAt));
    expect(container).toHaveTextContent(formatDate("2026-10-17T15:00:00Z"));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(container.querySelector(".panel")).toBeNull();
  });
  it("keeps activity titles, messages, dates and states in a semantic timeline", () => {
    const { container } = render(<NotificationList variant="activity" notifications={[
      { ...notification, kind: "ProjectDocumentsUpdated", title: "Documentación actualizada" },
      { ...notification, id: "overdue", title: "Atraso actual", state: "Active", kind: "Overdue", deadlineAt: "2026-10-20T22:00:00Z" },
      { ...notification, id: "resolved", title: "Atraso resuelto", state: "Resolved", kind: "Overdue", resolvedAt: "2026-10-21T15:00:00Z" },
    ]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    for (const title of ["Documentación actualizada", "Atraso actual", "Atraso resuelto"]) expect(screen.getByRole("heading", { name: title })).toBeVisible();
    expect(screen.getAllByText(notification.message)).toHaveLength(3);
    for (const state of ["Informativa", "Activa", "Resuelta", "Alerta de atraso activa", "Historial de atraso"]) expect(screen.getByText(state)).toBeVisible();
    expect(container.querySelectorAll("time")).toHaveLength(3);
    expect(container).toHaveTextContent(formatDate("2026-10-20T22:00:00Z"));
    expect(container).toHaveTextContent(formatDate("2026-10-21T15:00:00Z"));
    expect(container.querySelector(".panel")).toBeNull();
  });
  it("presents project identity as a single heading with context and safe SG", () => {
    const { container } = render(<ProjectHeader project={{ ...project, sgCode: "SG007" }} clientName={client.name} />);
    expect(screen.getByRole("heading", { level: 1, name: project.name })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const text of [client.name, project.productLine, "SG007", "Responsable comercial"]) expect(screen.getByText(text)).toBeInTheDocument();
    expect(container).toHaveTextContent(project.city);
    expect(container).not.toHaveTextContent(project.createdBy!.subject);
  });
  it("handles absent SG and creator without inventing identity", () => {
    render(<ProjectHeader project={{ ...project, sgCode: null, createdBy: null }} clientName={client.name} />);
    expect(screen.getByText("Sin SG")).toBeInTheDocument();
    expect(screen.getByText("No disponible")).toBeInTheDocument();
  });
  it("summarizes the in-progress task using backend timing even for a past deadline", () => {
    const active = { ...inProgressTask, deadlineAt: "2020-01-01T22:00:00Z" };
    render(<ProjectStatusStrip tasks={[{ ...task, id: "completed", status: "Completed" }, task, active]} />);
    const region = screen.getByRole("region", { name: "Estado actual del proyecto" });
    expect(region).not.toHaveClass("panel");
    const strip = within(region);
    expect(strip.getByText("En curso")).toBeInTheDocument();
    expect(strip.getByText("En tiempo")).toBeInTheDocument();
    expect(strip.getByText(`Vence: ${formatDate(active.deadlineAt)}`)).toBeInTheDocument();
    expect(strip.queryByText("Atrasada")).not.toBeInTheDocument();
  });
  it("shows documentary preparation without a task or invented deadline", () => {
    render(<ProjectStatusStrip tasks={[]} />);
    expect(screen.getByRole("heading", { name: "Preparación documental", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Sin tareas asignadas")).toBeInTheDocument();
    expect(screen.queryByText(/Vence:/)).not.toBeInTheDocument();
  });
  it("offers the four real home shortcuts and secondary technical identity", () => {
    renderOperational(<Home />);
    expect(screen.getByRole("heading", { name: "SnG Control", level: 1 })).toBeInTheDocument();
    const links = within(screen.getByRole("navigation", { name: "Accesos rápidos" })).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/clients", "/projects", "/tasks", "/notifications"]);
    expect(screen.getByText("Identidad técnica de la sesión").closest("details")).not.toHaveAttribute("open");
  });
});
