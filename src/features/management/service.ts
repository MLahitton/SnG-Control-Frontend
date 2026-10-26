import type { ApiClient } from "@/lib/api/types";
import { parseManagementOverview, parseManagementTasks } from "./parser";

export const managementService = {
  overview: async (api: ApiClient, signal?: AbortSignal) => parseManagementOverview(await api.get<unknown>("management/overview", { signal })),
  tasks: async (api: ApiClient, signal?: AbortSignal) => parseManagementTasks(await api.get<unknown>("management/tasks", { signal })),
};
