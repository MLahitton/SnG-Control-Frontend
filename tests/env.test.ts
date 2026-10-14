// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getGoogleClientId } from "@/lib/config/env";
import { getApiBaseUrl } from "@/lib/config/server-env";

describe("environment configuration", () => {
  it.each(["", "  ", "<GOOGLE_OAUTH_CLIENT_ID>"])("requires a configured Google Client ID (%j)", (value) => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", value);
    expect(() => getGoogleClientId()).toThrow("NEXT_PUBLIC_GOOGLE_CLIENT_ID");
  });
  it("reads the public client ID", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", " test-only-client-id ");
    expect(getGoogleClientId()).toBe("test-only-client-id");
  });
  it.each(["", "/relative", "file:///private", "https://user:password@example.test", "https://example.test/?private=value", "https://example.test/#private"])("rejects invalid backend configuration (%j)", (value) => {
    vi.stubEnv("SNG_API_BASE_URL", value);
    expect(() => getApiBaseUrl()).toThrow("SNG_API_BASE_URL");
    try { getApiBaseUrl(); } catch (error) {
      if (value) expect((error as Error).message).not.toContain(value);
    }
  });
  it.each(["http://backend.example.test", "https://backend.example.test"])("accepts absolute HTTP(S) URL %s", (value) => {
    vi.stubEnv("SNG_API_BASE_URL", value);
    expect(getApiBaseUrl().origin).toBe(value);
  });
});
