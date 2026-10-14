"use client";

import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AuthError, getCurrentUser } from "@/features/auth/services/authService";
import type { AuthStatus, CurrentUser } from "@/features/auth/types/auth";

export const SESSION_TOKEN_KEY = "sng.google.id_token";
const storageError = "No se pudo guardar la sesión en esta pestaña. Habilita el almacenamiento del navegador e inténtalo de nuevo.";

interface AuthState {
  status: AuthStatus;
  user: CurrentUser | null;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  signIn: (idToken: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
const signedOut: AuthState = { status: "unauthenticated", user: null, error: null };

function clearStoredToken(): boolean {
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    return true;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({ status: "loading", user: null, error: null });
  const pending = useRef<AbortController | null>(null);

  const validate = useCallback(async (idToken: string, controller: AbortController) => {
    try {
      if (!idToken.trim()) throw new AuthError("unauthorized");
      const user = await getCurrentUser(idToken, controller.signal);
      if (controller.signal.aborted) return;
      try {
        sessionStorage.setItem(SESSION_TOKEN_KEY, idToken);
      } catch {
        clearStoredToken();
        setState({ ...signedOut, error: storageError });
        return;
      }
      setState({ status: "authenticated", user, error: null });
    } catch (error) {
      if (controller.signal.aborted) return;
      const cleared = clearStoredToken();
      setState({ ...signedOut, error: !cleared ? storageError : error instanceof AuthError ? error.message : "No pudimos iniciar sesión. Inténtalo de nuevo." });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    pending.current = controller;
    async function restore() {
      // Strict Mode cleanup can cancel the first restoration before reading storage.
      await Promise.resolve();
      if (controller.signal.aborted) return;
      try {
        const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
        if (token) await validate(token, controller);
        else setState(signedOut);
      } catch {
        setState({ ...signedOut, error: storageError });
      }
    }
    void restore();
    return () => { pending.current?.abort(); };
  }, [validate]);

  const signIn = useCallback(async (idToken: string) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    clearStoredToken();
    setState({ status: "loading", user: null, error: null });
    await validate(idToken, controller);
  }, [validate]);

  const logout = useCallback(() => {
    pending.current?.abort();
    const cleared = clearStoredToken();
    setState({ ...signedOut, error: cleared ? null : storageError });
    router.replace("/login");
  }, [router]);

  return <AuthContext.Provider value={{ ...state, signIn, logout }}>{children}</AuthContext.Provider>;
}
