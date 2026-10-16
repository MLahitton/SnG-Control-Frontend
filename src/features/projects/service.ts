import type { ApiClient } from "@/lib/api/types";
import type { ProjectTask } from "@/features/tasks/types";
import type { AssignSgResponse, CreateProject, Project } from "./types";

export const projectsService = {
  list: (api: ApiClient, signal?: AbortSignal) => api.get<Project[]>("projects", { signal }),
  get: (api: ApiClient, id: string, signal?: AbortSignal) => api.get<Project>(`projects/${id}`, { signal }),
  create: (api: ApiClient, input: CreateProject) => api.post<Project>("projects", { ...input }),
  sendToBudgets: (api: ApiClient, id: string, signal?: AbortSignal) => api.post<ProjectTask>(`projects/${id}/send-to-budgets`, undefined, { signal }),
  assignSg: (api: ApiClient, id: string, sgCode: string, signal?: AbortSignal) => api.put<AssignSgResponse>(`projects/${id}/sg-code`, { sgCode }, { signal }),
};
