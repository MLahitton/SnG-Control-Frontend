import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectDetailPage } from "@/features/projects/ProjectDetailPage";
import { BudgetQuotationReadView, CommercialQuotationReadView } from "@/features/quotationViews/QuotationReadViews";
import { parseBudgetView, parseCommercialView } from "@/features/quotationViews/contracts";
import type { AvailableRole } from "@/features/auth/types/auth";
import { client, project, inProgressTask, deferred, mockBackend, renderOperational } from "./operationalFixtures";
import { handedOffDocuments } from "./documentFixtures";
import { quotationConfirmed, quotationPreview, confirmedStatus, notConfirmedStatus, sentStatus, sentQuotation } from "./budgetQuotationFixtures";
import { commercialPreview, commercialConfirmation, reviewTask } from "./commercialQuotationFixtures";
import { budgetRead, commercialRead } from "./quotationReadFixtures";
import { user } from "./fixtures";

const account = (role: AvailableRole) => ({ ...user, roles: [role], isManagement: role === "Management" });
const same = <T extends typeof inProgressTask>(task: T): T => ({ ...task, assignedToGoogleSubject: user.subject });
function backend(stage: "editing" | "budget" | "review" | "commercial") {
  const state = { budget: stage !== "editing", commercial: stage === "commercial", sent: stage === "review" || stage === "commercial", tasks:
    stage === "commercial" ? [same(sentQuotation.budgetTask), same(commercialConfirmation.reviewTask), same(commercialConfirmation.presentQuotationToClientTask)] :
    stage === "review" ? [same(sentQuotation.budgetTask), same(reviewTask)] : [same(inProgressTask)] };
  const fetchMock = mockBackend((path, init) => {
    if (init.method === "POST") {
      if (path.endsWith("/budget-quotation/preview")) return quotationPreview;
      if (path.endsWith("/budget-quotation/confirm")) { state.budget = true; return { ...quotationConfirmed, prepareQuotationTask: same(quotationConfirmed.prepareQuotationTask) }; }
      if (path.endsWith("/send-to-commercial")) { state.sent = true; state.tasks = [same(sentQuotation.budgetTask), same(reviewTask)]; return { ...sentQuotation, budgetTask: state.tasks[0], commercialTask: state.tasks[1] }; }
      if (path.endsWith("/commercial-quotation/preview")) return commercialPreview;
      if (path.endsWith("/commercial-quotation/confirm")) {
        state.commercial = true; state.tasks = [same(sentQuotation.budgetTask), same(commercialConfirmation.reviewTask), same(commercialConfirmation.presentQuotationToClientTask)];
        return { ...commercialConfirmation, reviewTask: state.tasks[1], presentQuotationToClientTask: state.tasks[2] };
      }
      throw new Error(`Unexpected mutation: ${path}`);
    }
    if (path.endsWith("/budget-quotation/status")) return state.sent ? sentStatus : state.budget ? confirmedStatus : notConfirmedStatus;
    if (path.endsWith("/tasks")) return state.tasks;
    if (path.endsWith("/notifications")) return [];
    if (path.endsWith("/documents")) return handedOffDocuments;
    if (path.startsWith("clients/")) return client;
    if (path === "projects/project-1") return { ...project, sgCode: "SG001" };
    throw new Error(`Unexpected request: ${path}`);
  }, path => path.endsWith("/budget-quotation/view") ? state.budget ? budgetRead : Response.json({}, { status: 404 })
    : state.commercial ? commercialRead : Response.json({}, { status: 404 }));
  return { state, fetchMock };
}
const budget = () => screen.getByRole("region", { name: "Cotización de Presupuestos confirmada" });
const commercial = () => screen.getByRole("region", { name: "Cotización Comercial confirmada" });
const file = () => new File(["opaque"], "synthetic.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

describe("persistent quotation workspace", () => {
  it("replaces budget preview/editor with normalized confirmed data, preserves it after handoff and reload", async () => {
    const { fetchMock } = backend("editing");
    let view = renderOperational(<ProjectDetailPage id="project-1" />, account("Budgets"));
    await userEvent.upload(await screen.findByLabelText("Seleccionar archivo"), file());
    expect(screen.queryByRole("region", { name: "Cotización de Presupuestos confirmada" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Generar preview" }));
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar cotización" }));
    await screen.findAllByText("Vidrio confirmado persistido");
    expect(screen.queryByLabelText("Seleccionar archivo")).not.toBeInTheDocument();
    expect(within(budget()).getByText("Proyecto documental")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Enviar a Comercial" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar envío" }));
    await screen.findByText("Enviada a Comercial");
    await screen.findAllByText("Vidrio confirmado persistido");
    view.unmount(); view = renderOperational(<ProjectDetailPage id="project-1" />, account("Budgets"));
    await screen.findAllByText("Vidrio confirmado persistido");
    expect(screen.queryByRole("button", { name: "Enviar a Comercial" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/budget-quotation/confirm"))).toHaveLength(1);
    view.unmount();
  });
  it("lets Head read budget while reviewing; after 4E and reload both confirmed views remain without preview/editor", async () => {
    backend("review");
    let view = renderOperational(<ProjectDetailPage id="project-1" />, account("CommercialHead"));
    await screen.findAllByText("Vidrio confirmado persistido");
    expect(screen.queryByLabelText("Seleccionar archivo")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Asignar SG|Guardar corrección|Enviar a Comercial/ })).not.toBeInTheDocument();
    await userEvent.upload(await screen.findByLabelText("Seleccionar XLSX comercial"), file());
    await userEvent.click(screen.getByRole("button", { name: "Generar preview" }));
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar cotización comercial" }));
    await userEvent.click(screen.getByRole("button", { name: /^Confirmar$/ }));
    await screen.findByRole("region", { name: "Cotización Comercial confirmada" });
    expect(budget()).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Preview comercial" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Seleccionar XLSX comercial")).not.toBeInTheDocument();
    view.unmount(); view = renderOperational(<ProjectDetailPage id="project-1" />, account("CommercialHead"));
    await screen.findByRole("region", { name: "Cotización Comercial confirmada" });
    expect(budget()).toBeInTheDocument(); expect(screen.queryByLabelText("Seleccionar XLSX comercial")).not.toBeInTheDocument();
    view.unmount(); renderOperational(<ProjectDetailPage id="project-1" />, account("CommercialAdvisor"));
    await screen.findByRole("region", { name: "Cotización Comercial confirmada" });
    expect(budget()).toBeInTheDocument(); expect(screen.queryByRole("region", { name: "Revisión Comercial" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descargar cotización final" })).toBeInTheDocument();
  });
  it.each(["CommercialAdvisor", "CommercialHead", "Management"] as const)("%s reloads both snapshots with exact persisted fields and no XLSX fetch", async role => {
    const { fetchMock } = backend("commercial"); renderOperational(<ProjectDetailPage id="project-1" />, account(role));
    await screen.findByRole("region", { name: "Cotización Comercial confirmada" });
    expect(within(budget()).getAllByRole("article")).toHaveLength(3);
    expect(within(commercial()).getAllByRole("article")).toHaveLength(2);
    expect(within(commercial()).getAllByText("Precio unitario")).toHaveLength(2);
    expect(within(commercial()).getByText("Valor total del proyecto")).toBeInTheDocument();
    expect(within(commercial()).getByText("Cambios técnicos frente a Presupuestos (1)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirmar|Generar preview|Enviar a Comercial|Asignar SG/ })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
    expect(fetchMock.mock.calls.some(([path]) => path.endsWith("/file") || path.endsWith("/image"))).toBe(false);
  });
  it("Budgets never requests final commercial quotation even when the same account is its owner", async () => {
    const { fetchMock } = backend("commercial"); renderOperational(<ProjectDetailPage id="project-1" />, account("Budgets"));
    await screen.findAllByText("Vidrio confirmado persistido");
    expect(screen.queryByRole("region", { name: "Cotización Comercial confirmada" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([path]) => path.endsWith("/commercial-quotation/view"))).toBe(false);
  });
  it("hides nonexistent snapshots and exposes real load errors with a GET retry", async () => {
    let fail = true;
    mockBackend(() => undefined, () => fail ? Response.json({}, { status: 503 }) : Response.json({}, { status: 404 }));
    renderOperational(<BudgetQuotationReadView projectId="project-1" />);
    await screen.findByRole("alert"); fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Volver a cargar" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
  it("rejects stale data after a role switch and requests again under the new role", async () => {
    const pending = deferred<unknown>();
    mockBackend(() => undefined, () => pending.promise);
    const view = renderOperational(<CommercialQuotationReadView projectId="project-1" />, account("CommercialHead"));
    await screen.findByRole("status"); view.unmount();
    const { fetchMock } = backend("commercial"); renderOperational(<ProjectDetailPage id="project-1" />, account("Budgets"));
    await act(async () => pending.resolve(commercialRead));
    await screen.findAllByText("Vidrio confirmado persistido");
    expect(screen.queryByRole("region", { name: "Cotización Comercial confirmada" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => new Headers(init.headers).get("X-SnG-Active-Role") === "Budgets")).toBe(true);
  });
  it("loads an image only on demand and revokes its blob URL when leaving", async () => {
    const id = "00000000-0000-0000-0000-000000000001", itemId = "00000000-0000-0000-0000-000000000002";
    const create = vi.fn(() => "blob:synthetic"), revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const fetchMock = mockBackend(() => new Response(new Uint8Array([1, 2]), { headers: { "Content-Type": "image/png" } }),
      () => ({ ...budgetRead, projectId: id, items: [{ ...budgetRead.items[0], id: itemId }] }));
    const view = renderOperational(<BudgetQuotationReadView projectId={id} />);
    await userEvent.click(await screen.findByRole("button", { name: "Ver imagen del ítem V-2" }));
    expect(await screen.findByAltText("Imagen confirmada del ítem V-2")).toHaveAttribute("src", "blob:synthetic");
    expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/image"))).toHaveLength(1);
    view.unmount(); expect(revoke).toHaveBeenCalledWith("blob:synthetic");
  });
});

describe("closed persisted contracts", () => {
  it("accepts stored values, extraction, differences, decimals and real timestamps", () => {
    expect(parseBudgetView(budgetRead, "project-1")).toEqual(budgetRead);
    expect(parseCommercialView(commercialRead, "project-1")).toEqual(commercialRead);
  });
  it.each([
    { ...budgetRead, projectId: "other" }, { ...budgetRead, versionNumber: 0 }, { ...budgetRead, confirmedAt: "invalid" },
    { ...budgetRead, storageKey: "private" }, { ...budgetRead, items: [budgetRead.items[0], budgetRead.items[0]] },
    { ...budgetRead, items: [{ ...budgetRead.items[0], imageStatus: "Unknown" }] },
    { ...budgetRead, items: [{ ...budgetRead.items[0], imageStatus: "Missing", hasImage: true }] },
  ])("rejects invalid budget contracts", value => expect(() => parseBudgetView(value, "project-1")).toThrow());
  it.each([
    { ...commercialRead, projectTotal: -1 }, { ...commercialRead, confirmedAt: null },
    { ...commercialRead, items: [{ ...commercialRead.items[0], totalPrice: "100" }] },
    { ...commercialRead, items: [{ ...commercialRead.items[0], technicalDifferences: [{ field: "Invented", previousValue: "x", currentValue: "y" }] }] },
  ])("rejects invalid commercial contracts", value => expect(() => parseCommercialView(value, "project-1")).toThrow());
});
