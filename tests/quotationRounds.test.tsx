import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseQuotationRounds, parseRequestedRequotation } from "@/features/quotationRounds/contracts";
import { QuotationRoundsPanel } from "@/features/quotationRounds/QuotationRoundsPanel";
import { parseStatus } from "@/features/budgetQuotation/parser";
import { latestQuotationTask } from "@/features/tasks/types";
import { renderOperational, inProgressTask } from "./operationalFixtures";
import { confirmedStatus } from "./budgetQuotationFixtures";
import { user } from "./fixtures";

const id = "11111111-1111-4111-8111-111111111111";
const taskId = "22222222-2222-4222-8222-222222222222";
const date = "2026-10-28T13:00:00-05:00";
const present = { ...inProgressTask, id: taskId, projectId: id, type: "PresentQuotationToClient" as const, area: "Commercial" as const, status: "Completed" as const, completedAt: date, assignedToGoogleSubject: user.subject };
const prepare = { ...inProgressTask, projectId: id, quotationRound: 2 };
const decision = { quotationRound: 1, available: true, projectId: id, commercialQuotationId: taskId, presentQuotationTaskId: taskId, decision: "ChangesRequested", note: "Client note is not the request", recordedAt: date };
const first = { roundNumber: 1, prepareQuotationTask: null, reviewQuotationTask: null, presentQuotationTask: present, budgetQuotation: null,
  commercialQuotation: { versionNumber: 1, confirmedAt: date, projectTotal: 100, currencyCode: "COP" },
  clientDecision: { decision: "ChangesRequested", note: decision.note, recordedAt: date }, requotationRequest: null };
const second = { ...first, roundNumber: 2, prepareQuotationTask: prepare, presentQuotationTask: null, commercialQuotation: null, clientDecision: null,
  requotationRequest: { targetQuotationRound: 2, requestedChanges: "Cambiar vidrio", requestedAt: date } };
const history = { projectId: id, total: 2, returned: 2, hasMore: false, rounds: [first, second] };
const response = { request: { ...second.requotationRequest, projectId: id, sourceDecisionId: taskId }, prepareQuotationTask: prepare };

describe("quotation rounds", () => {
  it("preserves partial rounds and an active round distinct from last confirmed version", () => {
    expect(parseQuotationRounds(history, id)).toEqual(history);
    expect(parseRequestedRequotation(response, id)).toEqual(response);
    const status = { ...confirmedStatus, projectId: id, quotationRound: 2, status: "NotConfirmed", canSendToCommercial: false };
    expect(parseStatus(status, id)).toEqual(status);
    expect(latestQuotationTask([{ ...prepare, quotationRound: 1, status: "Completed" }, prepare], "PrepareQuotation")).toEqual(prepare);
  });
  it.each([
    { total: 3 }, { hasMore: true }, { rounds: [second, first] }, { rounds: [first, first] }, { storageKey: "private" },
    { rounds: [first, { ...second, prepareQuotationTask: { ...prepare, quotationRound: null } }] },
    { rounds: [{ ...first, commercialQuotation: { ...first.commercialQuotation, versionNumber: 2 } }, second] },
    { rounds: [first, { ...second, requotationRequest: { ...second.requotationRequest, targetQuotationRound: 3 } }] },
  ])("rejects inconsistent or private history", change => expect(() => parseQuotationRounds({ ...history, ...change }, id)).toThrow());
  it("requires explicit formal changes and confirmation; reloading reads official history", async () => {
    let saved = false;
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      if (init.method === "POST") { saved = true; expect(JSON.parse(String(init.body))).toEqual({ requestedChanges: "Cambiar vidrio" }); return Response.json(response, { status: 201 }); }
      return Response.json(url.endsWith("/quotation-rounds") ? saved ? history : { ...history, total: 1, returned: 1, rounds: [first] } : decision);
    }); vi.stubGlobal("fetch", fetch);
    const refresh = vi.fn(async () => {});
    const view = renderOperational(<QuotationRoundsPanel projectId={id} tasks={[present]} onRefresh={refresh} />);
    const input = await screen.findByRole("textbox"); expect(input).toHaveValue("");
    expect(screen.getByRole("button", { name: "Enviar a Presupuestos" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "Cambiar vidrio" } }); fireEvent.click(screen.getByRole("button", { name: "Enviar a Presupuestos" }));
    expect(fetch.mock.calls.filter(([,init]) => init.method === "POST")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar nueva ronda" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    await screen.findByText("Cambiar vidrio"); expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); view.unmount();
    renderOperational(<QuotationRoundsPanel projectId={id} tasks={[present, prepare]} onRefresh={refresh} />);
    await screen.findByText("Cambiar vidrio"); expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(fetch.mock.calls.filter(([,init]) => init.method === "POST")).toHaveLength(1);
  });
});
