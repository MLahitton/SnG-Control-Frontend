import { parseProjectTasks } from "./parser";
import type { ApiClient } from "@/lib/api/types";
import type { TaskArea, TaskStatus } from "./types";

export const tasksService = {
  list: (api: ApiClient, area: TaskArea, status: TaskStatus, signal?: AbortSignal) =>
    api.get<unknown>("project-tasks", { query: new URLSearchParams({ area, status }), signal }).then(value => parseProjectTasks(value)),
  forProject: (api: ApiClient, id: string, signal?: AbortSignal) => api.get<unknown>(`projects/${id}/tasks`, { signal }).then(value => parseProjectTasks(value, id)),
};
