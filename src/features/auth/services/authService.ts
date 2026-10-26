import { isCurrentUser, type CurrentUser } from "@/features/auth/types/auth";

export class AuthError extends Error {
  constructor(public readonly kind: "unauthorized" | "backend") {
    super(kind === "unauthorized"
      ? "No pudimos validar tu sesión. Inicia sesión de nuevo."
      : "No pudimos conectar con el servicio de acceso. Inténtalo de nuevo.");
    this.name = "AuthError";
  }
}

export async function getCurrentUser(idToken: string, signal?: AbortSignal): Promise<CurrentUser> {
  try {
    const response = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${idToken}` },
      cache: "no-store",
      credentials: "omit",
      signal,
    });
    if (response.status === 401) throw new AuthError("unauthorized");
    if (response.status !== 200) throw new AuthError("backend");
    const data: unknown = await response.json();
    if (!isCurrentUser(data)) throw new AuthError("backend");
    return { subject: data.subject, email: data.email, name: data.name, isManagement: data.isManagement, roles: data.roles };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError("backend");
  }
}
