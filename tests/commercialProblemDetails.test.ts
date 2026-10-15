// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET } from "@/app/api/backend/[...path]/route";
import { createApiClient } from "@/lib/api/apiClient";
import { ApiError } from "@/lib/api/apiError";
import type { CommercialItemKey, SafeProblemDetails } from "@/lib/api/types";
import { token } from "./fixtures";

const backend = "https://backend.example.test";
const fetchMock = vi.fn<typeof fetch>();
const missingItems: CommercialItemKey[] = [{ section: "Main", sourceRow: 15 }];
const unexpectedItems: CommercialItemKey[] = [{ section: "Additional", sourceRow: 120 }];
const request = () => new Request("https://frontend.example.test/api/backend/projects", {
  headers: { Authorization: `Bearer ${token}` },
});
const context = { params: Promise.resolve({ path: ["projects"] }) };
const invalidateSession = vi.fn();
const api = () => createApiClient({
  getSession: () => ({ token, generation: 1 }), invalidateSession,
});

beforeEach(() => {
  vi.stubEnv("SNG_API_BASE_URL", backend);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

async function clientProblem(): Promise<SafeProblemDetails> {
  try {
    await api().get("projects");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    if (!(error instanceof ApiError)) throw error;
    // These direct properties are typed for future screens and contain only sanitized values.
    const missing: CommercialItemKey[] | undefined = error.missingItems;
    const unexpected: CommercialItemKey[] | undefined = error.unexpectedItems;
    const fileError: string | undefined = error.fileError;
    expect(missing).toEqual(error.problem.extensions.missingItems);
    expect(unexpected).toEqual(error.problem.extensions.unexpectedItems);
    expect(fileError).toEqual(error.problem.extensions.fileError);
    expect(error.code).toBe("StructuralMismatch");
    expect(error.status).toBe(409);
    expect(invalidateSession).not.toHaveBeenCalled();
    return error.problem;
  }
  throw new Error("Expected a business conflict");
}

describe.each(["BFF", "ApiClient"] as const)("%s commercial error contract", (boundary) => {
  describe.each(["root", "extensions"] as const)("values in %s", (location) => {
    async function sanitize(values: Record<string, unknown>): Promise<SafeProblemDetails> {
      const fields = { code: "StructuralMismatch", ...values };
      fetchMock.mockResolvedValueOnce(Response.json(location === "root" ? fields : { extensions: fields }, {
        status: 409, headers: { "Content-Type": "application/problem+json" },
      }));
      if (boundary === "ApiClient") return clientProblem();
      const response = await GET(request(), context);
      expect(response.status).toBe(409);
      const problem = await response.json() as SafeProblemDetails;
      expect(problem.code).toBe("StructuralMismatch");
      return problem;
    }

    it("preserves missingItems and unexpectedItems for StructuralMismatch", async () => {
      const result = await sanitize({ missingItems, unexpectedItems });
      expect(result.extensions).toEqual({ code: "StructuralMismatch", missingItems, unexpectedItems });
    });

    it("preserves empty arrays without confusing them with invalid arrays", async () => {
      const result = await sanitize({ missingItems: [], unexpectedItems: [] });
      expect(result.extensions).toMatchObject({ missingItems: [], unexpectedItems: [] });
    });

    it("accepts the explicit 200-item boundary", async () => {
      const items = Array.from({ length: 200 }, (_, index) => ({ section: "Main", sourceRow: index + 1 }));
      const result = await sanitize({ missingItems: items, unexpectedItems: items });
      expect(result.extensions.missingItems).toEqual(items);
      expect(result.extensions.unexpectedItems).toEqual(items);
    });

    it("discards arrays exceeding 200 without returning misleading truncated lists", async () => {
      const items = Array.from({ length: 201 }, (_, index) => ({ section: "Main", sourceRow: index + 1 }));
      const result = await sanitize({ missingItems: items, unexpectedItems: items });
      expect(result.extensions).toEqual({ code: "StructuralMismatch" });
    });

    it.each(["Other", "main", "", null])("discards arrays containing invalid section %j", async (section) => {
      const items = [...missingItems, { section, sourceRow: 15 }];
      const result = await sanitize({ missingItems: items, unexpectedItems: items });
      expect(result.extensions).toEqual({ code: "StructuralMismatch" });
    });

    it.each([0, -1, 1.5, "15", null, Number.MAX_SAFE_INTEGER + 1])("discards arrays containing invalid sourceRow %j", async (sourceRow) => {
      const items = [{ section: "Main", sourceRow }];
      const result = await sanitize({ missingItems: items, unexpectedItems: items });
      expect(result.extensions).toEqual({ code: "StructuralMismatch" });
    });

    it("rejects non-array values and malformed elements", async () => {
      for (const value of [null, "items", { section: "Main", sourceRow: 15 }, [null], [[]], [15], [{}]]) {
        const result = await sanitize({ missingItems: value, unexpectedItems: value });
        expect(result.extensions).toEqual({ code: "StructuralMismatch" });
      }
    });

    it("keeps a valid companion array when the other array is invalid", async () => {
      const result = await sanitize({ missingItems: [{ section: "Other", sourceRow: 1 }], unexpectedItems });
      expect(result.extensions).toEqual({ code: "StructuralMismatch", unexpectedItems });
    });

    it("projects only section/sourceRow and removes extra objects, diagnostics and credentials", async () => {
      const privateFields = {
        detail: "private diagnostic", stackTrace: "private stack",
        path: "C:\\private\\quotation.xlsx", token, Authorization: `Bearer ${token}`,
        backendUrl: backend, unknown: { arbitrary: "private data" },
      };
      const result = await sanitize({
        ...privateFields,
        missingItems: [{ ...missingItems[0], ...privateFields }],
        unexpectedItems: [{ ...unexpectedItems[0], extra: { ...privateFields } }],
      });
      expect(result.extensions).toEqual({ code: "StructuralMismatch", missingItems, unexpectedItems });
      const serialized = JSON.stringify(result);
      for (const value of [token, backend, "private", "Authorization", "stackTrace", "unknown", "extra"]) {
        expect(serialized).not.toContain(value);
      }
    });

    it("preserves only bounded fileError identifiers", async () => {
      for (const fileError of ["InvalidWorkbook", "Invalid_Worksheet2", "E".repeat(80)]) {
        const result = await sanitize({ fileError });
        expect(result.extensions.fileError).toBe(fileError);
      }
    });

    it("discards free-form, oversized and unsafe fileError values", async () => {
      for (const fileError of [
        "", "Invalid workbook file", "E".repeat(81), "https://private.example/file",
        "C:\\private\\file.xlsx", "/private/file.xlsx", `Bearer ${token}`, token,
        "part.part.part", "Invalid\nWorkbook", { code: "InvalidWorkbook" }, ["InvalidWorkbook"], 15,
      ]) {
        const result = await sanitize({ fileError });
        expect(result.extensions).toEqual({ code: "StructuralMismatch" });
      }
    });
  });
});

it("preserves the typed commercial details through BFF then ApiClient sanitization", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({
    code: "StructuralMismatch",
    extensions: { missingItems, unexpectedItems, fileError: "InvalidWorkbook", detail: backend },
  }, { status: 409 }));
  const bridgeResponse = await GET(request(), context);
  fetchMock.mockResolvedValueOnce(bridgeResponse);
  const result = await clientProblem();
  expect(result.extensions).toEqual({
    code: "StructuralMismatch", missingItems, unexpectedItems, fileError: "InvalidWorkbook",
  });
});
