import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectDetailPage } from "@/features/projects/ProjectDetailPage";
import { AuthContext } from "@/features/auth/context/AuthProvider";
import { createApiClient } from "@/lib/api/apiClient";
import type { CurrentUser } from "@/features/auth/types/auth";
import type { ProjectTask } from "@/features/tasks/types";
import { client, project, task, inProgressTask, deferred, mockBackend, renderOperational } from "./operationalFixtures";
import { projectDocuments } from "./documentFixtures";
import { quotationConfirmed, quotationPreview, notConfirmedStatus, confirmedStatus } from "./budgetQuotationFixtures";
import { token, user } from "./fixtures";

const assignedUser = { ...user, subject: inProgressTask.assignedToGoogleSubject! };
const file = () => new File(["opaque workbook test bytes"], "cotizacion.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
function backend(tasks: ProjectTask[] = [inProgressTask], sgCode: string | null = "SG001") {
  let status = notConfirmedStatus;
  let mutation: (path: string, init: RequestInit) => unknown = (path) => path.endsWith("/preview") ? quotationPreview : quotationConfirmed;
  const fetchMock = mockBackend(async (path, init) => {
    if (init.method !== "GET") {
      const response = await mutation(path, init);
      if (path.endsWith("/confirm") && !(response instanceof Response)) status = confirmedStatus;
      return response;
    }
    if (path.endsWith("/budget-quotation/status")) return { ...status, projectId: path.split("/")[1] };
    if (path.endsWith("/tasks")) return tasks;
    if (path.endsWith("/notifications")) return [];
    if (path.endsWith("/documents")) return { ...projectDocuments, canSendToBudgets: false };
    if (path.startsWith("clients/")) return client;
    return { ...project, id: path.split("/")[1], sgCode };
  });
  return { fetchMock, setMutation: (handler: typeof mutation) => { mutation = handler; } };
}
const quotation = () => within(screen.getByRole("region", { name: "Cotización de Presupuestos" }));
const calls = (fetchMock: ReturnType<typeof mockBackend>) => fetchMock.mock.calls.filter(([, init]) => init.method === "POST");
async function openPreview(selected = file()) {
  await userEvent.upload(await screen.findByLabelText("Seleccionar archivo"), selected);
  await userEvent.click(quotation().getByRole("button", { name: "Generar preview" }));
  await quotation().findByRole("heading", { name: "Preview técnico" });
  return selected;
}

describe("quotation visibility", () => {
  it.each([
    { tasks: [], sg: "SG001", current: assignedUser },
    { tasks: [task], sg: "SG001", current: assignedUser },
    { tasks: [inProgressTask], sg: "SG001", current: user },
  ])("does not offer quotation outside assigned InProgress + SG ($tasks.0.status / $sg)", async ({ tasks, sg, current }) => {
    backend(tasks, sg); renderOperational(<ProjectDetailPage id="project-1" />, current);
    await screen.findByRole("heading", { name: project.name });
    expect(screen.queryByRole("region", { name: "Cotización de Presupuestos" })).not.toBeInTheDocument();
  });
  it("depends on subject, not email/name", async () => {
    backend(); renderOperational(<ProjectDetailPage id="project-1" />, { ...assignedUser, email: "changed@example.test", name: "Changed" });
    expect(await screen.findByLabelText("Seleccionar archivo")).toBeInTheDocument();
  });
});
describe("quotation preview and editor", () => {
  it("renders metadata, original item order, sections, raster image and nonblocking warnings; exactly 11 editable fields per item", async () => {
    backend(); renderOperational(<ProjectDetailPage id="project-1" />, assignedUser); await openPreview();
    for (const text of ["Cliente documental", "Proyecto documental", "Preparador de prueba", "Principales", "Adicionales", "Sin imagen asociada", "Imagen no asociada por ambigüedad"]) {
      expect(quotation().getByText(text)).toBeInTheDocument();
    }
    expect(quotation().getAllByRole("group").map((group) => group.querySelector("legend")?.textContent)).toEqual(["Ítem V-2", "Ítem V-1", "Ítem A-1"]);
    const first = within(quotation().getByRole("group", { name: "Ítem V-2" }));
    expect(first.getAllByRole("textbox")).toHaveLength(7); expect(first.getAllByRole("spinbutton")).toHaveLength(4);
    expect(quotation().queryByLabelText(/section|sourcerow|SG/i)).not.toBeInTheDocument();
    expect(first.getByRole("img", { name: "Imagen del ítem V-2" })).toHaveAttribute("src", `data:image/png;base64,${quotationPreview.items[0].image!.base64}`);
    expect(quotation().getByRole("complementary", { name: "Advertencias de extracción" })).toHaveTextContent("no impiden confirmar");
    expect(quotation().getByRole("button", { name: "Confirmar cotización" })).toBeEnabled();
    fireEvent.change(first.getByLabelText("Ancho (m)"), { target: { value: "10" } });
    expect(first.getByLabelText("Superficie (m²)")).toHaveValue(5.75);
  });
  it.each(["invalid.xls", "invalid.csv", "invalid.xlsm"])("rejects %s without upload", async (name) => {
    const { fetchMock } = backend(); renderOperational(<ProjectDetailPage id="project-1" />, assignedUser);
    fireEvent.change(await screen.findByLabelText("Seleccionar archivo"), { target: { files: [new File(["x"], name)] } });
    expect(quotation().getByRole("alert")).toHaveTextContent("un solo archivo .xlsx");
    expect(quotation().getByRole("button", { name: "Generar preview" })).toBeDisabled(); expect(calls(fetchMock)).toHaveLength(0);
  });
  it("file replacement clears draft and warnings before another preview", async () => {
    backend(); renderOperational(<ProjectDetailPage id="project-1" />, assignedUser); await openPreview();
    fireEvent.change(quotation().getAllByLabelText("Ubicación")[0], { target: { value: "Edited" } });
    await userEvent.upload(screen.getByLabelText("Seleccionar archivo"), new File(["new bytes"], "replacement.xlsx"));
    expect(quotation().queryByRole("heading", { name: "Preview técnico" })).not.toBeInTheDocument();
    expect(quotation().queryByRole("button", { name: "Confirmar cotización" })).not.toBeInTheDocument();
    expect(quotation().queryByText("Edited")).not.toBeInTheDocument();
    expect(quotation().queryByRole("complementary")).not.toBeInTheDocument();
    await userEvent.click(quotation().getByRole("button", { name: "Generar preview" }));
    expect((await quotation().findAllByLabelText("Ubicación"))[0]).toHaveValue("Sala");
  });
  it("blocks double preview, file/SG changes while running, and aborts on unmount", async () => {
    const { fetchMock, setMutation } = backend(); const pending = deferred<unknown>(); setMutation(() => pending.promise);
    const view = renderOperational(<ProjectDetailPage id="project-1" />, assignedUser);
    await userEvent.upload(await screen.findByLabelText("Seleccionar archivo"), file());
    const button = quotation().getByRole("button", { name: "Generar preview" }); fireEvent.click(button); fireEvent.click(button);
    expect(calls(fetchMock)).toHaveLength(1); expect(button).toBeDisabled();
    expect(screen.getByLabelText("Seleccionar archivo")).toBeDisabled(); expect(screen.getByLabelText("Código SG")).toBeDisabled();
    const signal = calls(fetchMock)[0][1].signal!;
    view.unmount(); expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(quotationPreview));
    expect(screen.queryByText("Preview técnico")).not.toBeInTheDocument();
  });
  it.each([[400, "UnsupportedWorkbookFormat", "formato de cotización soportado"], [409, "SgCodeMismatch", "SG de la cotización no coincide"], [403, undefined, "No tienes permiso"], [404, undefined, "No se encontró el proyecto"]] as const)("handles preview %s/%s", async (status, code, message) => {
    const { setMutation } = backend(); setMutation(() => Response.json({ code, detail: "private-path-token" }, { status }));
    renderOperational(<ProjectDetailPage id="project-1" />, assignedUser);
    await userEvent.upload(await screen.findByLabelText("Seleccionar archivo"), file());
    await userEvent.click(quotation().getByRole("button", { name: "Generar preview" }));
    expect(await quotation().findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText(/private-path-token/)).not.toBeInTheDocument();
  });
});
describe("quotation confirmation", () => {
  it("confirms once using same File, backend totals and differences; task remains InProgress with unchanged dates", async () => {
    const { fetchMock, setMutation } = backend(); const pending = deferred<unknown>();
    setMutation((path) => path.endsWith("/preview") ? quotationPreview : pending.promise);
    renderOperational(<ProjectDetailPage id="project-1" />, assignedUser); const selected = await openPreview();
    const before = screen.getByRole("region", { name: "Tareas del proyecto" }).textContent;
    const first = within(quotation().getByRole("group", { name: "Ítem V-2" }));
    fireEvent.change(first.getByLabelText("Ubicación"), { target: { value: "  Terraza  " } });
    const form = quotation().getByRole("button", { name: "Confirmar cotización" }).closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(calls(fetchMock)).toHaveLength(2);
    expect(quotation().getByRole("button", { name: "Confirmar cotización" })).toBeDisabled();
    expect(screen.getByLabelText("Seleccionar archivo")).toBeDisabled();
    for (const [, init] of calls(fetchMock)) expect((init.body as FormData).get("file")).toBe(selected);
    const response = structuredClone(quotationConfirmed); response.items[0].confirmed.location = "Terraza";
    await act(async () => pending.resolve(response));
    expect(await quotation().findByText("Cotización de Presupuestos confirmada.")).toBeInTheDocument();
    expect(quotation().getByText("1 ítem fue ajustado antes de confirmar.")).toBeInTheDocument();
    expect(quotation().getByText(/proyecto continúa en Presupuestos/)).toBeInTheDocument();
    expect(await quotation().findByRole("button", { name: "Enviar a Comercial" })).toBeInTheDocument();
    expect(quotation().queryByText(/version-1|catalog-1/)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tareas del proyecto" }).textContent).toBe(before);
    expect(calls(fetchMock).map(([url]) => url)).not.toContain(expect.stringContaining("send-to-commercial"));
  });
  it("does not claim adjustments when backend reports none", async () => {
    backend(); renderOperational(<ProjectDetailPage id="project-1" />, assignedUser); await openPreview();
    await userEvent.click(quotation().getByRole("button", { name: "Confirmar cotización" }));
    await quotation().findByText("Cotización de Presupuestos confirmada.");
    expect(quotation().queryByText(/ajustado/)).not.toBeInTheDocument();
  });
  it.each([["Cantidad", "1.5"], ["Ancho (m)", "0"], ["Alto (m)", "-1"], ["Superficie (m²)", "0"], ["Número de ítem", "  "]])("blocks invalid %s=%s", async (label, value) => {
    const { fetchMock } = backend(); renderOperational(<ProjectDetailPage id="project-1" />, assignedUser); await openPreview();
    fireEvent.change(quotation().getAllByLabelText(label)[0], { target: { value } });
    await userEvent.click(quotation().getByRole("button", { name: "Confirmar cotización" }));
    expect(quotation().getByRole("alert")).toHaveTextContent("Revisa los ítems"); expect(calls(fetchMock)).toHaveLength(1);
  });
  it.each([[409, "AlreadyConfirmed", "ya está confirmada"], [400, "InvalidConfirmation", "todos los ítems"], [409, "SgCodeMismatch", "SG de la cotización no coincide"]] as const)("keeps preview after safe confirm %s/%s", async (status, code, message) => {
    const { setMutation } = backend(); setMutation((path) => path.endsWith("/preview") ? quotationPreview : Response.json({ code, detail: token }, { status }));
    renderOperational(<ProjectDetailPage id="project-1" />, assignedUser); await openPreview();
    await userEvent.click(quotation().getByRole("button", { name: "Confirmar cotización" }));
    expect(await quotation().findByRole("alert")).toHaveTextContent(message);
    expect(quotation().getByRole("heading", { name: "Preview técnico" })).toBeInTheDocument();
    expect(quotation().queryByText("Cotización de Presupuestos confirmada.")).not.toBeInTheDocument();
  });
});
describe("quotation lifecycle", () => {
  const apiClient = createApiClient({ getSession: () => ({ token, generation: 1 }), invalidateSession: vi.fn() });
  function Harness({ current = assignedUser, id = "project-1" }: { current?: CurrentUser; id?: string }) {
    return <AuthContext.Provider value={{ status: "authenticated", user: current, error: null, signIn: vi.fn(), logout: vi.fn(), invalidateSession: vi.fn(), apiClient }}><ProjectDetailPage id={id} /></AuthContext.Provider>;
  }
  it("identity change clears private preview/draft without storage writes", async () => {
    backend(); const storage = vi.spyOn(Storage.prototype, "setItem"); const view = render(<Harness />); await openPreview();
    view.rerender(<Harness current={user} />);
    await screen.findByRole("heading", { name: project.name });
    expect(screen.queryByText("Preview técnico")).not.toBeInTheDocument(); expect(storage).not.toHaveBeenCalled();
  });
  it.each(["identity", "project"])("aborts pending response on %s change and ignores late completion", async (change) => {
    const { fetchMock, setMutation } = backend(); const pending = deferred<unknown>(); setMutation(() => pending.promise);
    const view = render(<Harness />);
    await userEvent.upload(await screen.findByLabelText("Seleccionar archivo"), file());
    await userEvent.click(quotation().getByRole("button", { name: "Generar preview" }));
    const signal = calls(fetchMock)[0][1].signal!;
    view.rerender(change === "identity" ? <Harness current={user} /> : <Harness id="project-2" />);
    await waitFor(() => expect(signal.aborted).toBe(true));
    await act(async () => pending.resolve(quotationPreview));
    expect(screen.queryByText("Preview técnico")).not.toBeInTheDocument();
  });
});
