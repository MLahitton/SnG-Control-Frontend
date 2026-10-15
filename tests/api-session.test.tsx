import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider, SESSION_TOKEN_KEY } from "@/features/auth/context/AuthProvider";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { token, user } from "./fixtures";

const { router } = vi.hoisted(() => ({ router: { replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

function Consumer() {
  const { user, status, signIn } = useAuth();
  const api = useApiClient();
  return <>
    <p data-testid="status">{status}</p>
    {user && <p>{user.subject}</p>}
    <button onClick={() => void Promise.allSettled([api.get("projects"), api.get("clients")])}>Solicitar</button>
    <button onClick={() => void signIn("next-test-token")}>Nueva sesión</button>
  </>;
}

describe("API and AuthProvider integration", () => {
  it("clears token and user globally and redirects once for concurrent 401s", async () => {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (path: string) => path === "/api/auth/me"
      ? Response.json(user) : new Response(null, { status: 401 })));
    render(<AuthProvider><Consumer /></AuthProvider>);
    await screen.findByText(user.subject);
    await userEvent.click(screen.getByText("Solicitar"));
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    expect(screen.queryByText(user.subject)).not.toBeInTheDocument();
    expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
    expect(router.replace).toHaveBeenCalledExactlyOnceWith("/login");
  });

  it.each([403, 409, 503])("does not clear a valid session on business API status %s", async (status) => {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (path: string) => path === "/api/auth/me"
      ? Response.json(user) : new Response(null, { status })));
    render(<AuthProvider><Consumer /></AuthProvider>);
    await screen.findByText(user.subject);
    await userEvent.click(screen.getByText("Solicitar"));
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBe(token);
    expect(screen.getByTestId("status").textContent).toBe("authenticated");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("ignores old-session 401s after a new login completes", async () => {
    const pending: ((response: Response) => void)[] = [];
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    vi.stubGlobal("fetch", vi.fn().mockImplementation((path: string) => path === "/api/auth/me"
      ? Promise.resolve(Response.json(user))
      : new Promise<Response>((resolve) => pending.push(resolve))));
    render(<AuthProvider><Consumer /></AuthProvider>);
    await screen.findByText(user.subject);
    await userEvent.click(screen.getByText("Solicitar"));
    await userEvent.click(screen.getByText("Nueva sesión"));
    await act(async () => pending.forEach((resolve) => resolve(new Response(null, { status: 401 }))));
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBe("next-test-token");
    expect(screen.getByTestId("status").textContent).toBe("authenticated");
    expect(router.replace).not.toHaveBeenCalled();
  });
});
