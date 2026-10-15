import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "@/features/auth/context/AuthProvider";
import { GoogleSignInButton } from "@/features/auth/components/GoogleSignInButton";
import { token, testApiClient } from "./fixtures";

vi.mock("@react-oauth/google", () => ({
  GoogleOAuthProvider: ({ children, onScriptLoadError }: { children: ReactNode; onScriptLoadError: () => void }) =>
    <div>{children}<button onClick={onScriptLoadError}>Falla script</button></div>,
  GoogleLogin: ({ onSuccess, onError }: { onSuccess: (response: { credential?: string }) => void; onError: () => void }) => <>
    <button onClick={() => onSuccess({ credential: token })}>Google mock</button>
    <button onClick={() => onSuccess({})}>Sin credential</button>
    <button onClick={onError}>Error Google</button>
  </>,
}));

const signIn = vi.fn().mockResolvedValue(undefined);
const context = { status: "unauthenticated" as const, user: null, error: null, signIn, logout: vi.fn(), invalidateSession: vi.fn(), apiClient: testApiClient };
function mount() {
  return render(<AuthContext.Provider value={context}><GoogleSignInButton /></AuthContext.Provider>);
}
beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "test-only-client-id"); });

describe("GoogleSignInButton (mocked Google)", () => {
  it("passes credential directly to signIn without rendering it", async () => {
    mount();
    await userEvent.click(screen.getByText("Google mock"));
    expect(signIn).toHaveBeenCalledExactlyOnceWith(token);
    expect(document.body).not.toHaveTextContent(token);
    expect(document.body).not.toHaveTextContent("test-only-client-id");
  });
  it("handles a missing credential", async () => {
    mount();
    await userEvent.click(screen.getByText("Sin credential"));
    expect(signIn).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Google no pudo completar");
  });
  it("handles Google errors", async () => {
    mount();
    await userEvent.click(screen.getByText("Error Google"));
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo iniciar sesión");
  });
  it("handles script download errors", async () => {
    mount();
    await userEvent.click(screen.getByText("Falla script"));
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar Google");
  });
  it("clearly names a missing client ID in development", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    vi.stubEnv("NODE_ENV", "development");
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent("NEXT_PUBLIC_GOOGLE_CLIENT_ID");
    expect(screen.queryByText("Google mock")).not.toBeInTheDocument();
  });
});
