import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { AuthContext } from "@/features/auth/context/AuthProvider";
import { createApiClient } from "@/lib/api/apiClient";
import type { Client } from "@/features/clients/types";
import type { Project } from "@/features/projects/types";
import type { ProjectTask } from "@/features/tasks/types";
import type { ProjectNotification } from "@/features/notifications/types";
import { token, user } from "./fixtures";

export const client: Client = { id: "client-1", name: "Cliente de prueba", createdAt: "2026-10-15T15:00:00Z", updatedAt: null };
export const project: Project = {
  id: "project-1", clientId: client.id, name: "Proyecto Norte", city: "Bogotá", productLine: "Classic",
  sgCode: null, createdAt: "2026-10-15T15:00:00Z", updatedAt: null, createdBy: user,
};
export const task: ProjectTask = {
  id: "task-1", projectId: project.id, area: "Budgets", type: "PrepareQuotation", status: "Pending",
  assignedAt: "2026-10-15T15:00:00Z", startedAt: null, completedAt: null,
  assignedToGoogleSubject: "private-assignee-subject", deadlineAt: null, wasOverdue: false, leakTimeStatus: "NotStarted",
};
export const inProgressTask: ProjectTask = {
  ...task, status: "InProgress", startedAt: "2026-10-15T16:00:00Z", deadlineAt: "2026-10-22T22:00:00Z", leakTimeStatus: "OnTrack",
};
export const notification: ProjectNotification = {
  id: "notification-1", projectId: project.id, projectTaskId: task.id, recipientGoogleSubject: "private-recipient-subject",
  taskType: "PrepareQuotation", kind: "TaskAssigned", state: "Informational", title: "Cotización asignada",
  message: "Revisa el proyecto asignado.", scheduledAt: null, createdAt: "2026-10-15T15:00:00Z", resolvedAt: null, deadlineAt: null,
};

export function renderOperational(children: ReactNode) {
  const apiClient = createApiClient({ getSession: () => ({ token, generation: 1 }), invalidateSession: vi.fn() });
  return render(<AuthContext.Provider value={{ status: "authenticated", user, error: null, signIn: vi.fn(), logout: vi.fn(), invalidateSession: vi.fn(), apiClient }}>{children}</AuthContext.Provider>);
}

export function mockBackend(handler: (path: string, init: RequestInit) => unknown | Promise<unknown>) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const result = await handler(url.replace("/api/backend/", ""), init);
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
