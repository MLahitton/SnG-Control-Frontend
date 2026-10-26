import type { LeadTimeStatus, TaskArea, TaskStatus } from "@/features/tasks/types";

export interface ManagementOverview {
  totalProjects: number;
  tasks: { pending: number; inProgress: number; completed: number };
  LeadTime: {
    notStarted: number; onTrack: number; dueSoon: number; dueToday: number;
    overdue: number; completedOnTime: number; completedLate: number; untrackedLegacy: number;
  };
  areas: Array<{
    area: TaskArea; pending: number; inProgress: number; completed: number;
    overdue: number; dueToday: number; dueSoon: number;
  }>;
  attention: {
    total: number;
    items: Array<{
      taskId: string; projectId: string; projectName: string; clientName: string;
      sgCode: string | null; area: TaskArea; taskType: string; taskStatus: TaskStatus;
      LeadTimeStatus: LeadTimeStatus; deadlineAt: string | null; startedAt: string | null;
    }>;
  };
}

export interface ManagementTask {
  taskId: string; projectId: string; projectName: string;
  clientId: string; clientName: string; sgCode: string | null;
  city: string; productLine: string; area: TaskArea; type: string; status: TaskStatus;
  assignedAt: string; startedAt: string | null; completedAt: string | null;
  deadlineAt: string | null; wasOverdue: boolean | null; LeadTimeStatus: LeadTimeStatus;
}
