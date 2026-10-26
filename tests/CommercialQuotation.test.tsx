import { roleContext } from "./roleFixtures";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectDetailPage } from "@/features/projects/ProjectDetailPage";
import { AuthContext } from "@/features/auth/context/AuthProvider";
import { createApiClient } from "@/lib/api/apiClient";
import type { CurrentUser } from "@/features/auth/types/auth";
import type { ProjectTask } from "@/features/tasks/types";
import { commercialQuotationError } from "@/features/commercialQuotation/validation";
import { ApiError } from "@/lib/api/apiError";
import { client, project, deferred, mockBackend, renderOperational } from "./operationalFixtures";
import { handedOffDocuments } from "./documentFixtures";
import { commercialPreview, commercialConfirmation, commercialUser, reviewTask } from "./commercialQuotationFixtures";
import { token, user } from "./fixtures";

const xlsx = (name = "revisada.xlsx") => new File(["opaque workbook"], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
function backend(initial: ProjectTask[] = [reviewTask]) {
  let tasks = initial;
  let mutation: (path: string, init: RequestInit) => unknown = (path) => path.endsWith("/preview") ? commercialPreview : commercialConfirmation;
  const fetchMock = mockBackend(async (path, init) => {
    if (init.method === "POST") {
      const response = await mutation(path, init);
      if (path.endsWith("/confirm") && !(response instanceof Response)) tasks = [commercialConfirmation.reviewTask, commercialConfirmation.presentQuotationToClientTask];
      return response;
    }
    if (path.endsWith("/tasks")) return tasks;
    if (path.endsWith("/notifications")) return [];
    if (path.endsWith("/documents")) return handedOffDocuments;
    if (path.endsWith("/file") || path.endsWith("/commercial-file")) return mutation(path, init);
    if (path.startsWith("clients/")) return client;
    return { ...project, sgCode: "SG001" };
  });
  return { fetchMock, setMutation: (handler: typeof mutation) => { mutation = handler; }, setTasks: (value: ProjectTask[]) => { tasks = value; } };
}
const panel = () => within(screen.getByRole("region", { name: "Revisión Comercial" }));
const posts = (fetchMock: ReturnType<typeof mockBackend>) => fetchMock.mock.calls.filter(([, init]) => init.method === "POST");
async function preview(file = xlsx()) {
  await userEvent.upload(await screen.findByLabelText("Seleccionar XLSX comercial"), file);
  await userEvent.click(panel().getByRole("button", { name: "Generar preview" }));
  await panel().findByRole("heading", { name: "Preview comercial" });
  return file;
}
async function prompt() { await userEvent.click(panel().getByRole("button", { name: "Confirmar cotización comercial" })); }

describe("commercial review visibility", () => {
  it.each([
    { tasks: [], current: commercialUser },
    { tasks: [{ ...reviewTask, status: "Pending" as const, startedAt: null, deadlineAt: null, wasOverdue: null, leadTimeStatus: "NotStarted" as const }], current: commercialUser },
    { tasks: [reviewTask], current: user },
    { tasks: [reviewTask], current: { ...user, isManagement: true } },
    { tasks: [commercialConfirmation.reviewTask], current: user },
  ])("hides review outside the assignee workflow ($tasks.0.status)", async ({ tasks, current }) => {
    backend(tasks); renderOperational(<ProjectDetailPage id="project-1" />, current);
    await screen.findByRole("heading", { name: project.name });
    expect(screen.queryByRole("region", { name: "Revisión Comercial" })).not.toBeInTheDocument();
  });
  it("uses subject, not email/name, for assigned InProgress", async () => {
    backend(); renderOperational(<ProjectDetailPage id="project-1" />, { ...commercialUser, email: "changed@example.test", name: "Changed" });
    expect(await screen.findByLabelText("Seleccionar XLSX comercial")).toBeEnabled();
  });
  it("reconstructs Completed and the advisor task after reload, with final download but no editor or invented value", async () => {
    backend([commercialConfirmation.reviewTask, commercialConfirmation.presentQuotationToClientTask]);
    const view = renderOperational(<ProjectDetailPage id="project-1" />, commercialUser);
    await screen.findByRole("heading", { name: "Revisión Comercial completada" }); view.unmount();
    renderOperational(<ProjectDetailPage id="project-1" />, commercialUser);
    await screen.findByRole("heading", { name: "Revisión Comercial completada" });
    expect(panel().getByRole("button", { name: "Descargar cotización final" })).toBeEnabled();
    expect(screen.queryByLabelText("Seleccionar XLSX comercial")).not.toBeInTheDocument();
    expect(panel().queryByText("Valor final")).not.toBeInTheDocument();
    const tasks = within(screen.getByRole("region", { name: "Tareas del proyecto" }));
    expect(tasks.getByText("Presentar cotización al cliente")).toBeInTheDocument();
    expect(tasks.getByText("Completada")).toBeInTheDocument(); expect(tasks.getByText("En curso")).toBeInTheDocument();
  });
});
describe("commercial readonly preview", () => {
  it("shows backend economics without calculations or rounding, received item order, sections and attributed differences", async () => {
    backend(); renderOperational(<ProjectDetailPage id="project-1" />, commercialUser); await preview();
    expect(panel().getByText(/987\.654,3217/)).toBeInTheDocument();
    expect(panel().getByText(/100,4567/)).toBeInTheDocument(); expect(panel().getByText(/7,125/)).toBeInTheDocument();
    expect(panel().getAllByRole("article").map((article) => within(article).getByRole("heading", { level: 4 }).textContent)).toEqual(["Ítem V-2", "Ítem A-1"]);
    expect(panel().getByText("Principales · Fila 15")).toBeInTheDocument(); expect(panel().getByText("Adicionales · Fila 120")).toBeInTheDocument();
    expect(panel().getByText("Antes (Presupuestos)")).toBeInTheDocument(); expect(panel().getByText("Ahora (Comercial)")).toBeInTheDocument();
    expect(panel().getByText("Templado 5 mm")).toBeInTheDocument();
    expect(panel().getByText("Sin cambios técnicos frente a Presupuestos.")).toBeInTheDocument();
    expect(panel().queryAllByRole("textbox")).toHaveLength(0); expect(panel().queryAllByRole("spinbutton")).toHaveLength(0);
    expect(panel().getByRole("region", { name: "Preview comercial" }).querySelectorAll("input,textarea,select")).toHaveLength(0);
  });
  it.each(["bad.xls", "bad.csv", "bad.xlsm"])("rejects %s before sending", async (name) => {
    const { fetchMock } = backend(); renderOperational(<ProjectDetailPage id="project-1" />, commercialUser);
    fireEvent.change(await screen.findByLabelText("Seleccionar XLSX comercial"), { target: { files: [xlsx(name)] } });
    expect(panel().getByRole("alert")).toHaveTextContent("un solo archivo .xlsx");
    expect(panel().getByRole("button", { name: "Generar preview" })).toBeDisabled(); expect(posts(fetchMock)).toHaveLength(0);
  });
  it("invalidates preview and human confirmation for a different File with the SAME filename", async () => {
    const { fetchMock } = backend(); renderOperational(<ProjectDetailPage id="project-1" />, commercialUser); await preview(); await prompt();
    await userEvent.upload(screen.getByLabelText("Seleccionar XLSX comercial"), xlsx());
    expect(panel().queryByRole("heading", { name: "Preview comercial" })).not.toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument(); expect(posts(fetchMock)).toHaveLength(1);
  });
  it("clears error on file replacement", async () => {
    const state = backend(); state.setMutation(() => Response.json({ code: "InvalidWorkbook" }, { status: 400 }));
    renderOperational(<ProjectDetailPage id="project-1" />, commercialUser);
    await userEvent.upload(await screen.findByLabelText("Seleccionar XLSX comercial"), xlsx());
    await userEvent.click(panel().getByRole("button", { name: "Generar preview" })); await panel().findByRole("alert");
    await userEvent.upload(screen.getByLabelText("Seleccionar XLSX comercial"), xlsx("replacement.xlsx"));
    expect(panel().queryByRole("alert")).not.toBeInTheDocument();
  });
  it("blocks duplicate preview and file changes during the upload", async () => {
    const state = backend(), pending = deferred<unknown>(); state.setMutation(() => pending.promise);
    renderOperational(<ProjectDetailPage id="project-1" />, commercialUser);
    await userEvent.upload(await screen.findByLabelText("Seleccionar XLSX comercial"), xlsx());
    const button = panel().getByRole("button", { name: "Generar preview" }); fireEvent.click(button); fireEvent.click(button);
    expect(posts(state.fetchMock)).toHaveLength(1); expect(screen.getByLabelText("Seleccionar XLSX comercial")).toBeDisabled();
    expect(panel().getByRole("button", { name: "Descargar cotización" })).toBeDisabled();
    await act(async () => pending.resolve(commercialPreview));
  });
  it.each(["StructuralMismatch", "InvalidEconomics", "SgCodeMismatch"])("rejects preview %s without offering confirmation", async (code) => {
    const state = backend(); state.setMutation(() => Response.json({ code }, { status: 409 }));
    renderOperational(<ProjectDetailPage id="project-1" />, commercialUser);
    await userEvent.upload(await screen.findByLabelText("Seleccionar XLSX comercial"), xlsx());
    await userEvent.click(panel().getByRole("button", { name: "Generar preview" }));
    expect(await panel().findByRole("alert")).toHaveTextContent(commercialQuotationError(new ApiError(409, { code })));
    expect(panel().queryByRole("button", { name: "Confirmar cotización comercial" })).not.toBeInTheDocument();
  });
});
describe("commercial confirmation", () => {
  it("requires human confirmation, cancel makes no call, submits same File only once, then displays official tasks and final value", async () => {
    const state = backend(); renderOperational(<ProjectDetailPage id="project-1" />, commercialUser);
    const selected = await preview(); await prompt(); expect(posts(state.fetchMock)).toHaveLength(1);
    await userEvent.click(panel().getByRole("button", { name: "Cancelar" })); expect(posts(state.fetchMock)).toHaveLength(1);
    await prompt();
    const pending = deferred<unknown>(); state.setMutation(() => pending.promise);
    const confirm = panel().getByRole("button", { name: "Confirmar" }); fireEvent.click(confirm); fireEvent.click(confirm);
    expect(posts(state.fetchMock)).toHaveLength(2);
    for (const [, init] of posts(state.fetchMock)) {
      expect([...(init.body as FormData).keys()]).toEqual(["file"]); expect((init.body as FormData).get("file")).toBe(selected);
    }
    expect(screen.getByLabelText("Seleccionar XLSX comercial")).toBeDisabled();
    await act(async () => pending.resolve(commercialConfirmation));
    await panel().findByText("Cotización comercial confirmada.");
    expect(panel().getByText(/987\.654,3217/)).toBeInTheDocument(); expect(screen.queryByLabelText("Seleccionar XLSX comercial")).not.toBeInTheDocument();
    const tasks = within(screen.getByRole("region", { name: "Tareas del proyecto" }));
    expect(tasks.getByText("Presentar cotización al cliente")).toBeInTheDocument();
    expect(tasks.getByText("Completada")).toBeInTheDocument(); expect(tasks.getByText("En curso")).toBeInTheDocument();
    expect(state.fetchMock.mock.calls.filter(([url]) => url.endsWith("/notifications"))).toHaveLength(2);
  });
  it("AlreadyConfirmed from another tab refreshes official tasks and removes controls", async () => {
    const state = backend(); renderOperational(<ProjectDetailPage id="project-1" />, commercialUser); await preview(); await prompt();
    state.setTasks([commercialConfirmation.reviewTask, commercialConfirmation.presentQuotationToClientTask]);
    state.setMutation(() => Response.json({ code: "AlreadyConfirmed" }, { status: 409 }));
    await userEvent.click(panel().getByRole("button", { name: "Confirmar" }));
    await panel().findByText("Revisión Comercial completada");
    expect(panel().getByRole("alert")).toHaveTextContent("ya fue confirmada"); expect(screen.queryByLabelText("Seleccionar XLSX comercial")).not.toBeInTheDocument();
  });
  it("retains authoritative confirmation and tasks when activity refresh fails", async () => {
    const state = backend(); renderOperational(<ProjectDetailPage id="project-1" />, commercialUser); await preview(); await prompt();
    const originalFetch = state.fetchMock.getMockImplementation()!;
    state.fetchMock.mockImplementation(async (url, init) => {
      if (url.endsWith("/notifications")) return Response.json({}, { status: 503 });
      return originalFetch(url, init);
    });
    await userEvent.click(panel().getByRole("button", { name: "Confirmar" }));
    await panel().findByText("Cotización comercial confirmada.");
    expect(await panel().findByRole("alert")).toHaveTextContent("No se pudo actualizar toda la actividad");
    expect(panel().getByRole("button", { name: "Actualizar actividad" })).toBeEnabled();
    expect(screen.queryByLabelText("Seleccionar XLSX comercial")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Tareas del proyecto" })).getByText("Presentar cotización al cliente")).toBeInTheDocument();
  });
  it.each(["ProjectCreatorUnavailable", "DocumentUnavailable", "StructuralMismatch", "InvalidWorkbook", "InvalidEconomics", "SgCodeMismatch", "InvalidWorkflowState", "Forbidden"])("renders safe %s without an optimistic transition", async (code) => {
    const state = backend(); renderOperational(<ProjectDetailPage id="project-1" />, commercialUser); await preview(); await prompt();
    const status = code === "Forbidden" ? 403 : 409;
    state.setMutation(() => Response.json({ code, missingItems: [{ section: "Main", sourceRow: 15 }], unexpectedItems: [{ section: "Additional", sourceRow: 120 }], detail: "private", stackTrace: "private" }, { status }));
    await userEvent.click(panel().getByRole("button", { name: "Confirmar" }));
    expect(await panel().findByRole("alert")).toHaveTextContent(commercialQuotationError(new ApiError(status, { code })));
    expect(panel().queryByText("Cotización comercial confirmada.")).not.toBeInTheDocument();
    if (code === "StructuralMismatch") { expect(panel().getByText("Principales: fila 15")).toBeInTheDocument(); expect(panel().getByText("Adicionales: fila 120")).toBeInTheDocument(); }
  });
});
describe("commercial download and identity cleanup", () => {
  it("saves the operational download with the backend filename", async () => {
    const state = backend(); state.setMutation(() => new Response(new Uint8Array([80, 75, 255]), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=official.xlsx" } }));
    vi.stubGlobal("showSaveFilePicker", undefined);
    vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:commercial-test"); static revokeObjectURL = vi.fn(); });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe("official.xlsx"); });
    renderOperational(<ProjectDetailPage id="project-1" />, commercialUser);
    await userEvent.click(await screen.findByRole("button", { name: "Descargar cotización" }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(state.fetchMock.mock.calls.some(([url]) => url.endsWith("/budget-quotation/commercial-file"))).toBe(true);
  });
  it("shows download errors without exposing diagnostics", async () => {
    const state = backend(); state.setMutation(() => Response.json({ code: "DocumentUnavailable", detail: "private" }, { status: 409 }));
    renderOperational(<ProjectDetailPage id="project-1" />, commercialUser);
    await userEvent.click(await screen.findByRole("button", { name: "Descargar cotización" }));
    expect(await panel().findByRole("alert")).toHaveTextContent("El archivo de cotización necesario");
  });
  it.each(["preview", "download", "confirm"])("aborts %s on identity change; no file/preview/prompt survives", async (action) => {
    const state = backend();
    const apiClient = createApiClient({ getSession: () => ({ token, generation: 1 , activeRole: "CommercialHead" as const}), invalidateSession: vi.fn() });
    function view(current: CurrentUser) { return <AuthContext.Provider value={{ status: "authenticated", ...roleContext("CommercialHead"), user: current, error: null, signIn: vi.fn(), logout: vi.fn(), invalidateSession: vi.fn(), apiClient }}><ProjectDetailPage id="project-1" /></AuthContext.Provider>; }
    const rendered = render(view(commercialUser));
    if (action === "confirm") { await preview(); await prompt(); }
    const pending = deferred<unknown>(); let signal: AbortSignal | undefined;
    state.setMutation((_, init) => { signal = init.signal as AbortSignal; return pending.promise; });
    if (action === "preview") { await userEvent.upload(await screen.findByLabelText("Seleccionar XLSX comercial"), xlsx()); await userEvent.click(panel().getByRole("button", { name: "Generar preview" })); }
    else await userEvent.click(await screen.findByRole("button", { name: action === "confirm" ? "Confirmar" : "Descargar cotización" }));
    await waitFor(() => expect(signal).toBeDefined());
    rendered.rerender(view(user)); expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve(action === "preview" ? commercialPreview : action === "confirm" ? commercialConfirmation : new Response(new Uint8Array([80, 75]))));
    await screen.findByRole("heading", { name: project.name }); expect(screen.queryByRole("region", { name: "Revisión Comercial" })).not.toBeInTheDocument();
    state.setTasks([reviewTask]); rendered.rerender(view(commercialUser));
    expect(await screen.findByLabelText("Seleccionar XLSX comercial")).toHaveValue("");
    expect(panel().queryByRole("heading", { name: "Preview comercial" })).not.toBeInTheDocument(); expect(panel().queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
  });
});
