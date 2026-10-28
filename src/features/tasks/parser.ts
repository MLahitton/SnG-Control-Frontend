import { ApiError } from "@/lib/api/apiError";
import type { ProjectTask } from "./types";

export function parseProjectTask(value: unknown, projectId?: string): ProjectTask {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(502);
  const v = value as Record<string, unknown>;
  const keys = ["id", "projectId", "area", "type", "status", "assignedAt", "startedAt", "completedAt", "assignedToGoogleSubject", "deadlineAt", "wasOverdue", "leadTimeStatus", "quotationRound"];
  const date = (x: unknown) => typeof x === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(x) && Number.isFinite(Date.parse(x));
  if (Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))
    || typeof v.id !== "string" || !v.id || typeof v.projectId !== "string" || !v.projectId || (projectId && v.projectId !== projectId)
    || (v.type === "RegisterInitialDeposit" ? v.quotationRound !== null || v.area !== "Accounting" || v.deadlineAt !== null || v.wasOverdue !== null : typeof v.quotationRound !== "number" || !Number.isSafeInteger(v.quotationRound) || v.quotationRound <= 0)
    || !["PrepareQuotation", "ReviewQuotation", "PresentQuotationToClient", "RegisterInitialDeposit"].includes(String(v.type))
    || !["Pending", "InProgress", "Completed"].includes(String(v.status)) || !["Budgets", "Commercial", "Accounting"].includes(String(v.area))
    || !["NotStarted", "OnTrack", "DueSoon", "DueToday", "Overdue", "CompletedOnTime", "CompletedLate", "UntrackedLegacy"].includes(String(v.leadTimeStatus))
    || !date(v.assignedAt) || [v.startedAt, v.completedAt, v.deadlineAt].some(x => x !== null && !date(x))
    || (v.wasOverdue !== null && typeof v.wasOverdue !== "boolean")
    || (v.assignedToGoogleSubject !== null && typeof v.assignedToGoogleSubject !== "string")) throw new ApiError(502);
  return v as unknown as ProjectTask;
}
export function parseProjectTasks(value: unknown, projectId?: string): ProjectTask[] {
  if (!Array.isArray(value)) throw new ApiError(502);
  return value.map(v => parseProjectTask(v, projectId));
}
