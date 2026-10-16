import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectHeader } from "@/features/projects/ProjectHeader";
import { ProjectStatusStrip } from "@/features/projects/ProjectStatusStrip";
import Home from "@/app/(app)/page";
import { client, project, task, inProgressTask, renderOperational } from "./operationalFixtures";
import { formatDate } from "@/lib/formatDate";
import { TaskList } from "@/features/tasks/TaskList";
import userEvent from "@testing-library/user-event";

describe("project workspace presentation", () => {
  it("opens native compact task history and keeps backend dates accessible", async () => {
    render(<TaskList tasks={[inProgressTask]} compact />);
    const summary = screen.getByText("Fechas y seguimiento");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(summary.tagName).toBe("SUMMARY");
    await userEvent.click(summary);
    expect(summary.closest("details")).toHaveAttribute("open");
    expect(screen.getByText(`Vence: ${formatDate(inProgressTask.deadlineAt)}`)).toBeVisible();
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
    const strip = within(screen.getByRole("region", { name: "Estado actual del proyecto" }));
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
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/projects", "/clients", "/tasks", "/notifications"]);
    expect(screen.getByText("Identidad técnica de la sesión").closest("details")).not.toHaveAttribute("open");
  });
});
