import { isAvailableRole, type AvailableRole, type SystemRole } from "@/features/auth/types/auth";

const operational = [
  { href: "/", label: "Inicio", icon: "home", description: "Área actual" },
  { href: "/clients", label: "Clientes", icon: "clients", description: "Contexto de clientes" },
  { href: "/projects", label: "Proyectos", icon: "projects", description: "Expedientes disponibles" },
  { href: "/tasks", label: "Tareas", icon: "tasks", description: "Trabajo y vencimientos" },
  { href: "/notifications", label: "Notificaciones", icon: "notifications", description: "Actividad y alertas" },
] as const;
const management = [
  { href: "/management", label: "Resumen", icon: "home", description: "Resumen ejecutivo" },
  { href: "/management/tasks", label: "Operación", icon: "tasks", description: "Operación transversal" },
  operational[1], operational[2],
] as const;
export const navigationByRole = {
  CommercialAdvisor: operational, Budgets: operational, CommercialHead: operational, Accounting: operational, Management: management,
} satisfies Record<AvailableRole, readonly { href: string; label: string; icon: string; description: string }[]>;
export const capabilitiesByRole = {
  CommercialAdvisor: { createClient: true, createProject: true, emptyProjects: "Todavía no hay proyectos." },
  Budgets: { createClient: false, createProject: false, emptyProjects: "No tienes proyectos disponibles en Presupuestos." },
  CommercialHead: { createClient: false, createProject: false, emptyProjects: "No tienes proyectos disponibles en Jefatura Comercial." },
  Accounting: { createClient: false, createProject: false, emptyProjects: "No tienes proyectos disponibles en Contabilidad." },
  Management: { createClient: false, createProject: false, emptyProjects: "Todavía no hay proyectos." },
} satisfies Record<AvailableRole, { createClient: boolean; createProject: boolean; emptyProjects: string }>;
export function navigationFor(role: SystemRole | null, ownedRoles: readonly SystemRole[]) { return role && ownedRoles.includes(role) && isAvailableRole(role) ? navigationByRole[role] : []; }
export function capabilitiesFor(role: SystemRole | null) {
  return role && isAvailableRole(role) ? capabilitiesByRole[role] : { createClient: false, createProject: false, emptyProjects: "No hay proyectos disponibles." };
}
