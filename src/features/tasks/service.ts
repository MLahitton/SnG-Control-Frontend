import type { ApiClient } from "@/lib/api/types";
import type { ProjectTask, TaskArea, TaskStatus } from "./types";

export const tasksService = {
  list: (api: ApiClient, area: TaskArea, status: TaskStatus, signal?: AbortSignal) =>
    api.get<ProjectTask[]>("project-tasks", { query: new URLSearchParams({ area, status }), signal }),
  forProject: (api: ApiClient, id: string, signal?: AbortSignal) => api.get<ProjectTask[]>(`projects/${id}/tasks`, { signal }),
};
