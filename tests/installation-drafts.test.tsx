import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { MeasurementPanel } from "@/features/measurements/MeasurementPanel";
import { missingMeasurementFields } from "@/features/measurements/completeness";
import type { MeasurementCommand, MeasurementState, SketchDrawing, TechnicalDetails } from "@/features/measurements/contracts";
import { renderOperational, mockBackend, deferred } from "./operationalFixtures";
import { user } from "./fixtures";
const id = "11111111-1111-4111-8111-111111111111", unit = "22222222-2222-4222-8222-222222222222", version = "33333333-3333-4333-8333-333333333333";
const date = "2026-11-04T12:00:00Z";
const installer = { ...user, roles: ["Installation" as const], isManagement: false };
const complete: TechnicalDetails = { handleStatus: "NotApplicable", handleHeightMm: null, viewSide: "Outside", openingType: "NotApplicable", openingDirection: null, openingHand: null, hasAlfajia: false, alfajiaMeasurementMm: null };
function initial(): MeasurementState { return { projectId: id, taskId: id, taskStatus: "InProgress", responsibleSubject: user.subject, canModify: true, checklistId: id, revision: 0, summary: { initial: 1, added: 0, retired: 0, active: 1, measured: 0, pending: 1, progress: 0 }, structures: [{ id: unit, itemId: id, itemNumber: "V1", unitOrdinal: 1, unitCount: 1, description: "Original", location: null, width: 1, height: 2.4, actualWidth: 1, actualHeight: 2.4, actualSystemText: "Libre", technical: complete, comparisonCurrent: true, measurementType: "Agreed", actualLocation: "Room", technicalComplete: true, createdAt: date, measuredAt: null, retiredAt: null }], documents: [], history: [], submissionId: null, submittedAt: null }; }
const ctx = { fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillStyle: "", strokeStyle: "", lineWidth: 0, lineCap: "", lineJoin: "" };
beforeEach(() => {
 Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
 Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
 vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
 vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 450 } as DOMRect);
 Object.defineProperty(HTMLCanvasElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
 vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(cb => cb({ type: "image/webp", size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as Blob));
 vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:synthetic"); static revokeObjectURL = vi.fn(); });
});
function draw() { const canvas = screen.getByLabelText("Lienzo de croquis para mouse, dedo o lápiz"); for (const type of ["pointerdown", "pointerup"]) { const e = new Event(type, { bubbles: true }); Object.assign(e, { pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, clientX: 100, clientY: 100 }); fireEvent(canvas, e); } }
async function pauseSketch() { await userEvent.click(screen.getByRole("button", { name: /^(Dibujar|Editar) croquis$/ })); draw(); await userEvent.click(screen.getByText("Volver a ficha · conservar borrador")); }
function backend() {
 let state = initial(); let drawing: SketchDrawing = { version: 1, width: 1200, height: 900, strokes: [] }; const commands: MeasurementCommand[] = [];
 mockBackend((path, init) => {
  if (init.method === "POST") {
   const command = JSON.parse(init.body as string) as MeasurementCommand; expect(command.expectedRevision).toBe(state.revision); commands.push(command);
   state = { ...state, revision: state.revision + 1, structures: state.structures.map(s => {
    if (command.action === "RecordActual") return { ...s, actualWidth: command.actualWidth, actualHeight: command.actualHeight, actualSystemText: command.actualSystemText, measurementType: command.measurementType, actualLocation: command.actualLocation, installationObservations: command.installationObservations };
    if (command.action === "RecordTechnical") return { ...s, technical: command.technical };
    if (command.action === "RecordSketch") { drawing = command.sketch.drawing; return { ...s, sketchVersionId: version }; }
    if (command.action === "Measure") return { ...s, measuredAt: date };
    return s;
   }) }; return new Response(null, { status: 204 });
  }
  if (path.endsWith("/image")) return new Response(new Blob(["webp"], { type: "image/webp" }), { headers: { "Content-Type": "image/webp" } });
  if (path.includes("/sketches/")) return { id: version, structureId: unit, revision: state.revision, drawing, webpSha256: "synthetic" };
  return state;
 }); return { commands, read: () => state };
}
it.each([
 ["RecordActual", "RecordTechnical", "RecordSketch"], ["RecordTechnical", "RecordActual", "RecordSketch"],
 ["RecordSketch", "RecordTechnical", "RecordActual"], ["RecordSketch", "RecordActual", "RecordTechnical"],
 ["RecordActual", "RecordSketch", "RecordTechnical"], ["RecordTechnical", "RecordSketch", "RecordActual"],
])("preserves independent drafts when saving %s / %s / %s", async (...order) => {
 const b = backend(); const view = renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 const width = await screen.findByLabelText(`Ancho en obra ${unit}`);
 fireEvent.change(width, { target: { value: "2000" } });
 await userEvent.click(screen.getByText("Detalles técnicos")); expect(screen.getByLabelText("Referencia de vista")).toBeEnabled();
 await userEvent.selectOptions(screen.getByLabelText("Referencia de vista"), "Inside"); expect(width).toBeEnabled();
 await pauseSketch(); expect(width).toBeEnabled();
 fireEvent.change(width, { target: { value: "2100" } });
 expect(screen.getByLabelText(`Medido ${unit}`)).toBeDisabled(); expect(b.commands).toHaveLength(0);
 const saved = new Set<string>();
 for (const action of order) {
  if (action === "RecordSketch") { await userEvent.click(screen.getByRole("button", { name: /^(Dibujar|Editar) croquis$/ })); expect(screen.getByText(/1\/200 trazos/)).toBeInTheDocument(); await userEvent.click(screen.getByText("Guardar croquis")); }
  else await userEvent.click(screen.getByText(action === "RecordActual" ? "Guardar medidas" : "Guardar detalles técnicos"));
  await waitFor(() => expect(b.commands).toHaveLength(saved.size + 1));
  await waitFor(() => expect(screen.queryByText("Guardando…", { selector: "p" })).not.toBeInTheDocument());
  saved.add(action);
  if (action === "RecordSketch") { await screen.findByText(/Guardado · revisión/); await userEvent.click(screen.getByText("Volver a ficha · conservar borrador")); }
  expect(screen.getByLabelText(`Ancho en obra ${unit}`)).toHaveValue(2100); expect(screen.getByLabelText("Referencia de vista")).toHaveValue("Inside");
  if (!saved.has("RecordActual")) expect(screen.getByText("Cambios sin guardar en esta estructura.")).toBeInTheDocument();
  if (!saved.has("RecordTechnical")) expect(screen.getByText("Detalles técnicos sin guardar.")).toBeInTheDocument();
  if (!saved.has("RecordSketch")) expect(screen.getByText(/Croquis en borrador sin guardar/)).toBeInTheDocument();
  if (saved.size < 3) expect(screen.getByLabelText(`Medido ${unit}`)).toBeDisabled();
 }
 await waitFor(() => expect(screen.getByLabelText(`Medido ${unit}`)).toBeEnabled());
 for (const c of b.commands) { if (c.action !== "RecordSketch") expect(c).not.toHaveProperty("sketch"); if (c.action !== "RecordTechnical") expect(c).not.toHaveProperty("technical"); }
 await userEvent.click(screen.getByLabelText(`Medido ${unit}`)); await waitFor(() => expect(screen.getByLabelText(`Medido ${unit}`)).toBeChecked());
 view.unmount(); renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 expect(await screen.findByLabelText(`Ancho en obra ${unit}`)).toHaveValue(2100); expect(screen.getByLabelText(`Medido ${unit}`)).toBeChecked(); expect(b.read().structures[0].actualWidth).toBe(2.1);
});
it("allows complete persisted sheets without sketches and lists conditional missing fields", async () => {
 const state = initial(); state.structures[0] = { ...state.structures[0], technicalComplete: false, technical: { ...complete, handleStatus: "Confirmed", openingType: "HingedDoor", hasAlfajia: true } };
 mockBackend(() => state); const view = renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 expect(await screen.findByLabelText(`Medido ${unit}`)).toBeDisabled();
 const list = screen.getByText("Pendiente de guardar o validar:").parentElement!;
 for (const label of ["Altura de manija válida (mm)", "Dirección de apertura", "Lado de bisagras", "Medida de alfajía válida (mm)"]) expect(within(list).getByText(label)).toBeInTheDocument();
 expect(missingMeasurementFields(initial().structures[0])).toEqual([]);
 expect(missingMeasurementFields({ ...initial().structures[0], technical: { ...complete, openingType: "HingedWindow", openingDirection: "Inward" } })).toEqual([]);
 expect(missingMeasurementFields({ ...initial().structures[0], technical: { ...complete, openingType: "Other" } })).toEqual([]);
 view.unmount(); mockBackend(() => initial()); renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 expect(await screen.findByLabelText(`Medido ${unit}`)).toBeEnabled(); expect(screen.getByText("Sin croquis guardado")).toBeInTheDocument();
});
it("preserves legacy measured states and allows explicitly unmarking them", async () => {
 const state = initial(); state.structures[0] = { ...state.structures[0], measuredAt: date, actualWidth: null, actualHeight: null, technical: null, technicalComplete: false };
 const fetch = mockBackend(() => state); renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 const check = await screen.findByLabelText(`Medido ${unit}`); expect(check).toBeChecked(); expect(check).toBeEnabled();
 await userEvent.click(check); await waitFor(() => expect(fetch.mock.calls.some(([, init]) => init.method === "POST" && JSON.parse(init.body as string).measured === false)).toBe(true));
});

it("keeps inputs editable during a write and preserves newer local edits on its response", async () => {
 let state = initial(); const gate = deferred<void>(); const commands: MeasurementCommand[] = [];
 mockBackend(async (_, init) => {
  if (init.method !== "POST") return state;
  const c = JSON.parse(init.body as string) as MeasurementCommand; commands.push(c);
  expect(c.expectedRevision).toBe(state.revision);
  if (commands.length === 1) await gate.promise;
  if (c.action === "RecordActual") state = { ...state, revision: state.revision + 1, structures: state.structures.map(s => ({ ...s, actualWidth: c.actualWidth, actualHeight: c.actualHeight, actualSystemText: c.actualSystemText })) };
  return new Response(null, { status: 204 });
 });
 renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 const width = await screen.findByLabelText(`Ancho en obra ${unit}`);
 fireEvent.change(width, { target: { value: "2000" } }); await userEvent.click(screen.getByText("Guardar medidas"));
 await waitFor(() => expect(commands).toHaveLength(1)); expect(width).toBeEnabled();
 fireEvent.change(width, { target: { value: "3000" } });
 await userEvent.click(screen.getByText("Detalles técnicos")); await userEvent.selectOptions(screen.getByLabelText("Referencia de vista"), "Inside");
 expect(screen.getByText("Guardar detalles técnicos")).toBeDisabled(); expect(screen.getByText("Dibujar croquis")).toBeEnabled();
 gate.resolve(); await screen.findByText("Operación guardada.");
 expect(width).toHaveValue(3000); expect(state.structures[0].actualWidth).toBe(2);
 expect(screen.getByText("Cambios sin guardar en esta estructura.")).toBeInTheDocument(); expect(screen.getByText("Detalles técnicos sin guardar.")).toBeInTheDocument();
 await userEvent.click(screen.getByText("Guardar medidas")); await waitFor(() => expect(state.structures[0].actualWidth).toBe(3));
 expect(screen.getByLabelText("Referencia de vista")).toHaveValue("Inside"); expect(screen.getByLabelText(`Medido ${unit}`)).toBeDisabled();
});
it("retries the exact uncertain command without overwriting a later draft", async () => {
 let state = initial(); const bodies: string[] = [];
 mockBackend((_, init) => {
  if (init.method !== "POST") return state;
  bodies.push(init.body as string); if (bodies.length === 1) throw new TypeError("Synthetic transport failure");
  const c = JSON.parse(init.body as string); state = { ...state, revision: 1, structures: state.structures.map(s => ({ ...s, actualWidth: c.actualWidth })) };
  return new Response(null, { status: 204 });
 });
 renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 const width = await screen.findByLabelText(`Ancho en obra ${unit}`); fireEvent.change(width, { target: { value: "2000" } });
 await userEvent.click(screen.getByText("Guardar medidas")); await screen.findByText("Reintentar operación pendiente");
 fireEvent.change(width, { target: { value: "3000" } });
 await userEvent.click(screen.getByText("Reintentar operación pendiente")); await screen.findByText("Operación guardada.");
 expect(bodies).toHaveLength(2); expect(bodies[1]).toBe(bodies[0]); expect(width).toHaveValue(3000);
 expect(screen.getByText("Cambios sin guardar en esta estructura.")).toBeInTheDocument(); expect(screen.getByLabelText(`Medido ${unit}`)).toBeDisabled();
});
it("a conflict reread preserves all drafts and the next command uses the fresh revision", async () => {
 let state = initial(); const commands: MeasurementCommand[] = [];
 mockBackend((_, init) => {
  if (init.method !== "POST") return state;
  const c = JSON.parse(init.body as string) as MeasurementCommand; commands.push(c);
  if (commands.length === 1) { state = { ...state, revision: 5, structures: state.structures.map(s => ({ ...s, actualWidth: 1.5 })) }; return Response.json({ status: 409, extensions: { code: "MeasurementRevisionConflict" } }, { status: 409 }); }
  expect(c.expectedRevision).toBe(5);
  if (c.action === "RecordActual") state = { ...state, revision: 6, structures: state.structures.map(s => ({ ...s, actualWidth: c.actualWidth })) };
  return new Response(null, { status: 204 });
 });
 renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 const width = await screen.findByLabelText(`Ancho en obra ${unit}`); fireEvent.change(width, { target: { value: "2000" } });
 await userEvent.click(screen.getByText("Detalles técnicos")); await userEvent.selectOptions(screen.getByLabelText("Referencia de vista"), "Inside"); await pauseSketch();
 await userEvent.click(screen.getByText("Guardar medidas"));
 await waitFor(() => expect(screen.getByText("Guardar medidas")).toBeEnabled());
 expect(width).toHaveValue(2000); expect(screen.getByLabelText("Referencia de vista")).toHaveValue("Inside"); expect(screen.getByText(/Croquis en borrador sin guardar/)).toBeInTheDocument();
 await userEvent.click(screen.getByText("Guardar medidas")); await screen.findByText("Operación guardada.");
 expect(commands).toHaveLength(2); expect(screen.getByLabelText(`Medido ${unit}`)).toBeDisabled();
});
it("explains a persisted-height dependency without disabling local technical or dimension edits", async () => {
 const state = initial(); state.structures[0] = { ...state.structures[0], actualHeight: null, technical: null, technicalComplete: false };
 mockBackend(() => state); renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 const height = await screen.findByLabelText(`Alto en obra ${unit}`); fireEvent.change(height, { target: { value: "2400" } });
 await userEvent.click(screen.getByText("Detalles técnicos")); await userEvent.selectOptions(screen.getByLabelText("Manija"), "Confirmed");
 await userEvent.click(screen.getByText("Confirmar 1100 mm"));
 expect(screen.getByText(/Guarda primero el alto real/)).toBeInTheDocument(); expect(height).toBeEnabled(); expect(screen.getByLabelText("Referencia de vista")).toBeEnabled(); expect(screen.getByText("Dibujar croquis")).toBeEnabled();
 expect(screen.getByText("Guardar detalles técnicos")).toBeDisabled();
});
it("confirms retirement with drafts and cancellation preserves them", async () => {
 const b = backend(); renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 const width = await screen.findByLabelText(`Ancho en obra ${unit}`); fireEvent.change(width, { target: { value: "2000" } });
 await userEvent.click(screen.getByRole("button", { name: /Retirar estructura/ }));
 expect(screen.getByRole("alert")).toHaveTextContent("descartará sus borradores");
 await userEvent.click(screen.getByText("Cancelar")); expect(width).toHaveValue(2000); expect(b.commands).toHaveLength(0);
});

it("can unmark an already measured structure without discarding its incomplete technical draft", async () => {
 let state = initial(); state.structures[0].measuredAt = date;
 const writes: MeasurementCommand[] = [];
 mockBackend((_, init) => {
  if (init.method !== "POST") return state;
  const command = JSON.parse(init.body as string) as MeasurementCommand; writes.push(command);
  if (command.action === "Measure") state = { ...state, revision: 1, structures: state.structures.map(s => ({ ...s, measuredAt: null })) };
  return new Response(null, { status: 204 });
 });
 renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 await screen.findByLabelText(`Medido ${unit}`);
 await userEvent.click(screen.getByText("Detalles técnicos")); await userEvent.selectOptions(screen.getByLabelText("Referencia de vista"), "");
 expect(screen.getByLabelText(`Medido ${unit}`)).toBeEnabled();
 await userEvent.click(screen.getByLabelText(`Medido ${unit}`)); await screen.findByText("Operación guardada.");
 expect(screen.getByLabelText("Referencia de vista")).toHaveValue(""); expect(screen.getByText("Detalles técnicos sin guardar.")).toBeInTheDocument();
 expect(screen.getByLabelText(`Medido ${unit}`)).not.toBeChecked(); expect(screen.getByLabelText(`Medido ${unit}`)).toBeDisabled();
 expect(writes).toHaveLength(1); expect(writes[0]).toMatchObject({ action: "Measure", measured: false }); expect(writes[0]).not.toHaveProperty("technical");
});

it("explains when persisted handle details must be saved before reducing actual height", async () => {
 const state = initial(); state.structures[0].technical = { ...complete, handleStatus: "Confirmed", handleHeightMm: 1100 };
 mockBackend(() => state); renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 const height = await screen.findByLabelText(`Alto en obra ${unit}`); fireEvent.change(height, { target: { value: "1000" } });
 expect(screen.getByText(/Guarda primero la corrección de manija/)).toBeInTheDocument(); expect(screen.getByText("Guardar medidas")).toBeDisabled();
 await userEvent.click(screen.getByText("Detalles técnicos")); expect(screen.getByLabelText(/Altura de manija/)).toBeEnabled();
 fireEvent.change(screen.getByLabelText(/Altura de manija/), { target: { value: "900" } }); expect(screen.getByText("Guardar detalles técnicos")).toBeEnabled(); expect(height).toBeEnabled();
});

it("persists measure type, separate site location and optional observations across reload", async () => {
 const b = backend(); const view = renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 await screen.findByLabelText(`Ancho en obra ${unit}`);
 await userEvent.selectOptions(screen.getByLabelText("Tipo de medida"), "Opening");
 fireEvent.change(screen.getByLabelText("Ubicación real"), { target: { value: "Room north" } });
 fireEvent.change(screen.getByLabelText("Observaciones de Instalación"), { target: { value: "Verify access" } });
 await userEvent.click(screen.getByText("Guardar medidas")); await screen.findByText("Operación guardada.");
 expect(b.read().structures[0]).toMatchObject({ measurementType: "Opening", actualLocation: "Room north", installationObservations: "Verify access", width: 1, location: null });
 view.unmount(); renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 expect(await screen.findByLabelText("Ubicación real")).toHaveValue("Room north"); expect(screen.getByLabelText("Tipo de medida")).toHaveValue("Opening"); expect(screen.getByLabelText("Observaciones de Instalación")).toHaveValue("Verify access");
 fireEvent.change(screen.getByLabelText("Observaciones de Instalación"), { target: { value: "" } });
 await userEvent.click(screen.getByText("Guardar medidas")); await screen.findByText("Operación guardada."); expect(b.read().structures[0].installationObservations).toBeNull();
});
it("records explicit comparison and formal modification without silently selecting an old sketch", async () => {
 let state = initial(); state.structures[0] = { ...state.structures[0], comparisonCurrent: false, comparisonStatus: "PendingReview", sketchVersionId: version };
 const commands: MeasurementCommand[] = [];
 mockBackend((path, init) => {
  if (init.method === "POST") { const c = JSON.parse(init.body as string) as MeasurementCommand; commands.push(c); state = { ...state, revision: state.revision + 1 }; return new Response(null, { status: 204 }); }
  if (path.endsWith("/image")) return new Response(new Blob(["webp"], { type: "image/webp" }), { headers: { "Content-Type": "image/webp" } });
  if (path.includes("/sketches/")) return { id: version, structureId: unit, revision: 0, drawing: { version: 1, width: 1200, height: 900, strokes: [] } };
  return state;
 });
 renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 expect(await screen.findByLabelText(`Medido ${unit}`)).toBeDisabled();
 await userEvent.click(screen.getByText("Revisar comparación")); await userEvent.type(screen.getByLabelText("Motivo de revisión"), "Reference confirmed");
 await userEvent.selectOptions(screen.getByLabelText("Referencia dimensional"), "Comparable");
 await userEvent.click(screen.getByText("Modificar estructura")); await userEvent.type(screen.getByLabelText("Motivo de modificación"), "System change");
 expect(screen.getByLabelText(/Confirmo que el croquis/)).not.toBeChecked();
 await userEvent.click(screen.getByText("Confirmar revisión dimensional")); await screen.findByText("Operación guardada.");
 expect(commands[0]).toMatchObject({ action: "ResolveComparison", comparison: { resolution: "Comparable", reason: "Reference confirmed" } });
 expect(screen.getByLabelText("Motivo de modificación")).toHaveValue("System change");
 await userEvent.type(screen.getByLabelText("Descripción de modificación"), "New site configuration"); await userEvent.click(screen.getByLabelText(/Confirmo que el croquis/));
 await userEvent.click(screen.getByText("Guardar modificación")); await waitFor(() => expect(commands).toHaveLength(2));
 expect(commands[1]).toMatchObject({ action: "RecordModification", expectedRevision: 1, modification: { reason: "System change", description: "New site configuration", sketchVersionId: version } });
});
