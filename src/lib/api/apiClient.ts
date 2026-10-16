import { ApiError } from "./apiError";
import { intelligenceMethod } from "@/features/intelligence/paths";
import { IntelligenceError } from "@/features/intelligence/errors";
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
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body: JsonValue | FormData | undefined,
    options: ApiRequestOptions = {},
    binary = false,
  ): Promise<Response> {
    const intelligence = path.startsWith("intelligence/");
    if (intelligence) {
      if (intelligenceMethod(path.slice("intelligence/".length)) !== method || options.query?.toString()) throw new IntelligenceError(400);
    } else if (!isBackendPath(path.split("/"))) throw new ApiError(400);
    const snapshot = session.getSession();
    if (!snapshot.token) {
      invalidate(snapshot.generation);
      throw new ApiError(401);
    }
    const headers = new Headers({
      Authorization: `Bearer ${snapshot.token}`,
      Accept: intelligence && binary ? "audio/mpeg" : binary ? "application/octet-stream, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/zip" : "application/json",
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
      response = await fetch(`${intelligence ? "/api/" : "/api/backend/"}${path}${query ? `?${query}` : ""}`, {
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
      throw intelligence ? new IntelligenceError(response.status, payload) : new ApiError(response.status, payload);
    }
    return response;
  }

  async function json<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: JsonValue | FormData, options?: ApiRequestOptions): Promise<T> {
    const response = await request(method, path, body, options);
    if (response.status === 204 || response.status === 205) return undefined as T;
    try { return await response.json() as T; } catch { throw new ApiError(502); }
  }

  return {
    postAudio: async (path, body, options) => {
      if (path !== "intelligence/voice/speech") throw new IntelligenceError(400);
      const response = await request("POST", path, body, options, true);
      if (response.headers.get("Content-Type")?.split(";")[0].trim() !== "audio/mpeg") throw new IntelligenceError(502);
      const blob = await response.blob();
      if (options?.signal?.aborted) throw new DOMException("Solicitud cancelada.", "AbortError");
      if (!blob.size || blob.size > 10 * 1024 * 1024) throw new IntelligenceError(502);
      return blob;
    },
    get: <T>(path: string, options?: ApiRequestOptions) => json<T>("GET", path, undefined, options),
    post: <T>(path: string, body?: JsonValue, options?: ApiRequestOptions) => json<T>("POST", path, body, options),
    put: <T>(path: string, body?: JsonValue, options?: ApiRequestOptions) => json<T>("PUT", path, body, options),
    delete: <T = void>(path: string, options?: ApiRequestOptions) => json<T>("DELETE", path, undefined, options),
    upload: <T>(path: string, body: FormData, options?: ApiRequestOptions) => json<T>("POST", path, body, options),
    download: async (path, options) => {
      const response = await request("GET", path, undefined, options, true);
      try {
        return { blob: await response.blob(), filename: downloadFilename(response.headers.get("Content-Disposition")) };
      } catch {
        if (options?.signal?.aborted) throw new DOMException("Solicitud cancelada.", "AbortError");
        throw new ApiError(502);
      }
    },
    downloadStream: async (path, options) => {
      const response = await request("GET", path, undefined, options, true);
      if (!response.body) throw new ApiError(502);
      return { stream: response.body, filename: downloadFilename(response.headers.get("Content-Disposition")) };
    },
  };
}
