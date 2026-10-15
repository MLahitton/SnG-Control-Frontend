import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClientsPage } from "@/features/clients/ClientsPage";
import { ProjectsPage } from "@/features/projects/ProjectsPage";
import { NewProjectPage } from "@/features/projects/NewProjectPage";
import { productLines } from "@/features/projects/types";
import { client, project, deferred, mockBackend, renderOperational } from "./operationalFixtures";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("Clients", () => {
  it("loads and lists backend clients", async () => {
    mockBackend(() => [client]);
    renderOperational(<ClientsPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando clientes");
    expect(await screen.findByText(client.name)).toBeInTheDocument();
  });
  it("shows an empty list and blocks blank names", async () => {
    const fetchMock = mockBackend(() => []);
    renderOperational(<ClientsPage />);
    expect(await screen.findByText(/Todavía no hay clientes/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Nombre del cliente/), "   ");
    expect(screen.getByRole("button", { name: "Crear cliente" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("creates a duplicate name, prevents duplicate submissions and reloads canonical data", async () => {
    const pending = deferred<unknown>();
    let created = false;
    const fetchMock = mockBackend((path, init) => {
      if (init.method === "POST") { expect(path).toBe("clients"); expect(JSON.parse(init.body as string)).toEqual({ name: client.name }); return pending.promise; }
      return created ? [client, { ...client, id: "client-2" }] : [client];
    });
    renderOperational(<ClientsPage />);
    await screen.findByText(client.name);
    await userEvent.type(screen.getByLabelText(/Nombre del cliente/), ` ${client.name} `);
    const form = screen.getByRole("button", { name: "Crear cliente" }).closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(screen.getByRole("button", { name: "Creando…" })).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
    created = true;
    await act(async () => pending.resolve({ ...client, id: "client-2" }));
    expect(await screen.findByText("Cliente creado.")).toBeInTheDocument();
    expect(await screen.findAllByText(client.name)).toHaveLength(2);
    expect(screen.getByLabelText(/Nombre del cliente/)).toHaveValue("");
  });
  it("shows a safe create failure and allows a new explicit attempt", async () => {
    mockBackend((_, init) => init.method === "POST" ? Response.json({ detail: "secret-path" }, { status: 403 }) : []);
    renderOperational(<ClientsPage />);
    await screen.findByText(/Todavía no hay clientes/);
    await userEvent.type(screen.getByLabelText(/Nombre del cliente/), "Cliente");
    await userEvent.click(screen.getByRole("button", { name: "Crear cliente" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes permiso");
    expect(screen.getByRole("button", { name: "Crear cliente" })).toBeEnabled();
    expect(screen.queryByText(/secret-path/)).not.toBeInTheDocument();
  });
  it("can retry a failed list without repeating a mutation", async () => {
    let fail = true;
    const fetchMock = mockBackend(() => fail ? Response.json({}, { status: 503 }) : [client]);
    renderOperational(<ClientsPage />);
    await screen.findByRole("alert"); fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Volver a cargar" }));
    await screen.findByText(client.name);
    expect(fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });
});

describe("Projects", () => {
  it("lists projects with their clients, SG and detail links", async () => {
    mockBackend((path) => path === "clients" ? [client] : [{ ...project, sgCode: "SG001" }]);
    renderOperational(<ProjectsPage />);
    expect(await screen.findByRole("link", { name: project.name })).toHaveAttribute("href", "/projects/project-1");
    for (const value of [client.name, project.city, project.productLine, "SG001"]) expect(screen.getByText(value)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Creación" })).toBeInTheDocument();
  });
  it("has an empty projects state", async () => {
    mockBackend(() => []); renderOperational(<ProjectsPage />);
    expect(await screen.findByText("Todavía no hay proyectos.")).toBeInTheDocument();
  });
  it("requires an existing client with a link to create one", async () => {
    mockBackend(() => []); renderOperational(<NewProjectPage />);
    await screen.findByText(/Primero debes crear un cliente/);
    expect(screen.getByRole("link", { name: "Crear cliente" })).toHaveAttribute("href", "/clients");
    expect(screen.queryByRole("button", { name: "Crear proyecto" })).not.toBeInTheDocument();
  });
  it.each(productLines)("creates %s using only supported fields and navigates to its detail", async (line) => {
    const fetchMock = mockBackend((path, init) => {
      if (init.method === "POST") { expect(path).toBe("projects"); return project; }
      expect(path).toBe("clients"); return [client, { ...client, id: "client-2", name: "Otro cliente" }];
    });
    renderOperational(<NewProjectPage />);
    await screen.findByLabelText("Cliente *");
    expect(within(screen.getByLabelText("Cliente *")).getAllByRole("option")).toHaveLength(3);
    await userEvent.selectOptions(screen.getByLabelText("Cliente *"), "client-2");
    await userEvent.type(screen.getByLabelText(/Nombre del proyecto/), project.name);
    await userEvent.type(screen.getByLabelText("Ciudad *"), " Bogotá ");
    await userEvent.selectOptions(screen.getByLabelText(/Línea de producto/), line);
    await userEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/projects/project-1"));
    const [, init] = fetchMock.mock.calls.find(([, init]) => init.method === "POST")!;
    expect(JSON.parse(init.body as string)).toEqual({ clientId: "client-2", name: project.name, city: "Bogotá", productLine: line });
    expect(fetchMock.mock.calls.filter(([url, options]) => url.endsWith("/projects") && options.method === "GET")).toHaveLength(0);
  });
  it("does not check duplicate project names and locks submission until navigation", async () => {
    const pending = deferred<unknown>();
    const fetchMock = mockBackend((_, init) => init.method === "POST" ? pending.promise : [client]);
    renderOperational(<NewProjectPage />);
    await screen.findByLabelText("Cliente *");
    await userEvent.selectOptions(screen.getByLabelText("Cliente *"), client.id);
    await userEvent.type(screen.getByLabelText(/Nombre del proyecto/), project.name);
    await userEvent.type(screen.getByLabelText("Ciudad *"), project.city);
    const form = screen.getByRole("button", { name: "Crear proyecto" }).closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(fetchMock.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
    await act(async () => pending.resolve(project));
    expect(push).toHaveBeenCalledWith("/projects/project-1");
    expect(screen.getByRole("button", { name: "Creando proyecto…" })).toBeDisabled();
  });
});
