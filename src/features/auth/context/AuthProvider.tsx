"use client";

import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AuthError, getCurrentUser } from "@/features/auth/services/authService";
import type { AuthStatus, CurrentUser } from "@/features/auth/types/auth";
import { createApiClient } from "@/lib/api/apiClient";
import type { ApiClient } from "@/lib/api/types";

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
  invalidateSession: () => void;
  apiClient: ApiClient;
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
  const session = useRef({ generation: 0, authenticated: false, invalidated: false });

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
      session.current.authenticated = true;
      setState({ status: "authenticated", user, error: null });
    } catch (error) {
      if (controller.signal.aborted) return;
      const cleared = clearStoredToken();
      session.current.authenticated = false;
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
    session.current = { generation: session.current.generation + 1, authenticated: false, invalidated: false };
    const controller = new AbortController();
    pending.current = controller;
    clearStoredToken();
    setState({ status: "loading", user: null, error: null });
    await validate(idToken, controller);
  }, [validate]);

  const endSession = useCallback((error: string | null) => {
    pending.current?.abort();
    session.current = { generation: session.current.generation + 1, authenticated: false, invalidated: true };
    const cleared = clearStoredToken();
    setState({ ...signedOut, error: cleared ? error : storageError });
    router.replace("/login");
  }, [router]);

  const logout = useCallback(() => endSession(null), [endSession]);
  const invalidateSession = useCallback((generation?: number) => {
    if (session.current.invalidated || (generation !== undefined && generation !== session.current.generation)) return;
    endSession("Tu sesión ya no es válida. Inicia sesión de nuevo.");
  }, [endSession]);

  const getSession = useCallback(() => {
    let token: string | null = null;
    try {
      if (session.current.authenticated) token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    } catch { /* A blocked or missing session must never authorize a request. */ }
    return { token, generation: session.current.generation };
  }, []);

  const apiClient = useMemo<ApiClient>(() => {
    let client: ApiClient | undefined;
    // Bind session access on the first request, never during React rendering.
    const current = () => client ??= createApiClient({ getSession, invalidateSession });
    return {
      get: (path, options) => current().get(path, options),
      postAudio: (path, body, options) => current().postAudio(path, body, options),
      post: (path, body, options) => current().post(path, body, options),
      put: (path, body, options) => current().put(path, body, options),
      delete: (path, options) => current().delete(path, options),
      upload: (path, body, options) => current().upload(path, body, options),
      download: (path, options) => current().download(path, options),
      downloadStream: (path, options) => current().downloadStream(path, options),
    };
  }, [getSession, invalidateSession]);

  return <AuthContext.Provider value={{ ...state, signIn, logout, invalidateSession, apiClient }}>{children}</AuthContext.Provider>;
}
