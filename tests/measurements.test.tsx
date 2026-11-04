import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ProjectDetailPage } from "@/features/projects/ProjectDetailPage";
import { MeasurementPanel } from "@/features/measurements/MeasurementPanel";
import type { MeasurementState } from "@/features/measurements/contracts";
import { renderOperational, mockBackend, project, client, task } from "./operationalFixtures";
import { user } from "./fixtures";
beforeEach(() => {
 Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
 Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
});
const id = "11111111-1111-4111-8111-111111111111";
const date = "2026-11-03T18:00:00Z";
const installer = { ...user, roles: ["Installation" as const], isManagement: false };
const ready: MeasurementState = {
 projectId: id, taskId: id, taskStatus: "InProgress", responsibleSubject: user.subject, canModify: true, checklistId: id, revision: 0,
 summary: { initial: 2, added: 0, retired: 0, active: 2, measured: 0, pending: 2, progress: 0 },
 structures: [1, 2].map(n => ({ id: `${n}2222222-2222-4222-8222-222222222222`, itemId: id, itemNumber: "V1", unitOrdinal: n, unitCount: 2, description: "Ventana", location: "Sala", width: 1.2, height: 2, note: null, createdAt: date, measuredAt: null, retiredAt: null })),
 documents: [], history: [], submissionId: null, submittedAt: null,
};
const completeReady = (): MeasurementState => ({ ...structuredClone(ready), structures: ready.structures.map(s => ({ ...s, actualWidth: 1.2, actualHeight: 2, actualSystemText: "Libre", comparisonCurrent: true, measurementType: "Agreed", actualLocation: "Room", technicalComplete: true, technical: { handleStatus: "NotApplicable", handleHeightMm: null, viewSide: "Outside", openingType: "NotApplicable", openingDirection: null, openingHand: null, hasAlfajia: false, alfajiaMeasurementMm: null } })) });
const doc = { id, originalFileName: "medidas.pdf", contentType: "application/pdf", sizeBytes: 3, uploadedAt: date, uploadedBy: { name: "Installer", email: null }, uploadBatchId: id, isCurrent: true, replacedAt: null, replacedByDocumentId: null, inInitialHandoff: false };
it("keeps independent checks and presents official progress after save and reload", async () => {
 let state = completeReady();
 const fetch = mockBackend((_, init) => { if (init.method === "POST") { const body = JSON.parse(init.body as string); expect(body.expectedRevision).toBe(0); expect(body.action).toBe("Measure"); state = { ...state, revision: 1, structures: state.structures.map(s => s.id === body.structureId ? { ...s, measuredAt: date } : s), summary: { ...state.summary, measured: 1, pending: 1, progress: 50 } }; return new Response(null, { status: 204 }); } return state; });
 const view = renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 const checks = await screen.findAllByRole("checkbox", { name: /^Medido / }); expect(checks).toHaveLength(2);
 fireEvent.click(checks[0]); fireEvent.click(checks[0]);
 await screen.findByText(/Avance: 50%/); expect(screen.getAllByRole("checkbox", { name: /^Medido / })[0]).toBeChecked(); expect(screen.getAllByRole("checkbox", { name: /^Medido / })[1]).not.toBeChecked();
 expect(fetch.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
 view.unmount(); renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 expect((await screen.findAllByRole("checkbox", { name: /^Medido / }))[0]).toBeChecked();
});
it("requires retirement confirmation and cancellation does not write", async () => {
 const fetch = mockBackend(() => ready); renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 await userEvent.click((await screen.findAllByRole("button", { name: /Retirar estructura/ }))[0]);
 await userEvent.click(screen.getByRole("button", { name: "Cancelar" })); expect(fetch.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(0);
});
it("retries the same command after unknown transport failure", async () => {
 const bodies: string[] = [];
 mockBackend((_, init) => { if (init.method === "POST") { bodies.push(init.body as string); if (bodies.length === 1) throw new TypeError("network"); return new Response(null, { status: 204 }); } return completeReady(); });
 renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 fireEvent.click((await screen.findAllByRole("checkbox", { name: /^Medido / }))[0]);
 await userEvent.click(await screen.findByRole("button", { name: "Reintentar operación pendiente" }));
 await waitFor(() => expect(bodies).toHaveLength(2)); expect(bodies[0]).toBe(bodies[1]);
});
it.each(["Management", "Accounting", "CommercialAdvisor"] as const)("denies UI writes for %s even with the same subject and server flag", async role => {
 mockBackend(() => ready); renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, { ...user, roles: [role], isManagement: role === "Management" });
 for (const check of await screen.findAllByRole("checkbox", { name: /^Medido / })) expect(check).toBeDisabled();
 expect(screen.queryByRole("button", { name: "Agregar estructura" })).not.toBeInTheDocument();
});
it("confirms exact documents once and freezes the final state", async () => {
 let state = { ...ready, documents: [doc], summary: { ...ready.summary, measured: 2, pending: 0, progress: 100 } };
 const fetch = mockBackend((_, init) => { if (init.method === "POST") { const body = JSON.parse(init.body as string); expect(body.documentIds).toEqual([id]); state = { ...state, submissionId: id, submittedAt: date, taskStatus: "Completed", canModify: false }; return new Response(null, { status: 204 }); } return state; });
 renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 await userEvent.click(await screen.findByRole("button", { name: "Radicar medidas" })); expect(fetch.mock.calls.filter(([, i]) => i.method === "POST")).toHaveLength(0);
 await userEvent.click(screen.getByRole("button", { name: "Confirmar" })); await screen.findByText(/Medidas radicadas/);
 expect(screen.queryByRole("button", { name: "Radicar medidas" })).not.toBeInTheDocument();
});
it("blocks zero active structures and incomplete checklists", async () => {
 mockBackend(() => ({ ...ready, documents: [doc], summary: { ...ready.summary, active: 0, pending: 0, progress: 0 } }));
 renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 expect(await screen.findByRole("button", { name: "Radicar medidas" })).toBeDisabled();
});

it("mounts one measurement checklist in the Installation project workspace", async () => {
 mockBackend(path => {
   if (path.endsWith("/measurements")) return ready;
   if (path.endsWith("/documents")) return { documents: [], initialHandoff: null, canModify: false, canRemove: false, canSendToBudgets: false };
   if (path.endsWith("/tasks")) return [{ ...task, projectId: id, type: "TakeMeasurements", area: "Installation", quotationRound: null, assignedToGoogleSubject: user.subject }];
   if (path.includes("notifications")) return [];
   if (path.startsWith("clients/")) return client;
   return { ...project, id };
 });
 renderOperational(<ProjectDetailPage id={id} />, installer);
 await screen.findByRole("heading", { name: "Toma de medidas", level: 2 });
 expect(screen.getAllByRole("checkbox", { name: /^Medido / })).toHaveLength(2);
 expect(screen.getAllByRole("heading", { name: "Toma de medidas", level: 2 })).toHaveLength(1);
});

it("opens retirement confirmation with focus and identifies the selected physical unit", async () => {
 const fetch = mockBackend(() => ready);
 renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 await userEvent.click((await screen.findAllByRole("button", { name: /Retirar estructura/ }))[1]);
 const dialog = screen.getByRole("dialog", { name: "Confirmar retiro" });
 expect(within(dialog).getByRole("button", { name: "Cancelar" })).toHaveFocus();
 expect(dialog).toHaveTextContent("Ítem V1 · Unidad 2/2");
 expect(dialog).toHaveTextContent(ready.structures[1].id);
 expect(fetch.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(0);
});

it("retires only the confirmed unit, recovers server counts on reopen and retains its history", async () => {
 let state = structuredClone(ready);
 const target = ready.structures[1];
 const fetch = mockBackend((path, init) => {
   if (init.method === "POST") {
     expect(path).toBe(`projects/${id}/measurements/commands`);
     const body = JSON.parse(init.body as string);
     expect(body).toEqual({ action: "Retire", structureId: target.id, expectedRevision: 0, requestKey: expect.any(String) });
     state = { ...state, revision: 1, structures: state.structures.map(s => s.id === target.id ? { ...s, retiredAt: date } : s),
       summary: { ...state.summary, active: 1, pending: 1, retired: 1 },
       history: [{ id: "event-1", action: "Retire", structureId: target.id, at: date, actor: { name: "Installer", email: null }, revision: 1 }] };
     return new Response(null, { status: 204 });
   }
   return state;
 });
 const view = renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 await userEvent.click((await screen.findAllByRole("button", { name: /Retirar estructura/ }))[1]);
 const confirm = screen.getByRole("button", { name: "Confirmar" }); fireEvent.click(confirm); fireEvent.click(confirm);
 await screen.findByText(/Vigentes: 1/);
 expect(screen.getAllByRole("checkbox", { name: /^Medido / })).toHaveLength(1);
 expect(screen.queryByRole("button", { name: `Retirar estructura ${target.id.slice(0, 8)}` })).not.toBeInTheDocument();
 expect(fetch.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
 view.unmount(); renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 await screen.findByText(/Vigentes: 1/);
 expect(screen.getAllByRole("checkbox", { name: /^Medido / })).toHaveLength(1);
 await userEvent.click(screen.getByText("Estructuras retiradas")); expect(screen.getByText(new RegExp(target.id))).toBeVisible();
 await userEvent.click(screen.getByText("Historial de cambios")); expect(screen.getByText(/Estructura retirada.*Installer/)).toBeVisible();
});
it("Escape cancels retirement without sending a command", async () => {
 const fetch = mockBackend(() => ready); renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 await userEvent.click((await screen.findAllByRole("button", { name: /Retirar estructura/ }))[0]);
 fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
 expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
 expect(fetch.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(0);
});

it("saves actual dimensions and free system text per unit without changing quotation values, then restores on reopen", async () => {
 let state = structuredClone(ready); const target = ready.structures[0];
 const fetch = mockBackend((_, init) => {
   if (init.method === "POST") {
     const body = JSON.parse(init.body as string);
     expect(body).toEqual({ action: "RecordActual", structureId: target.id, actualWidth: 1.2345, actualHeight: 2.3456, actualSystemText: "Sistema libre en obra", measurementType: null, actualLocation: null, installationObservations: null, requestKey: expect.any(String), expectedRevision: 0 });
     state = { ...state, revision: 1, structures: state.structures.map(s => s.id === target.id ? { ...s, actualWidth: body.actualWidth, actualHeight: body.actualHeight, actualSystemText: body.actualSystemText } : s) };
     return new Response(null, { status: 204 });
   }
   return state;
 });
 const view = renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 const card = await screen.findByRole("article", { name: `Estructura ${target.id}` });
 expect(within(card).getByLabelText(`Ancho en obra ${target.id}`)).toHaveValue(null);
 fireEvent.change(within(card).getByLabelText(`Ancho en obra ${target.id}`), { target: { value: "1234.5" } });
 fireEvent.change(within(card).getByLabelText(`Alto en obra ${target.id}`), { target: { value: "2345.6" } });
 await userEvent.type(within(card).getByRole("textbox", { name: `Sistema en obra ${target.id}` }), "Sistema libre en obra");
 expect(within(card).queryByRole("combobox", { name: `Sistema en obra ${target.id}` })).not.toBeInTheDocument();
 expect(screen.queryByLabelText("Observación")).not.toBeInTheDocument();
 expect(screen.getByRole("button", { name: "Radicar medidas" })).toBeDisabled();
 await userEvent.click(within(card).getByRole("button", { name: "Guardar medidas" }));
 await screen.findByText("Operación guardada.");
 expect(state.structures[0].width).toBe(1.2); expect(state.structures[0].height).toBe(2); expect(state.structures[0].description).toBe("Ventana");
 expect(state.summary.measured).toBe(0);
 expect(fetch.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
 view.unmount(); renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 expect(await screen.findByLabelText(`Ancho en obra ${target.id}`)).toHaveValue(1234.5);
 expect(screen.getByLabelText(`Alto en obra ${target.id}`)).toHaveValue(2345.6);
 expect(screen.getByLabelText(`Sistema en obra ${target.id}`)).toHaveValue("Sistema libre en obra");
 expect(screen.getByLabelText(`Ancho en obra ${ready.structures[1].id}`)).toHaveValue(null);
});
it("shares the persisted item image across units and revokes its authenticated blob on unmount", async () => {
 const create = vi.fn(() => "blob:synthetic-drawing"); const revoke = vi.fn();
 vi.stubGlobal("URL", class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
 const fetch = mockBackend((path) => path.endsWith("/image") ? new Response(new Blob(["synthetic raster"], { type: "image/png" }), { headers: { "Content-Type": "image/png" } }) : { ...ready, structures: ready.structures.map(s => ({ ...s, imageCatalogItemId: id })) });
 const view = renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 await waitFor(() => expect(screen.getAllByAltText("Dibujo del ítem V1")).toHaveLength(2));
 expect(fetch.mock.calls.filter(([url]) => url.endsWith("/image"))).toHaveLength(1);
 expect(create).toHaveBeenCalledOnce(); view.unmount(); expect(revoke).toHaveBeenCalledWith("blob:synthetic-drawing");
});
it.each(["Management", "Accounting", "CommercialAdvisor"] as const)("keeps actual capture read-only for %s", async role => {
 mockBackend(() => ({ ...ready, structures: ready.structures.map(s => ({ ...s, actualWidth: 1.1, actualHeight: 2.2, actualSystemText: "Guardado" })) }));
 renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, { ...user, roles: [role], isManagement: role === "Management" });
 expect(await screen.findByLabelText(`Ancho en obra ${ready.structures[0].id}`)).toBeDisabled();
 expect(screen.getByLabelText(`Sistema en obra ${ready.structures[0].id}`)).toHaveValue("Guardado");
 expect(screen.queryByRole("button", { name: "Guardar medidas" })).not.toBeInTheDocument();
});
it("keeps submitted actual capture immutable and hides historical notes", async () => {
 mockBackend(() => ({ ...ready, canModify: false, submissionId: id, submittedAt: date, taskStatus: "Completed", structures: ready.structures.map(s => ({ ...s, note: "Historic note", actualWidth: 1.1, actualHeight: 2.2, actualSystemText: "Final" })) }));
 renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 expect(await screen.findByLabelText(`Alto en obra ${ready.structures[0].id}`)).toHaveValue(2200);
 expect(screen.getByLabelText(`Alto en obra ${ready.structures[0].id}`)).toBeDisabled();
 expect(screen.queryByText("Historic note")).not.toBeInTheDocument();
 expect(screen.queryByRole("button", { name: "Guardar medidas" })).not.toBeInTheDocument();
});

it("converts 2000/2400 mm to 2/2.4 metres at the API boundary and restores mm", async () => {
 let state = structuredClone(ready); const target = state.structures[0];
 mockBackend((_, init) => { if (init.method === "POST") { const body = JSON.parse(init.body as string); expect(body.actualWidth).toBe(2); expect(body.actualHeight).toBe(2.4); state = { ...state, structures: state.structures.map(s => s.id === target.id ? { ...s, actualWidth: 2, actualHeight: 2.4, actualSystemText: "Libre" } : s) }; return new Response(null, { status: 204 }); } return state; });
 const view = renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 const card = await screen.findByRole("article", { name: `Estructura ${target.id}` });
 fireEvent.change(within(card).getByLabelText(`Ancho en obra ${target.id}`), { target: { value: "2000" } });
 fireEvent.change(within(card).getByLabelText(`Alto en obra ${target.id}`), { target: { value: "2400" } });
 fireEvent.change(within(card).getByLabelText(`Sistema en obra ${target.id}`), { target: { value: "Libre" } });
 await userEvent.click(within(card).getByRole("button", { name: "Guardar medidas" })); await screen.findByText("Operación guardada.");
 view.unmount(); renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 expect(await screen.findByLabelText(`Ancho en obra ${target.id}`)).toHaveValue(2000); expect(screen.getByLabelText(`Alto en obra ${target.id}`)).toHaveValue(2400);
});
