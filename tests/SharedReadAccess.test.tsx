import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClientsPage } from "@/features/clients/ClientsPage";
import { ClientDetailPage } from "@/features/clients/ClientDetailPage";
import { ProjectsPage } from "@/features/projects/ProjectsPage";
import { AppShell } from "@/features/shell/components/AppShell";
import Home from "@/app/(app)/page";
import { client, project, mockBackend, renderOperational } from "./operationalFixtures";
import { user } from "./fixtures";
import type { AvailableRole } from "@/features/auth/types/auth";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/" }));
const roles: AvailableRole[] = ["CommercialAdvisor", "Budgets", "CommercialHead", "Management"];
const identity = (role: AvailableRole) => ({ ...user, roles: [role], isManagement: role === "Management" });

describe("shared context by active area", () => {
  it.each(roles)("%s has direct context navigation and area shortcuts", (role) => {
    renderOperational(<AppShell><Home /></AppShell>, identity(role));
    const nav = within(screen.getByRole("navigation", { name: "Principal" }));
    expect(nav.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(role === "Management"
      ? ["/management", "/management/tasks", "/clients", "/projects"]
      : ["/", "/clients", "/projects", "/tasks", "/notifications"]);
    expect(within(screen.getByRole("main")).getByRole("link", { name: /Clientes/ })).toHaveAttribute("href", "/clients");
    expect(within(screen.getByRole("main")).getByRole("link", { name: /Proyectos/ })).toHaveAttribute("href", "/projects");
    if (role === "Management") expect(screen.getByRole("button", { name: "Abrir SnG Intelligence" })).toBeInTheDocument();
  });
  it.each(roles)("%s lists clients with a detail link and only Advisor creation", async (role) => {
    mockBackend(() => [client]); renderOperational(<ClientsPage />, identity(role));
    expect(await screen.findByRole("link", { name: client.name })).toHaveAttribute("href", `/clients/${client.id}`);
    expect(!!screen.queryByRole("button", { name: "Crear cliente" })).toBe(role === "CommercialAdvisor");
  });
  it.each(roles)("%s lists accessible projects with only Advisor creation", async (role) => {
    mockBackend(path => path === "clients" ? [client] : [project]); renderOperational(<ProjectsPage />, identity(role));
    expect(await screen.findByRole("link", { name: project.name })).toHaveAttribute("href", `/projects/${project.id}`);
    expect(!!screen.queryByRole("link", { name: "Crear proyecto" })).toBe(role === "CommercialAdvisor");
  });
  it.each([["Budgets", "Presupuestos"], ["CommercialHead", "Jefatura Comercial"]] as const)("%s shows an ordinary empty scope", async (role, area) => {
    mockBackend(() => []); renderOperational(<ProjectsPage />, identity(role));
    expect(await screen.findByText(`No tienes proyectos disponibles en ${area}.`)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it.each(roles)("%s can open a read-only client with related accessible projects", async role => {
    const fetch = mockBackend(path => path === `clients/${client.id}` ? client : [project, { ...project, id: "unrelated", clientId: "other", name: "Other client project" }]);
    renderOperational(<ClientDetailPage id={client.id} />, identity(role));
    expect(await screen.findByRole("heading", { name: client.name })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: project.name })).toHaveAttribute("href", `/projects/${project.id}`);
    expect(screen.queryByText("Other client project")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Crear|Editar|Eliminar/ })).not.toBeInTheDocument();
    expect(fetch.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });
  it("does not load projects when a direct client URL is forbidden", async () => {
    const fetch = mockBackend(() => Response.json({}, { status: 404 }));
    renderOperational(<ClientDetailPage id="unavailable" />, identity("Budgets"));
    await screen.findByRole("alert");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: client.name })).not.toBeInTheDocument();
  });
});
