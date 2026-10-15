export type TaskArea = "Commercial" | "Budgets";
export type TaskStatus = "Pending" | "InProgress" | "Completed";
export type TaskType = "PrepareQuotation" | "ReviewQuotation" | "PresentQuotationToClient";
export type LeakTimeStatus = "NotStarted" | "OnTrack" | "DueSoon" | "DueToday" | "Overdue" | "CompletedOnTime" | "CompletedLate" | "UntrackedLegacy";
export interface ProjectTask {
  id: string;
  projectId: string;
  area: TaskArea;
  type: TaskType;
  status: TaskStatus;
  assignedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  assignedToGoogleSubject: string | null;
  deadlineAt: string | null;
  wasOverdue: boolean | null;
  leakTimeStatus: LeakTimeStatus;
}
export const taskAreaLabels: Record<TaskArea, string> = { Commercial: "Comercial", Budgets: "Presupuestos" };
export const taskStatusLabels: Record<TaskStatus, string> = { Pending: "Pendiente", InProgress: "En curso", Completed: "Completada" };
export const taskTypeLabels: Record<TaskType, string> = {
  PrepareQuotation: "Preparar cotización",
  ReviewQuotation: "Revisar cotización",
  PresentQuotationToClient: "Presentar cotización al cliente",
};
