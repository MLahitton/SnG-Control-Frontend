import type { ProjectTask } from "@/features/tasks/types";

export const productLines = ["Classic", "Essential", "Bioconfort", "Signature"] as const;
export type ProductLine = (typeof productLines)[number];
export interface CreateProject {
  clientId: string;
  name: string;
  city: string;
  productLine: ProductLine;
}
export interface Project extends CreateProject {
  id: string;
  sgCode: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { subject: string; email: string | null; name: string | null } | null;
}
export interface AssignSgResponse {
  project: Project;
  prepareQuotationTask: ProjectTask;
}
