import type { TaskType } from "@/features/tasks/types";

export type NotificationState = "Informational" | "Active" | "Resolved";
export interface ProjectNotification {
  id: string;
  projectId: string;
  projectTaskId: string;
  recipientGoogleSubject: string;
  taskType: TaskType;
  kind: "TaskAssigned" | "DueInTwoBusinessDays" | "DueToday" | "Overdue";
  state: NotificationState;
  title: string;
  message: string;
  scheduledAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
  deadlineAt: string | null;
}
