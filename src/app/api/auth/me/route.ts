import { getApiBaseUrl } from "@/lib/config/server-env";
import { isCurrentUser } from "@/features/auth/types/auth";

export const runtime = "nodejs";

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", Vary: "Authorization" },
  });
}

export async function GET(request: Request): Promise<Response> {
  const authorization = request.headers.get("Authorization");
  if (!authorization || !/^Bearer [A-Za-z0-9._~+/-]+=*$/i.test(authorization)) {
    return json({ error: "Se requiere autenticación." }, 401);
  }

  let endpoint: URL;
  try {
    endpoint = new URL("/api/auth/me", getApiBaseUrl());
  } catch {
    console.error("Configuración inválida: SNG_API_BASE_URL.");
    return json({ error: "El servicio de acceso no está disponible." }, 503);
  }

  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: authorization },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401) return json({ error: "Sesión no válida." }, 401);
    if (response.status !== 200) {
      const status = response.status >= 400 && response.status <= 599 ? response.status : 502;
      return json({ error: "No se pudo validar la sesión." }, status);
    }
    const data: unknown = await response.json();
    if (!isCurrentUser(data)) return json({ error: "Respuesta de identidad no válida." }, 502);
    return json({ subject: data.subject, email: data.email, name: data.name, isManagement: data.isManagement }, 200);
  } catch {
    return json({ error: "El servicio de acceso no está disponible." }, 502);
  }
}
