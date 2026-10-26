export const systemRoles = ["CommercialAdvisor", "Budgets", "CommercialHead", "Accounting", "Engineering", "Production", "Logistics", "Installation", "Management"] as const;
export type SystemRole = typeof systemRoles[number];
export const availableRoleLabels = {
  CommercialAdvisor: "Asesor Comercial", Budgets: "Presupuestos", CommercialHead: "Jefe Comercial", Management: "Gerencia",
} as const;
export type AvailableRole = keyof typeof availableRoleLabels;
export function isSystemRole(value: unknown): value is SystemRole {
  return typeof value === "string" && systemRoles.some(role => role === value);
}
export function isAvailableRole(value: SystemRole): value is AvailableRole {
  return Object.hasOwn(availableRoleLabels, value);
}
export const ACTIVE_ROLE_HEADER = "X-SnG-Active-Role";

export interface CurrentUser {
  subject: string;
  email: string | null;
  name: string | null;
  isManagement: boolean;
  roles: SystemRole[];
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export function isCurrentUser(value: unknown): value is CurrentUser {
  if (typeof value !== "object" || value === null) return false;
  return "subject" in value && typeof value.subject === "string" && value.subject.trim().length > 0
    && "email" in value && (value.email === null || typeof value.email === "string")
    && "name" in value && (value.name === null || typeof value.name === "string")
    && "roles" in value && Array.isArray(value.roles) && value.roles.every(isSystemRole)
    && new Set(value.roles).size === value.roles.length
    && "isManagement" in value && typeof value.isManagement === "boolean"
    && value.isManagement === value.roles.includes("Management");
}
