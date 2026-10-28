import { roleContext } from "./roleFixtures";
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { AuthContext } from "@/features/auth/context/AuthProvider";
import { isAvailableRole, type CurrentUser } from "@/features/auth/types/auth";
import { createApiClient } from "@/lib/api/apiClient";
import type { Client } from "@/features/clients/types";
import type { Project } from "@/features/projects/types";
import type { ProjectTask } from "@/features/tasks/types";
import type { ProjectNotification } from "@/features/notifications/types";
import { token, user } from "./fixtures";

export const client: Client = { id: "client-1", name: "Cliente de prueba", createdAt: "2026-10-15T15:00:00Z", updatedAt: "2026-10-15T15:00:00Z" };
export const project: Project = {
  id: "project-1", clientId: client.id, name: "Proyecto Norte", city: "Bogotá", productLine: "Classic",
  sgCode: null, createdAt: "2026-10-15T15:00:00Z", updatedAt: "2026-10-15T15:00:00Z", createdBy: user,
};
export const task: ProjectTask = { quotationRound: 1,
  id: "task-1", projectId: project.id, area: "Budgets", type: "PrepareQuotation", status: "Pending",
  assignedAt: "2026-10-15T15:00:00Z", startedAt: null, completedAt: null,
  assignedToGoogleSubject: "private-assignee-subject", deadlineAt: null, wasOverdue: null, leadTimeStatus: "NotStarted",
};
export const inProgressTask: ProjectTask = {
  ...task, status: "InProgress", startedAt: "2026-10-15T16:00:00Z", deadlineAt: "2026-10-22T22:00:00Z", leadTimeStatus: "OnTrack",
};
export const notification: ProjectNotification = {
  id: "notification-1", projectId: project.id, projectTaskId: task.id, recipientGoogleSubject: "private-recipient-subject",
  taskType: "PrepareQuotation", kind: "TaskAssigned", state: "Informational", title: "Cotización asignada",
  message: "Revisa el proyecto asignado.", scheduledAt: "2026-10-15T15:00:00Z", createdAt: "2026-10-15T15:00:00Z", resolvedAt: null, deadlineAt: null,
};

export function renderOperational(children: ReactNode, currentUser: CurrentUser = user) {
  const activeRole = currentUser.roles.filter(isAvailableRole)[0] ?? "CommercialAdvisor";
  const apiClient = createApiClient({ getSession: () => ({ token, generation: 1 , activeRole}), invalidateSession: vi.fn() });
  return render(<AuthContext.Provider value={{ status: "authenticated", ...roleContext(activeRole), user: currentUser, error: null, signIn: vi.fn(), logout: vi.fn(), invalidateSession: vi.fn(), apiClient }}>{children}</AuthContext.Provider>);
}

export function mockBackend(handler: (path: string, init: RequestInit) => unknown | Promise<unknown>, quotationViews?: (path: string, init: RequestInit) => unknown | Promise<unknown>) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const path = url.replace("/api/backend/", "");
    const result = path.endsWith("/quotation-rounds") ? { projectId: path.split("/")[1], total: 0, returned: 0, hasMore: false, rounds: [] } : await (init.method === "GET" && /\/(budget|commercial)-quotation\/view$/.test(path)
      ? quotationViews ? quotationViews(path, init) : Response.json({}, { status: 404 })
      : handler(path, init));
    return result instanceof Response ? result : Response.json(result);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}
