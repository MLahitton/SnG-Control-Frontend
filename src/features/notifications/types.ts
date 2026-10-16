import type { TaskType } from "@/features/tasks/types";

export type NotificationState = "Informational" | "Active" | "Resolved";
export type NotificationKind = "TaskAssigned" | "DueInTwoBusinessDays" | "DueToday" | "Overdue" | "ProjectDocumentsUpdated";
export interface ProjectNotification {
  id: string;
  projectId: string;
  projectTaskId: string;
  recipientGoogleSubject: string;
  taskType: TaskType;
  kind: NotificationKind;
  state: NotificationState;
  title: string;
  message: string;
  scheduledAt: string;
  createdAt: string;
  resolvedAt: string | null;
  deadlineAt: string | null;
}
