import { ApiError } from "./apiError";
import { isBackendPath } from "./backendPath";
import { downloadFilename } from "./contentDisposition";
import type { ApiClient, ApiRequestOptions, JsonValue } from "./types";

interface SessionSnapshot {
  token: string | null;
  generation: number;
}

interface SessionAccess {
  getSession: () => SessionSnapshot;
  invalidateSession: (generation: number) => void;
}

export function createApiClient(session: SessionAccess): ApiClient {
  let invalidatedGeneration: number | undefined;

  function invalidate(generation: number) {
    if (invalidatedGeneration === generation || session.getSession().generation !== generation) return;
    invalidatedGeneration = generation;
    session.invalidateSession(generation);
  }

  async function request(
    method: "GET" | "POST" | "PUT",
    path: string,
    body: JsonValue | FormData | undefined,
    options: ApiRequestOptions = {},
    binary = false,
  ): Promise<Response> {
    if (!isBackendPath(path.split("/"))) throw new ApiError(400);
    const snapshot = session.getSession();
    if (!snapshot.token) {
      invalidate(snapshot.generation);
      throw new ApiError(401);
    }
    const headers = new Headers({
      Authorization: `Bearer ${snapshot.token}`,
      Accept: binary ? "application/octet-stream, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/json",
    });
    let requestBody: BodyInit | undefined;
    if (body instanceof FormData) requestBody = body;
    else if (body !== undefined) {
      headers.set("Content-Type", "application/json");
      requestBody = JSON.stringify(body);
    }
    const query = options.query?.toString();
    let response: Response;
    try {
      response = await fetch(`/api/backend/${path}${query ? `?${query}` : ""}`, {
        method, headers, body: requestBody, signal: options.signal,
        cache: "no-store", credentials: "omit", redirect: "error",
      });
    } catch {
      if (options.signal?.aborted) throw new DOMException("Solicitud cancelada.", "AbortError");
      throw new ApiError(0);
    }
    if (response.status === 401) invalidate(snapshot.generation);
    if (!response.ok) {
      let payload: unknown;
      try { payload = await response.json(); } catch { /* Non-JSON errors use the safe status message. */ }
      throw new ApiError(response.status, payload);
    }
    return response;
  }

  async function json<T>(method: "GET" | "POST" | "PUT", path: string, body?: JsonValue | FormData, options?: ApiRequestOptions): Promise<T> {
    const response = await request(method, path, body, options);
    if (response.status === 204 || response.status === 205) return undefined as T;
    try { return await response.json() as T; } catch { throw new ApiError(502); }
  }

  return {
    get: <T>(path: string, options?: ApiRequestOptions) => json<T>("GET", path, undefined, options),
    post: <T>(path: string, body?: JsonValue, options?: ApiRequestOptions) => json<T>("POST", path, body, options),
    put: <T>(path: string, body?: JsonValue, options?: ApiRequestOptions) => json<T>("PUT", path, body, options),
    upload: <T>(path: string, body: FormData, options?: ApiRequestOptions) => json<T>("POST", path, body, options),
    download: async (path, options) => {
      const response = await request("GET", path, undefined, options, true);
      try {
        return { blob: await response.blob(), filename: downloadFilename(response.headers.get("Content-Disposition")) };
      } catch { throw new ApiError(502); }
    },
  };
}
