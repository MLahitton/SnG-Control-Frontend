import type { ManagementOverview, ManagementTask } from "@/features/management/types";
import { user } from "./fixtures";

export const manager = { ...user, isManagement: true };
export const managementTask: ManagementTask = {
  taskId: "task-overdue", projectId: "project-1", projectName: "Proyecto Norte",
  clientId: "client-1", clientName: "Cliente Norte", sgCode: "SG001", city: "Bogotá", productLine: "Classic",
  area: "Budgets", type: "PrepareQuotation", status: "InProgress",
  assignedAt: "2026-10-01T15:00:00Z", startedAt: "2026-10-01T16:00:00Z", completedAt: null,
  deadlineAt: "2026-10-10T22:00:00Z", wasOverdue: true, leakTimeStatus: "Overdue",
};
export const managementTasks: ManagementTask[] = [
  managementTask,
  { ...managementTask, taskId: "task-pending", projectId: "project-2", projectName: "Proyecto Sur", clientName: "Cliente Sur", city: "Cali", sgCode: null, status: "Pending", area: "Commercial", type: "ReviewQuotation", startedAt: null, deadlineAt: null, wasOverdue: null, leakTimeStatus: "NotStarted" },
  { ...managementTask, taskId: "task-legacy", projectId: "project-3", projectName: "Proyecto Histórico", type: "FutureTask", deadlineAt: null, wasOverdue: null, leakTimeStatus: "UntrackedLegacy" },
  { ...managementTask, taskId: "task-completed", projectId: "project-4", projectName: "Proyecto Terminado", area: "Commercial", type: "PresentQuotationToClient", status: "Completed", completedAt: "2026-10-12T15:00:00Z", leakTimeStatus: "CompletedLate" },
];
export const overview: ManagementOverview = {
  totalProjects: 12, tasks: { pending: 3, inProgress: 4, completed: 5 },
  leakTime: { notStarted: 3, onTrack: 1, dueSoon: 1, dueToday: 1, overdue: 1, completedOnTime: 4, completedLate: 1, untrackedLegacy: 0 },
  areas: [
    { area: "Budgets", pending: 2, inProgress: 2, completed: 3, overdue: 1, dueToday: 0, dueSoon: 1 },
    { area: "Commercial", pending: 1, inProgress: 2, completed: 2, overdue: 0, dueToday: 1, dueSoon: 0 },
  ],
  attention: { total: 17, items: [
    { taskId: "task-overdue", projectId: "project-1", projectName: "Proyecto Norte", clientName: "Cliente Norte", sgCode: "SG001", area: "Budgets", taskType: "PrepareQuotation", taskStatus: "InProgress", leakTimeStatus: "Overdue", startedAt: managementTask.startedAt, deadlineAt: managementTask.deadlineAt },
    { taskId: "task-today", projectId: "project-2", projectName: "Proyecto Sur", clientName: "Cliente Sur", sgCode: null, area: "Commercial", taskType: "ReviewQuotation", taskStatus: "Pending", leakTimeStatus: "DueToday", startedAt: null, deadlineAt: null },
  ] },
};
