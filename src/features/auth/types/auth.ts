export interface CurrentUser {
  subject: string;
  email: string | null;
  name: string | null;
  isManagement: boolean;
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export function isCurrentUser(value: unknown): value is CurrentUser {
  if (typeof value !== "object" || value === null) return false;
  return "subject" in value && typeof value.subject === "string" && value.subject.trim().length > 0
    && "email" in value && (value.email === null || typeof value.email === "string")
    && "name" in value && (value.name === null || typeof value.name === "string")
    && "isManagement" in value && typeof value.isManagement === "boolean";
}
