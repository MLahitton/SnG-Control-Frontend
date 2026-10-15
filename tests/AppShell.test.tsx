import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, AuthProvider, SESSION_TOKEN_KEY } from "@/features/auth/context/AuthProvider";
import { AppShell } from "@/features/shell/components/AppShell";
import { testApiClient, token, user } from "./fixtures";

const { router } = vi.hoisted(() => ({ router: { replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/" }));
const context = {
  status: "authenticated" as const, user, error: null,
  signIn: vi.fn(), logout: vi.fn(), invalidateSession: vi.fn(), apiClient: testApiClient,
};

describe("operational shell", () => {
  it("redirects unauthenticated users without revealing protected content", () => {
    render(<AuthContext.Provider value={{ ...context, status: "unauthenticated", user: null }}><AppShell>Contenido protegido</AppShell></AuthContext.Provider>);
    expect(router.replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("Contenido protegido")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("keeps content and identity hidden during loading", () => {
    render(<AuthContext.Provider value={{ ...context, status: "loading", user: null }}><AppShell>Contenido protegido</AppShell></AuthContext.Provider>);
    expect(screen.getByRole("status")).toHaveTextContent("Validando sesión");
    expect(screen.queryByText("Contenido protegido")).not.toBeInTheDocument();
    expect(screen.queryByText(user.name!)).not.toBeInTheDocument();
  });

  it("shows identity and only a real Inicio navigation link", () => {
    render(<AuthContext.Provider value={context}><AppShell><h1>Inicio</h1></AppShell></AuthContext.Provider>);
    expect(screen.getByRole("main")).toHaveTextContent("Inicio");
    expect(screen.getByText(user.name!)).toBeInTheDocument();
    expect(screen.getByText(user.email!)).toBeInTheDocument();
    const links = within(screen.getByRole("navigation", { name: "Principal" })).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/");
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Saltar al contenido" })).toHaveAttribute("href", "#main-content");
  });

  it("has a keyboard-operable mobile menu controlling the same navigation", async () => {
    render(<AuthContext.Provider value={context}><AppShell>Contenido protegido</AppShell></AuthContext.Provider>);
    const button = screen.getByRole("button", { name: "Abrir menú" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(button.getAttribute("aria-controls")!)).toContainElement(screen.getByRole("navigation"));
    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Cerrar menú" })).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(screen.getByRole("link", { name: "Inicio" }));
    expect(screen.getByRole("button", { name: "Abrir menú" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("logs out through the real provider, clears identity/storage, and redirects", async () => {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(user)));
    render(<AuthProvider><AppShell>Contenido protegido</AppShell></AuthProvider>);
    await screen.findByText(user.email!);
    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    expect(screen.queryByText(user.email!)).not.toBeInTheDocument();
    expect(screen.queryByText("Contenido protegido")).not.toBeInTheDocument();
    expect(router.replace).toHaveBeenCalledWith("/login");
  });
});
