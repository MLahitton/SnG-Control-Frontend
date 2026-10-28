import type { AvailableRole } from "@/features/auth/types/auth";
import type { TaskArea, TaskStatus } from "./types";

type Inbox = { area: TaskArea; defaultStatus: TaskStatus; label: string; empty: string };
export const taskInboxByRole = {
  CommercialAdvisor: { area: "Commercial", defaultStatus: "InProgress", label: "Asesor Comercial", empty: "No tienes tareas comerciales en este estado." },
  Budgets: { area: "Budgets", defaultStatus: "Pending", label: "Presupuestos", empty: "No tienes tareas de Presupuestos en este estado." },
  CommercialHead: { area: "Commercial", defaultStatus: "InProgress", label: "Jefe Comercial", empty: "No tienes revisiones comerciales en este estado." },
  Accounting: { area: "Accounting", defaultStatus: "Pending", label: "Contabilidad", empty: "No tienes registros de anticipo en este estado." },
  Management: null,
} satisfies Record<AvailableRole, Inbox | null>;
export type TaskInbox = Inbox;
