export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface SafeProblemDetails {
  type: "about:blank";
  status: number;
  title: string;
  code?: string;
  extensions: {
    code?: string;
    errorCode?: string;
    field?: string;
    fields?: string[];
    retryAfterSeconds?: number;
  };
}

export interface ApiRequestOptions {
  query?: URLSearchParams;
  signal?: AbortSignal;
}

export interface ApiDownload {
  blob: Blob;
  filename: string | null;
}

export interface ApiClient {
  get<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  post<T>(path: string, body?: JsonValue, options?: ApiRequestOptions): Promise<T>;
  put<T>(path: string, body?: JsonValue, options?: ApiRequestOptions): Promise<T>;
  upload<T>(path: string, body: FormData, options?: ApiRequestOptions): Promise<T>;
  download(path: string, options?: ApiRequestOptions): Promise<ApiDownload>;
}
