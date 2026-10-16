import type { ApiClient } from "@/lib/api/types";
import type { ManagementOverview, ManagementTask } from "./types";

export const managementService = {
  overview: (api: ApiClient, signal?: AbortSignal) => api.get<ManagementOverview>("management/overview", { signal }),
  tasks: (api: ApiClient, signal?: AbortSignal) => api.get<ManagementTask[]>("management/tasks", { signal }),
};
