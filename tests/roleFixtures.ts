import { vi } from "vitest";
import type { AvailableRole } from "@/features/auth/types/auth";
export function roleContext(activeRole: AvailableRole = "CommercialAdvisor") {
  return { activeRole, availableRoles: [activeRole], setActiveRole: vi.fn() };
}
