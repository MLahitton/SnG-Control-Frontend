import type { ApiClient } from "@/lib/api/types";
import type { ProjectNotification } from "./types";

export const notificationsService = {
  list: (api: ApiClient, signal?: AbortSignal) => api.get<ProjectNotification[]>("notifications", { signal }),
  forProject: (api: ApiClient, id: string, signal?: AbortSignal) => api.get<ProjectNotification[]>(`projects/${id}/notifications`, { signal }),
};
