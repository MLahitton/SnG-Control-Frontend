import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { parseDecision, parseRecordedDecision } from "@/features/clientDecision/contracts";
import { ClientDecisionCard } from "@/features/clientDecision/ClientDecisionCard";
import { ApiError } from "@/lib/api/apiError";
import { mockBackend, renderOperational, inProgressTask } from "./operationalFixtures";
import { user } from "./fixtures";

const id = "11111111-1111-4111-8111-111111111111";
const taskId = "22222222-2222-4222-8222-222222222222";
const date = "2026-10-28T13:00:00-05:00";
const absent = { quotationRound: 1, available: false, projectId: id, commercialQuotationId: null, presentQuotationTaskId: null, decision: null, note: null, recordedAt: null };
const decision = { ...absent, available: true, commercialQuotationId: taskId, presentQuotationTaskId: taskId, decision: "ChangesRequested", recordedAt: date, note: "Revisar medidas" };
const task = { ...inProgressTask, id: taskId, projectId: id, type: "PresentQuotationToClient" as const, area: "Commercial" as const, completedAt: null, assignedToGoogleSubject: user.subject };
const recorded = { outcome: decision, task: { ...task, status: "Completed", completedAt: date, wasOverdue: false, leadTimeStatus: "CompletedOnTime" } };

describe("client decision contract", () => {
  it("preserves absence and explicit recorded evidence including RFC3339 offsets", () => {
    expect(parseDecision(absent, id)).toEqual(absent);
    expect(parseDecision(decision, id)).toEqual(decision);
    expect(parseRecordedDecision(recorded, id)).toEqual(recorded);
  });
  it.each([{ decision: "Unknown" }, { extra: true }, { projectId: taskId }, { recordedAt: "invalid" },
    { recordedAt: "2026-10-28T13:00:00" }, { available: false }, { note: "a".repeat(2001) }, { presentQuotationTaskId: null }])("rejects invalid read %j", change => {
    expect(() => parseDecision({ ...decision, ...change }, id)).toThrow(ApiError);
  });
  it("rejects a mismatched or incomplete task response", () => {
    for (const change of [{ projectId: taskId }, { status: "InProgress" }, { id }, { completedAt: null }, { extra: true }]) {
      expect(() => parseRecordedDecision({ ...recorded, task: { ...recorded.task, ...change } }, id)).toThrow(ApiError);
    }
  });
});

describe("advisor decision card", () => {
  it("confirms once, posts the chosen outcome and rereads official state", async () => {
    let saved = false;
    const refresh = vi.fn().mockResolvedValue(undefined);
    const fetch = mockBackend((path, init) => {
      expect(path).toBe(`projects/${id}/client-quotation-decision`);
      if (init.method === "POST") {
        expect(JSON.parse(init.body as string)).toEqual({ decision: "ChangesRequested", note: "Revisar medidas" });
        saved = true; return recorded;
      }
      return saved ? decision : absent;
    });
    renderOperational(<ClientDecisionCard projectId={id} tasks={[task]} onRefresh={refresh} />);
    await userEvent.click(await screen.findByLabelText("Solicitó cambios"));
    await userEvent.type(screen.getByLabelText("Nota opcional"), "Revisar medidas");
    await userEvent.click(screen.getByRole("button", { name: "Registrar respuesta" }));
    expect(screen.getByText(/no podrá editarse/)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Confirmar respuesta" });
    fireEvent.click(button); fireEvent.click(button);
    expect(await screen.findByText("Respuesta registrada.")).toBeInTheDocument();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetch.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
    expect(fetch.mock.calls.filter(([, init]) => init.method === "GET")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Registrar respuesta" })).not.toBeInTheDocument();
    expect(screen.getByText("Nota: Revisar medidas")).toBeInTheDocument();
  });
  it("restores recorded read-only evidence on remount", async () => {
    mockBackend(() => decision);
    const mounted = renderOperational(<ClientDecisionCard projectId={id} tasks={[task]} onRefresh={vi.fn()} />);
    expect(await screen.findByText("Solicitó cambios")).toBeInTheDocument();
    mounted.unmount();
    renderOperational(<ClientDecisionCard projectId={id} tasks={[task]} onRefresh={vi.fn()} />);
    expect(await screen.findByText("Nota: Revisar medidas")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
  it.each(["other", "pending", "management"])("does not permit writes for %s", async kind => {
    mockBackend(() => absent);
    renderOperational(<ClientDecisionCard projectId={id} tasks={[{ ...task, assignedToGoogleSubject: kind === "other" ? "another" : user.subject,
      status: kind === "pending" ? "Pending" : "InProgress" }]} onRefresh={vi.fn()} />,
      kind === "management" ? { ...user, roles: ["Management"] } : user);
    expect(await screen.findByText(/No hay una respuesta/)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
  it("handles AlreadyRecorded safely and refreshes authoritative evidence", async () => {
    let saved = false;
    mockBackend((_, init) => {
      if (init.method === "POST") { saved = true; return Response.json({ code: "AlreadyRecorded", detail: "private detail" }, { status: 409 }); }
      return saved ? decision : absent;
    });
    renderOperational(<ClientDecisionCard projectId={id} tasks={[task]} onRefresh={vi.fn()} />);
    await userEvent.click(await screen.findByLabelText("Rechazó la cotización"));
    await userEvent.click(screen.getByRole("button", { name: "Registrar respuesta" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar respuesta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ya fue registrada");
    expect(await screen.findByText("Nota: Revisar medidas")).toBeInTheDocument();
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  });
});
