import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ProjectDetailPage } from "@/features/projects/ProjectDetailPage";
import type { BudgetQuotationStatusResponse } from "@/features/budgetQuotation/types";
import { client, project, inProgressTask, notification, deferred, mockBackend, renderOperational } from "./operationalFixtures";
import { projectDocuments } from "./documentFixtures";
import { confirmedStatus, notConfirmedStatus, sentStatus, sentQuotation } from "./budgetQuotationFixtures";
import { user, token } from "./fixtures";

const assigned = { ...user, roles: ["Budgets" as const], subject: inProgressTask.assignedToGoogleSubject! };
const panel = () => within(screen.getByRole("region", { name: "Cotización de Presupuestos" }));
function backend(initial: BudgetQuotationStatusResponse = confirmedStatus) {
  const state = { status: initial, tasks: initial.status === "SentToCommercial" ? [sentQuotation.budgetTask, sentQuotation.commercialTask] : [inProgressTask],
    notifications: [notification], statusError: false, relatedError: false };
  let send: (init: RequestInit) => unknown = () => {
    state.status = sentStatus; state.tasks = [sentQuotation.budgetTask, sentQuotation.commercialTask];
    state.notifications = [{ ...notification, title: "Revisión Comercial asignada por backend" }]; return sentQuotation;
  };
  const fetchMock = mockBackend((path, init) => {
    if (init.method === "POST") { expect(path).toBe("projects/project-1/send-to-commercial"); return send(init); }
    if (path.endsWith("/budget-quotation/status")) return state.statusError ? Response.json({}, { status: 503 }) : state.status;
    if (path.endsWith("/tasks")) return state.relatedError ? Response.json({}, { status: 503 }) : state.tasks;
    if (path.endsWith("/notifications")) return state.notifications;
    if (path.endsWith("/documents")) return { ...projectDocuments, canSendToBudgets: false };
    if (path.startsWith("clients/")) return client;
    return { ...project, sgCode: "SG001" };
  });
  return { state, fetchMock, setSend: (handler: typeof send) => { send = handler; } };
}
const sends = (fetchMock: ReturnType<typeof mockBackend>) => fetchMock.mock.calls.filter(([, init]) => init.method === "POST");
async function askToSend() {
  await userEvent.click(await screen.findByRole("button", { name: "Enviar a Comercial" }));
  return panel().getByRole("button", { name: "Confirmar envío" });
}

describe("persistent budget quotation status", () => {
  it("loads NotConfirmed before offering the 4C editor", async () => {
    const { fetchMock } = backend(notConfirmedStatus);
    renderOperational(<ProjectDetailPage id="project-1" />, assigned);
    expect(await screen.findByLabelText("Seleccionar archivo")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([path]) => path.endsWith("/budget-quotation/status"))).toBe(true);
    expect(screen.queryByRole("button", { name: "Enviar a Comercial" })).not.toBeInTheDocument();
  });
  it("recovers confirmed summary and send capability on every fresh mount without local confirm", async () => {
    const { fetchMock } = backend();
    const first = renderOperational(<ProjectDetailPage id="project-1" />, assigned);
    await screen.findByText("Cotización confirmada");
    for (const label of ["Versión", "Fecha de confirmación", "Cantidad de ítems", "Cantidad total"]) expect(panel().getByText(label)).toBeInTheDocument();
    expect(panel().queryByLabelText("Seleccionar archivo")).not.toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "Confirmar cotización" })).not.toBeInTheDocument();
    first.unmount(); renderOperational(<ProjectDetailPage id="project-1" />, assigned);
    expect(await screen.findByRole("button", { name: "Enviar a Comercial" })).toBeEnabled();
    expect(sends(fetchMock)).toHaveLength(0);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/budget-quotation/status"))).toHaveLength(2);
  });
  it("Completed + SentToCommercial preserves a read-only historical summary after reload", async () => {
    backend(sentStatus); const view = renderOperational(<ProjectDetailPage id="project-1" />, assigned);
    expect(await screen.findByText("Enviada a Comercial")).toBeInTheDocument();
    expect(panel().getByText(/preparación de Presupuestos finalizó/)).toBeInTheDocument();
    expect(panel().queryByRole("button")).not.toBeInTheDocument();
    expect(panel().queryByLabelText("Seleccionar archivo")).not.toBeInTheDocument();
    view.unmount(); renderOperational(<ProjectDetailPage id="project-1" />, assigned);
    await screen.findByText("Enviada a Comercial");
    expect(panel().queryByRole("button", { name: "Enviar a Comercial" })).not.toBeInTheDocument();
  });
  it("does not claim an active review after ReviewQuotation is completed", async () => {
    const { state } = backend(sentStatus); state.tasks[1] = { ...sentQuotation.commercialTask, status: "Completed" };
    renderOperational(<ProjectDetailPage id="project-1" />, assigned);
    expect(await screen.findByText(/revisión Comercial ya finalizó/)).toBeInTheDocument();
  });
  it("a different subject neither reads status nor receives budget controls", async () => {
    const { fetchMock } = backend(); renderOperational(<ProjectDetailPage id="project-1" />, user);
    await screen.findByRole("heading", { name: project.name });
    expect(screen.queryByRole("region", { name: "Cotización de Presupuestos" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([path]) => path.endsWith("/budget-quotation/status"))).toBe(false);
  });
  it.each(["SgChangedAfterConfirmation", "InvalidState"] as const)("explains %s without send or repair controls", async (sendBlockReason) => {
    backend({ ...confirmedStatus, canSendToCommercial: false, sendBlockReason, currentProjectSgCode: "SG002" });
    renderOperational(<ProjectDetailPage id="project-1" />, assigned); await screen.findByText("Cotización confirmada");
    expect(panel().getByRole("alert")).toHaveTextContent(sendBlockReason === "InvalidState" ? "estado actual del proyecto no permite" : "SG diferente");
    if (sendBlockReason === "SgChangedAfterConfirmation") {
      expect(panel().getByText("SG cotización: SG001")).toBeInTheDocument(); expect(panel().getByText("SG proyecto: SG002")).toBeInTheDocument();
    }
    expect(panel().queryByRole("button", { name: "Enviar a Comercial" })).not.toBeInTheDocument();
    expect(panel().queryByLabelText("Seleccionar archivo")).not.toBeInTheDocument();
  });
  it("loading and failed status never enable upload/send; retry is GET only", async () => {
    const { state, fetchMock } = backend(); state.statusError = true;
    renderOperational(<ProjectDetailPage id="project-1" />, assigned);
    expect(await screen.findByRole("button", { name: "Actualizar estado" })).toBeInTheDocument();
    expect(panel().queryByLabelText("Seleccionar archivo")).not.toBeInTheDocument();
    state.statusError = false; await userEvent.click(panel().getByRole("button", { name: "Actualizar estado" }));
    expect(await screen.findByRole("button", { name: "Enviar a Comercial" })).toBeInTheDocument(); expect(sends(fetchMock)).toHaveLength(0);
  });
});

describe("human-confirmed commercial handoff", () => {
  it("first click and Cancel do not send; explicit confirm sends bodyless once and refreshes backend tasks/activity/status", async () => {
    const { fetchMock } = backend(); renderOperational(<ProjectDetailPage id="project-1" />, assigned);
    await askToSend(); expect(sends(fetchMock)).toHaveLength(0);
    await userEvent.click(panel().getByRole("button", { name: "Cancelar" })); expect(sends(fetchMock)).toHaveLength(0);
    const confirm = await askToSend(); fireEvent.click(confirm); fireEvent.click(confirm);
    await screen.findByText("Cotización enviada a Comercial."); await screen.findByText("Enviada a Comercial");
    expect(sends(fetchMock)).toHaveLength(1);
    const [path, init] = sends(fetchMock)[0];
    expect(path).toBe("/api/backend/projects/project-1/send-to-commercial"); expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).get("Content-Type")).toBeNull();
    await screen.findByText("Revisión Comercial asignada por backend");
    const tasks = within(screen.getByRole("region", { name: "Tareas del proyecto" }));
    expect(tasks.getByText("Completada")).toBeInTheDocument(); expect(tasks.getByText("En curso")).toBeInTheDocument();
    expect(tasks.getByRole("heading", { name: "Revisar cotización" })).toBeInTheDocument();
    expect(tasks.getByText(/26\/10\/2026/)).toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "Enviar a Comercial" })).not.toBeInTheDocument();
    for (const suffix of ["/tasks", "/notifications", "/budget-quotation/status"]) expect(fetchMock.mock.calls.filter(([url]) => url.endsWith(suffix)).length).toBeGreaterThanOrEqual(2);
  });
  it("blocks duplicate submits and SG changes; aborts send on unmount and ignores late response", async () => {
    const { fetchMock, setSend } = backend(); const pending = deferred<unknown>(); setSend(() => pending.promise);
    const view = renderOperational(<ProjectDetailPage id="project-1" />, assigned);
    const confirm = await askToSend(); fireEvent.click(confirm); fireEvent.click(confirm);
    expect(confirm).toBeDisabled(); expect(screen.getByLabelText("Código SG")).toBeDisabled(); expect(sends(fetchMock)).toHaveLength(1);
    const signal = sends(fetchMock)[0][1].signal!; view.unmount(); expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(sentQuotation)); expect(screen.queryByText("Cotización enviada a Comercial.")).not.toBeInTheDocument();
  });
  it.each([
    ["AlreadySent", "ya fue enviada"], ["InvalidState", "estado válido"], ["SgChangedAfterConfirmation", "SG actual del proyecto no coincide"],
    ["DocumentMismatch", "cambió durante el envío"], ["DocumentUnavailable", "encontrar el archivo confirmado"],
  ])("maps safe 409 %s and refreshes status/tasks", async (code, expected) => {
    const { fetchMock, setSend, state } = backend();
    setSend(() => {
      if (code === "AlreadySent") { state.status = sentStatus; state.tasks = [sentQuotation.budgetTask, sentQuotation.commercialTask]; }
      return Response.json({ extensions: { code }, detail: token, stackTrace: "private/path" }, { status: 409 });
    });
    renderOperational(<ProjectDetailPage id="project-1" />, assigned); await userEvent.click(await askToSend());
    expect(await panel().findByRole("alert")).toHaveTextContent(expected);
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/budget-quotation/status"))).toHaveLength(2));
    if (code === "AlreadySent") { await screen.findByText("Enviada a Comercial"); expect(panel().queryByRole("button", { name: "Enviar a Comercial" })).not.toBeInTheDocument(); }
    expect(screen.queryByText(/private\/path|test-only-opaque/)).not.toBeInTheDocument(); expect(sends(fetchMock)).toHaveLength(1);
  });
  it("retains official successful tasks when refresh fails; retries only reads", async () => {
    const { setSend, state, fetchMock } = backend();
    setSend(() => { state.status = sentStatus; state.tasks = [sentQuotation.budgetTask, sentQuotation.commercialTask]; state.statusError = true; state.relatedError = true; return sentQuotation; });
    renderOperational(<ProjectDetailPage id="project-1" />, assigned); await userEvent.click(await askToSend());
    await screen.findByText("Cotización enviada a Comercial.");
    await screen.findByRole("button", { name: "Actualizar estado" }); await screen.findByRole("button", { name: "Actualizar actividad" });
    expect(within(screen.getByRole("region", { name: "Tareas del proyecto" })).getByRole("heading", { name: "Revisar cotización" })).toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "Enviar a Comercial" })).not.toBeInTheDocument();
    state.statusError = false; state.relatedError = false;
    await userEvent.click(panel().getByRole("button", { name: "Actualizar estado" })); await userEvent.click(panel().getByRole("button", { name: "Actualizar actividad" }));
    await screen.findByText("Enviada a Comercial"); expect(sends(fetchMock)).toHaveLength(1);
  });
});
