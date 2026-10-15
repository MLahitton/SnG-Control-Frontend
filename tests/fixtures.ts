import type { CurrentUser } from "@/features/auth/types/auth";
import { createApiClient } from "@/lib/api/apiClient";

export const testApiClient = createApiClient({
  getSession: () => ({ token: null, generation: 0 }),
  invalidateSession: () => {},
});

// Opaque test input: intentionally not a JWT or a real Google credential.
export const token = "test-only-opaque-credential";
export const user: CurrentUser = {
  subject: "test-subject-123",
  name: "Persona de prueba",
  email: "persona@example.test",
};
