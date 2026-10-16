import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClientsPage } from "@/features/clients/ClientsPage";
import { ProjectsPage } from "@/features/projects/ProjectsPage";
import { NewProjectPage } from "@/features/projects/NewProjectPage";
import { ProjectDetailPage } from "@/features/projects/ProjectDetailPage";
import { client, project, task, inProgressTask, mockBackend, renderOperational } from "./operationalFixtures";
import { handedOffDocuments, projectDocuments } from "./documentFixtures";
import { manager } from "./managementFixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("management read-only UX", () => {
  it("lists clients without offering creation", async () => {
    mockBackend(() => [client]);
    renderOperational(<ClientsPage />, manager);
    await screen.findByText(client.name);
    expect(screen.queryByRole("button", { name: "Crear cliente" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Nombre del cliente/)).not.toBeInTheDocument();
  });
  it("lists projects and links to their detail without offering creation", async () => {
    mockBackend((path) => path === "projects" ? [project] : [client]);
    renderOperational(<ProjectsPage />, manager);
    expect(await screen.findByRole("link", { name: project.name })).toHaveAttribute("href", "/projects/project-1");
    expect(screen.queryByRole("link", { name: "Crear proyecto" })).not.toBeInTheDocument();
  });
  it("does not offer the creation form at its direct URL", () => {
    const fetchMock = mockBackend(() => [client]);
    renderOperational(<NewProjectPage />, manager);
    expect(screen.queryByRole("button", { name: "Crear proyecto" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver proyectos" })).toHaveAttribute("href", "/projects");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([task, inProgressTask])("does not grant SG or document writes for management alone ($status)", async (preparation) => {
    mockBackend((path) => {
      if (path.endsWith("/documents")) return { ...handedOffDocuments, canModify: false, canRemove: false, canSendToBudgets: false };
      if (path.endsWith("/tasks")) return [preparation];
      if (path.endsWith("/notifications")) return [];
      if (path.startsWith("clients/")) return client;
      return { ...project, sgCode: preparation.status === "InProgress" ? "SG001" : null };
    });
    renderOperational(<ProjectDetailPage id="project-1" />, manager);
    await screen.findByRole("heading", { name: project.name });
    await screen.findByRole("heading", { name: "Documentos vigentes" });
    for (const name of ["Asignar SG", "Guardar corrección", "Enviar a Presupuestos", "Subir documentos", "Seleccionar archivos", "Reemplazar", "Quitar"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Código SG")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Corregir SG" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descargar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Descargar documentos del envío inicial" })).toBeEnabled();
    if (preparation.status === "InProgress") expect(screen.getByText("SG001")).toBeInTheDocument();
  });
  it.each([task, inProgressTask])("preserves actual SG assignment capabilities alongside management ($status)", async (preparation) => {
    mockBackend((path) => {
      if (path.endsWith("/documents")) return { ...handedOffDocuments, canModify: false };
      if (path.endsWith("/tasks")) return [preparation];
      if (path.endsWith("/notifications")) return [];
      if (path.startsWith("clients/")) return client;
      return { ...project, sgCode: preparation.status === "InProgress" ? "SG001" : null };
    });
    renderOperational(<ProjectDetailPage id="project-1" />, { ...manager, subject: task.assignedToGoogleSubject! });
    expect(await screen.findByLabelText("Código SG")).toBeEnabled();
    expect(screen.getByRole("button", { name: preparation.status === "Pending" ? "Asignar SG" : "Guardar corrección" })).toBeInTheDocument();
  });
  it("preserves backend document and handoff capabilities alongside management", async () => {
    mockBackend((path) => {
      if (path.endsWith("/documents")) return projectDocuments;
      if (path.endsWith("/tasks") || path.endsWith("/notifications")) return [];
      if (path.startsWith("clients/")) return client;
      return project;
    });
    renderOperational(<ProjectDetailPage id="project-1" />, manager);
    const documents = await screen.findByRole("region", { name: "Documentos del proyecto" });
    expect(await within(documents).findByRole("button", { name: "Seleccionar archivos" })).toBeEnabled();
    expect(within(documents).getByRole("button", { name: "Reemplazar" })).toBeEnabled();
    expect(within(documents).getByRole("button", { name: "Quitar" })).toBeEnabled();
    expect(await screen.findByRole("button", { name: "Enviar a Presupuestos" })).toBeEnabled();
  });
});
