import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, SESSION_TOKEN_KEY, ACTIVE_ROLE_KEY } from "@/features/auth/context/AuthProvider";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { UserIdentityCard } from "@/features/auth/components/UserIdentityCard";
import { token, user } from "./fixtures";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
const fetchMock = vi.fn<typeof fetch>();

function Consumer() {
  const auth = useAuth();
  return <>
    <p data-testid="status">{auth.status}</p>
    {auth.error && <p role="alert">{auth.error}</p>}
    {auth.user && <UserIdentityCard user={auth.user} />}
    <button onClick={() => void auth.signIn(token)}>Entrar</button>
    <button onClick={auth.logout}>Salir</button>
  </>;
}

function mount() {
  return render(<StrictMode><AuthProvider><Consumer /></AuthProvider></StrictMode>);
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => Response.json(user));
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.clear();
});

describe("AuthProvider", () => {
  it("starts unauthenticated without calling the backend if there is no token", async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("persists the token and non-authoritative area preference without rendering the token", async () => {
    mount();
    await userEvent.click(screen.getByText("Entrar"));
    expect(await screen.findByText(user.subject)).toBeInTheDocument();
    expect(screen.getByTestId("status").textContent).toBe("authenticated");
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBe(token);
    expect(sessionStorage.length).toBe(2);
    expect(JSON.parse(sessionStorage.getItem(ACTIVE_ROLE_KEY)!)).toEqual({ subject: user.subject, role: "CommercialAdvisor" });
    expect(document.body).not.toHaveTextContent(token);
  });

  it("does not persist a token before backend validation finishes", async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise((done) => { resolve = done; }));
    mount();
    await userEvent.click(screen.getByText("Entrar"));
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    expect(screen.getByTestId("status").textContent).toBe("loading");
    await act(async () => resolve(Response.json(user)));
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBe(token);
  });

  it.each([401, 503])("failed login (%s) clears state and does not save the token", async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    mount();
    await userEvent.click(screen.getByText("Entrar"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    expect(screen.getByTestId("status").textContent).toBe("unauthenticated");
    expect(screen.queryByText(user.subject)).not.toBeInTheDocument();
  });

  it("restores a session only after revalidation", async () => {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    mount();
    expect(screen.getByTestId("status").textContent).toBe("loading");
    expect(await screen.findByText(user.subject)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", expect.objectContaining({ headers: { Authorization: `Bearer ${token}` } }));
  });

  it.each([401, 503])("restoration failure (%s) removes the token and displays an error", async (status) => {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    fetchMock.mockResolvedValue(new Response(null, { status }));
    mount();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    expect(screen.getByTestId("status").textContent).toBe("unauthenticated");
  });

  it("logout removes token and identity, redirects, and does not call the backend", async () => {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    mount();
    await screen.findByText(user.subject);
    await userEvent.click(screen.getByText("Salir"));
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    expect(screen.queryByText(user.subject)).not.toBeInTheDocument();
    expect(screen.getByTestId("status").textContent).toBe("unauthenticated");
    expect(replace).toHaveBeenCalledWith("/login");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a late login response after logout", async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise((done) => { resolve = done; }));
    mount();
    await userEvent.click(screen.getByText("Entrar"));
    await userEvent.click(screen.getByText("Salir"));
    await act(async () => resolve(Response.json(user)));
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    expect(screen.getByTestId("status").textContent).toBe("unauthenticated");
  });

  it("never accesses localStorage through login, restoration or logout", async () => {
    const local = vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("forbidden"); });
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    mount();
    await screen.findByText(user.subject);
    await userEvent.click(screen.getByText("Salir"));
    await userEvent.click(screen.getByText("Entrar"));
    await screen.findByText(user.subject);
    expect(local).not.toHaveBeenCalled();
  });

  it("fails explicitly when sessionStorage cannot persist the validated token", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
    mount();
    await userEvent.click(screen.getByText("Entrar"));
    expect(await screen.findByRole("alert")).toHaveTextContent("almacenamiento");
    expect(screen.getByTestId("status").textContent).toBe("unauthenticated");
    expect(screen.queryByText(user.subject)).not.toBeInTheDocument();
  });
});
