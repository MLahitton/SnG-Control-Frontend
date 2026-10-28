import { ApiError } from "@/lib/api/apiError";
import type { LeadTimeStatus, TaskArea, TaskStatus } from "@/features/tasks/types";
import type { ManagementOverview, ManagementTask } from "./types";

function invalid(): never { throw new ApiError(502); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key))) return invalid();
  return result;
}
function string(value: unknown): string { return typeof value === "string" ? value : invalid(); }
function count(value: unknown): number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : invalid(); }
function boolean(value: unknown): boolean { return typeof value === "boolean" ? value : invalid(); }
function nullable<T>(value: unknown, parse: (value: unknown) => T): T | null { return value === null ? null : parse(value); }
function list<T>(value: unknown, parse: (value: unknown) => T): T[] { return Array.isArray(value) ? value.map(parse) : invalid(); }
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  return typeof value === "string" && values.includes(value as T) ? value as T : invalid();
}
function date(value: unknown): string {
  const result = string(value);
  return /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(result) && Number.isFinite(Date.parse(result)) ? result : invalid();
}
function area(value: unknown): TaskArea { return choice(value, ["Commercial", "Budgets", "Accounting"]); }
function status(value: unknown): TaskStatus { return choice(value, ["Pending", "InProgress", "Completed"]); }
function timing(value: unknown): LeadTimeStatus {
  return choice(value, ["NotStarted", "OnTrack", "DueSoon", "DueToday", "Overdue", "CompletedOnTime", "CompletedLate", "UntrackedLegacy"]);
}
const countKeys = ["pending", "inProgress", "completed"] as const;
const leadTimeKeys = ["notStarted", "onTrack", "dueSoon", "dueToday", "overdue", "completedOnTime", "completedLate", "untrackedLegacy"] as const;
function counts(value: Record<string, unknown>) {
  return { pending: count(value.pending), inProgress: count(value.inProgress), completed: count(value.completed) };
}
function context(value: Record<string, unknown>) {
  return { taskId: string(value.taskId), projectId: string(value.projectId), projectName: string(value.projectName),
    clientName: string(value.clientName), sgCode: nullable(value.sgCode, string), area: area(value.area),
    leadTimeStatus: timing(value.leadTimeStatus), deadlineAt: nullable(value.deadlineAt, date), startedAt: nullable(value.startedAt, date) };
}
export function parseManagementOverview(value: unknown): ManagementOverview {
  const v = object(value, ["totalProjects", "tasks", "leadTime", "areas", "attention"]);
  const lead = object(v.leadTime, leadTimeKeys);
  const attention = object(v.attention, ["total", "items"]);
  return {
    totalProjects: count(v.totalProjects), tasks: counts(object(v.tasks, countKeys)),
    leadTime: { notStarted: count(lead.notStarted), onTrack: count(lead.onTrack), dueSoon: count(lead.dueSoon),
      dueToday: count(lead.dueToday), overdue: count(lead.overdue), completedOnTime: count(lead.completedOnTime),
      completedLate: count(lead.completedLate), untrackedLegacy: count(lead.untrackedLegacy) },
    areas: list(v.areas, (entry) => {
      const a = object(entry, ["area", ...countKeys, "overdue", "dueToday", "dueSoon"]);
      return { area: area(a.area), ...counts(a), overdue: count(a.overdue), dueToday: count(a.dueToday), dueSoon: count(a.dueSoon) };
    }),
    attention: { total: count(attention.total), items: list(attention.items, (entry) => {
      const item = object(entry, ["taskId", "projectId", "projectName", "clientName", "sgCode", "area", "taskType", "taskStatus", "leadTimeStatus", "deadlineAt", "startedAt"]);
      return { ...context(item), taskType: string(item.taskType), taskStatus: status(item.taskStatus) };
    }) },
  };
}
export function parseManagementTasks(value: unknown): ManagementTask[] {
  return list(value, (entry) => {
    const v = object(entry, ["taskId", "projectId", "projectName", "clientId", "clientName", "sgCode", "city", "productLine", "area", "type", "status", "assignedAt", "startedAt", "completedAt", "deadlineAt", "wasOverdue", "leadTimeStatus", "quotationRound"]);
    const quotationRound = v.quotationRound === null ? null : count(v.quotationRound);
    if (v.type === "RegisterInitialDeposit" ? quotationRound !== null : quotationRound === null || quotationRound < 1) invalid();
    return { quotationRound, ...context(v), clientId: string(v.clientId), city: string(v.city), productLine: string(v.productLine),
      type: string(v.type), status: status(v.status), assignedAt: date(v.assignedAt),
      completedAt: nullable(v.completedAt, date), wasOverdue: nullable(v.wasOverdue, boolean) };
  });
}
