import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/features/auth/services/authService";
import { token, user } from "./fixtures";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("authService", () => {
  it("sends the Bearer only in the header to the same-origin endpoint", async () => {
    fetchMock.mockResolvedValue(Response.json(user));
    await getCurrentUser(token);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", expect.objectContaining({
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      credentials: "omit",
    }));
  });

  it("returns a validated 200 identity with only supported fields", async () => {
    fetchMock.mockResolvedValue(Response.json({ ...user, internal: "discard" }));
    expect(await getCurrentUser(token)).toEqual(user);
  });

  it("recognizes 401 without trusting its body", async () => {
    fetchMock.mockResolvedValue(new Response("internal details", { status: 401 }));
    await expect(getCurrentUser(token)).rejects.toMatchObject({ kind: "unauthorized" });
  });

  it.each([403, 500, 503])("controls backend status %s", async (status) => {
    fetchMock.mockResolvedValue(new Response("private data", { status }));
    await expect(getCurrentUser(token)).rejects.toMatchObject({ kind: "backend" });
  });

  it("controls network errors without leaking their messages", async () => {
    fetchMock.mockRejectedValue(new Error("private network details"));
    await expect(getCurrentUser(token)).rejects.toMatchObject({
      kind: "backend",
      message: "No pudimos conectar con el servicio de acceso. Inténtalo de nuevo.",
    });
  });

  it.each([{ subject: "" }, { ...user, name: 123 }, null])("rejects malformed identity %j", async (body) => {
    fetchMock.mockResolvedValue(Response.json(body));
    await expect(getCurrentUser(token)).rejects.toMatchObject({ kind: "backend" });
  });

  it("accepts nullable name and email", async () => {
    const identity = { subject: user.subject, name: null, email: null };
    fetchMock.mockResolvedValue(Response.json(identity));
    expect(await getCurrentUser(token)).toEqual(identity);
  });
});
