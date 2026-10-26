import { roleContext } from "./roleFixtures";
import { StrictMode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "@/features/auth/context/AuthProvider";
import type { AuthStatus } from "@/features/auth/types/auth";
import LoginPage from "@/app/login/page";
import { testApiClient } from "./fixtures";

const { router } = vi.hoisted(() => ({ router: { replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

describe("installed Google integration lifecycle with mocked GSI boundary", () => {
  it("does not reload the SDK or reinitialize after failed session validation", () => {
    const initialize = vi.fn();
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "test-only-client-id");
    vi.stubGlobal("google", { accounts: { id: { initialize, renderButton: vi.fn(), cancel: vi.fn() } } });
    const context = {
      user: null, error: null, signIn: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn(), invalidateSession: vi.fn(), ...roleContext(), apiClient: testApiClient,
    };
    const view = (status: AuthStatus) => <StrictMode><AuthContext.Provider value={{ ...context, status }}><LoginPage /></AuthContext.Provider></StrictMode>;
    const { rerender } = render(view("unauthenticated"));
    const script = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]')!;
    expect(script).not.toBeNull();
    fireEvent.load(script);
    expect(initialize).toHaveBeenCalledTimes(1);
    rerender(view("loading"));
    expect(screen.getByRole("status")).toHaveTextContent("Validando sesión");
    rerender(view("unauthenticated"));
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('script[src="https://accounts.google.com/gsi/client"]')).toHaveLength(1);
    expect(document.querySelector('script[src="https://accounts.google.com/gsi/client"]')).toBe(script);
  });
});
