import type { IntelligenceResponse, ProjectItem, TaskItem } from "@/features/intelligence/types";
export const projectId = "11111111-1111-4111-8111-111111111111";
export const taskId = "22222222-2222-4222-8222-222222222222";
export const requestId = "33333333-3333-4333-8333-333333333333";
export const intelligenceProject: ProjectItem = { kind: "project", projectId, projectName: "Casa Ximena", sgCode: "SG001", clientName: "Cliente de prueba", city: "Bogotá" };
export const intelligenceTask: TaskItem = { kind: "task", projectId, taskId, projectName: "Casa Ximena", sgCode: "SG001", area: "Presupuestos", task: "Preparar cotización", status: "Pendiente", leakTimeStatus: "Sin iniciar", deadlineAt: null };
const common = { answer: "Respuesta para la pantalla.", spokenAnswer: "Respuesta breve para escuchar.", references: [{ type: "project" as const, projectId, label: "Casa Ximena", sgCode: "SG001" }, { type: "task" as const, projectId, taskId, label: "Preparar cotización" }] };
export const intelligenceResponses: IntelligenceResponse[] = [
  { ...common, responseType: "direct", presentation: { kind: "direct", metric: { key: "projects", label: "Proyectos", value: 12 } } },
  { ...common, responseType: "management_brief", presentation: { kind: "management_brief", metrics: [{ key: "overdue", label: "Atrasadas", value: 2 }], items: [intelligenceTask] } },
  { ...common, responseType: "project_status", presentation: { kind: "project_status", project: intelligenceProject, tasks: [intelligenceTask] } },
  { ...common, responseType: "list", presentation: { kind: "list", items: [intelligenceProject, intelligenceTask] } },
  { ...common, responseType: "comparison", presentation: { kind: "comparison", areas: [{ area: "Presupuestos", pending: 1, inProgress: 2, completed: 3, overdue: 0, dueToday: 1, dueSoon: 1 }] } },
  { ...common, responseType: "clarification", presentation: { kind: "clarification", candidates: [intelligenceProject] } },
  { ...common, responseType: "unavailable", answer: "No hay datos de facturación disponibles.", presentation: { kind: "unavailable", reason: "data_not_available" } },
];
export const intelligenceResponse = intelligenceResponses[0];

export const conversationCreated = { conversationId: "c".repeat(43), expiresAt: "2026-10-19T23:59:59Z" };
