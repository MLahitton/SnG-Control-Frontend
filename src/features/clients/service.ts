import type { ApiClient } from "@/lib/api/types";
import type { Client } from "./types";

export const clientsService = {
  list: (api: ApiClient, signal?: AbortSignal) => api.get<Client[]>("clients", { signal }),
  get: (api: ApiClient, id: string, signal?: AbortSignal) => api.get<Client>(`clients/${id}`, { signal }),
  create: (api: ApiClient, name: string) => api.post<Client>("clients", { name }),
};
