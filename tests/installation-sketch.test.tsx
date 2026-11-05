import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { SketchEditor } from "@/features/measurements/SketchEditor";
import { emptyDrawing, normalizedPoint, exportWebp } from "@/features/measurements/sketch";
import { SketchPanel } from "@/features/measurements/SketchPanel";
import { renderOperational, mockBackend } from "./operationalFixtures";
import { user } from "./fixtures";
import type { Structure } from "@/features/measurements/contracts";
const ctx = { measureText: vi.fn(() => ({ width: 180 })), fillText: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillStyle: "", strokeStyle: "", lineWidth: 0, lineCap: "", lineJoin: "" };
beforeEach(() => {
 Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
 vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
 vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 10, top: 20, width: 600, height: 450 } as DOMRect);
 Object.defineProperty(HTMLCanvasElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
 vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback({ type: "image/webp", size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as Blob));
});
function pointer(canvas: HTMLElement, event: string, kind: string, x: number, y: number) {
 const e = new Event(event, { bubbles: true, cancelable: true }); Object.assign(e, { pointerId: 1, pointerType: kind, isPrimary: true, button: 0, clientX: x, clientY: y }); fireEvent(canvas, e);
}
it.each(["mouse", "touch", "pen"])("draws with %s, erases, undoes/redoes and exports versioned WEBP", async kind => {
 const save = vi.fn(); render(<SketchEditor drawing={emptyDrawing()} disabled={false} viewSide="Outside" onSave={save} onCancel={vi.fn()} onDirty={vi.fn()} />);
 const canvas = screen.getByLabelText("Lienzo de croquis para mouse, dedo o lápiz");
 pointer(canvas, "pointerdown", kind, 70, 65); pointer(canvas, "pointermove", kind, 310, 245); pointer(canvas, "pointerup", kind, 310, 245);
 expect(screen.getByText(/1\/200 trazos/)).toBeInTheDocument();
 await userEvent.click(screen.getByText("Deshacer")); expect(screen.getByText(/0\/200 trazos/)).toBeInTheDocument();
 await userEvent.click(screen.getByText("Rehacer")); await userEvent.click(screen.getByText("Borrador"));
 pointer(canvas, "pointerdown", kind, 100, 100); pointer(canvas, "pointerup", kind, 100, 100);
 await userEvent.click(screen.getByText("Guardar croquis"));
 await waitFor(() => expect(save).toHaveBeenCalledOnce());
 expect(save.mock.calls[0][0].strokes[0]).toMatchObject({ tool: "Pen", points: [{ x: .1, y: .1 }, { x: .5, y: .5 }] });
 expect(save.mock.calls[0][0].strokes[1].tool).toBe("Eraser"); expect(save.mock.calls[0][1]).toBe("AQID");
 expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", .9);
});
it("requires clear confirmation and cancel never saves the previous drawing", async () => {
 const save = vi.fn(), cancel = vi.fn(); const drawing = emptyDrawing(); drawing.strokes.push({ tool: "Pen", color: "#111111", width: 3, points: [{ x: 0, y: 0 }] });
 render(<SketchEditor drawing={drawing} disabled={false} onSave={save} onCancel={cancel} onDirty={vi.fn()} />);
 await userEvent.click(screen.getByText("Limpiar lienzo")); expect(screen.getByText(/1\/200 trazos/)).toBeInTheDocument();
 await userEvent.click(screen.getByText("Confirmar limpieza")); expect(screen.getByText(/0\/200 trazos/)).toBeInTheDocument();
 await userEvent.click(screen.getByText("Cancelar croquis")); expect(cancel).toHaveBeenCalledOnce(); expect(save).not.toHaveBeenCalled(); expect(drawing.strokes).toHaveLength(1);
});
it("normalizes coordinates independently of screen size and refuses PNG fallback", async () => {
 expect(normalizedPoint(600, 450, { left: 0, top: 0, width: 1200, height: 900 })).toEqual(normalizedPoint(300, 225, { left: 0, top: 0, width: 600, height: 450 }));
 vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(cb => cb(new Blob(["fallback"], { type: "image/png" })));
 await expect(exportWebp(document.createElement("canvas"))).rejects.toThrow("WEBP");
});
it("reloads persisted per-unit strokes and WEBP; read-only state has no editor", async () => {
 const id = "11111111-1111-4111-8111-111111111111";
 const structure: Structure = { id, itemId: id, unitOrdinal: 1, unitCount: 2, itemNumber: "V1", description: "Original", location: null, width: 1, height: 2, createdAt: "", measuredAt: null, retiredAt: null, sketchVersionId: id };
 vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:sketch"); static revokeObjectURL = vi.fn(); });
 const read = { id, structureId: id, revision: 4, drawing: emptyDrawing(), webpSha256: "synthetic" };
 const fetch = mockBackend(path => path.endsWith("/image") ? new Response(new Blob(["webp"], { type: "image/webp" }), { headers: { "Content-Type": "image/webp" } }) : read);
 const view = renderOperational(<SketchPanel projectId={id} structure={structure} writable disabled={false} onCommand={vi.fn()} onDirty={vi.fn()} />, { ...user, roles: ["Installation"], isManagement: false });
 expect(await screen.findByAltText("Croquis de Instalación guardado en WEBP")).toHaveAttribute("src", "blob:sketch");
 await userEvent.click(screen.getByText("Editar croquis")); expect(screen.getByRole("dialog")).toBeInTheDocument();
 await userEvent.click(screen.getByText("Cancelar croquis")); expect(fetch.mock.calls.filter(([, i]) => i.method === "POST")).toHaveLength(0);
 view.unmount();
 renderOperational(<SketchPanel projectId={id} structure={structure} writable={false} disabled={false} onCommand={vi.fn()} onDirty={vi.fn()} />, { ...user, roles: ["Management"], isManagement: true });
 await screen.findByAltText("Croquis de Instalación guardado en WEBP"); expect(screen.queryByText("Editar croquis")).not.toBeInTheDocument();
});

it("shows save errors and the exact-command retry inside the modal", async () => {
 const retry = vi.fn(); render(<SketchEditor drawing={emptyDrawing()} disabled feedback={<><p role="alert">Guardado incierto</p><button onClick={retry}>Reintentar guardado de croquis</button></>} onSave={vi.fn()} onCancel={vi.fn()} onDirty={vi.fn()} />);
 expect(screen.getByRole("alert")).toHaveTextContent("Guardado incierto"); await userEvent.click(screen.getByText("Reintentar guardado de croquis")); expect(retry).toHaveBeenCalledOnce(); expect(screen.getByText("Cancelar croquis")).toBeDisabled();
});

it.each(["mouse", "touch", "pen"])("creates, edits, moves and deletes text with %s and undo/redo", async kind => {
 const save = vi.fn(); render(<SketchEditor drawing={emptyDrawing()} disabled={false} onSave={save} onCancel={vi.fn()} onDirty={vi.fn()} />);
 const canvas = screen.getByLabelText("Lienzo de croquis para mouse, dedo o lápiz");
 await userEvent.click(screen.getByText("Texto")); pointer(canvas, "pointerdown", kind, 70, 65);
 expect(screen.getByLabelText("Contenido del texto")).toHaveFocus();
 const inline = screen.getByLabelText("Contenido del texto").closest("fieldset")!;
 expect(inline).toHaveStyle({ left: "10%", top: "10%" });
 expect(inline.parentElement).toBe(canvas.parentElement);
 await userEvent.type(screen.getByLabelText("Contenido del texto"), "2000 mm{Enter}");
 const id = (screen.getByLabelText("Anotación") as HTMLSelectElement).options[1].value;
 await userEvent.selectOptions(screen.getByLabelText("Anotación"), id);
 fireEvent.change(screen.getByLabelText("Contenido del texto"), { target: { value: "2400 mm" } });
 pointer(canvas, "pointerdown", kind, 310, 245); await userEvent.click(screen.getByText("Confirmar texto"));
 await userEvent.click(screen.getByText("Guardar croquis")); await waitFor(() => expect(save).toHaveBeenCalledOnce());
 expect(save.mock.calls[0][0]).toMatchObject({ version: 2, annotations: [{ id, content: "2400 mm", x: .5, y: .5, size: 24, color: "#111111", order: 0 }] });
 expect(ctx.fillText).toHaveBeenCalledWith("2400 mm", 600, 450, 1200);
 await userEvent.selectOptions(screen.getByLabelText("Anotación"), id); screen.getByText("Eliminar texto").focus(); await userEvent.keyboard("{Enter}");
 expect(screen.queryByLabelText("Anotación")).not.toBeInTheDocument();
 await userEvent.click(screen.getByText("Deshacer")); expect(screen.getByRole("option", { name: "2400 mm" })).toBeInTheDocument();
 await userEvent.click(screen.getByText("Rehacer")); expect(screen.queryByLabelText("Anotación")).not.toBeInTheDocument();
});

it("keeps a successfully closed editor closed when another structure replaces the save receipt", async () => {
 const id = "11111111-1111-4111-8111-111111111111";
 let saved = emptyDrawing();
 vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:sketch"); static revokeObjectURL = vi.fn(); });
 mockBackend(path => path.endsWith("/image") ? new Response(new Blob(["webp"], { type: "image/webp" }), { headers: { "Content-Type": "image/webp" } }) : { id, structureId: id, revision: 1, drawing: saved });
 function Harness() {
  const [receipt, setReceipt] = useState<{ versionId: string; drawing: typeof saved }>();
  const [version, setVersion] = useState<string>();
  const structure: Structure = { id, itemId: id, unitOrdinal: 1, unitCount: 1, itemNumber: "V1", width: 1, height: 2, description: "Synthetic", location: null, createdAt: "", measuredAt: null, retiredAt: null, sketchVersionId: version };
  return <><button onClick={() => setReceipt(undefined)}>Otra estructura guardada</button><SketchPanel savedSketch={receipt} projectId={id} structure={structure} writable disabled={false} onDirty={() => {}} onCommand={a => { if (a.action === "RecordSketch") { saved = a.sketch.drawing; setVersion(id); setReceipt({ versionId: id, drawing: saved }); } }} /></>;
 }
 renderOperational(<Harness />, { ...user, roles: ["Installation"], isManagement: false });
 await userEvent.click(screen.getByText("Dibujar croquis")); const canvas = screen.getByLabelText("Lienzo de croquis para mouse, dedo o lápiz");
 pointer(canvas, "pointerdown", "mouse", 70, 65); pointer(canvas, "pointerup", "mouse", 70, 65);
 await userEvent.click(screen.getByText("Guardar croquis")); await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
 await userEvent.click(screen.getByText("Otra estructura guardada")); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
 await userEvent.click(screen.getByText("Editar croquis")); expect(screen.getByText(/1\/200 trazos/)).toBeInTheDocument();
});
