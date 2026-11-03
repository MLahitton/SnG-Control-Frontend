import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ProjectDetailPage } from "@/features/projects/ProjectDetailPage";
import { MeasurementPanel } from "@/features/measurements/MeasurementPanel";
import type { MeasurementState } from "@/features/measurements/contracts";
import { renderOperational, mockBackend, project, client, task } from "./operationalFixtures";
import { user } from "./fixtures";
const id = "11111111-1111-4111-8111-111111111111";
const date = "2026-11-03T18:00:00Z";
const installer = { ...user, roles: ["Installation" as const], isManagement: false };
const ready: MeasurementState = {
 projectId: id, taskId: id, taskStatus: "InProgress", responsibleSubject: user.subject, canModify: true, checklistId: id, revision: 0,
 summary: { initial: 2, added: 0, retired: 0, active: 2, measured: 0, pending: 2, progress: 0 },
 structures: [1, 2].map(n => ({ id: `${n}2222222-2222-4222-8222-222222222222`, itemId: id, itemNumber: "V1", unitOrdinal: n, unitCount: 2, description: "Ventana", location: "Sala", width: 1.2, height: 2, note: null, createdAt: date, measuredAt: null, retiredAt: null })),
 documents: [], history: [], submissionId: null, submittedAt: null,
};
const doc = { id, originalFileName: "medidas.pdf", contentType: "application/pdf", sizeBytes: 3, uploadedAt: date, uploadedBy: { name: "Installer", email: null }, uploadBatchId: id, isCurrent: true, replacedAt: null, replacedByDocumentId: null, inInitialHandoff: false };
it("keeps independent checks and presents official progress after save and reload", async () => {
 let state = structuredClone(ready);
 const fetch = mockBackend((_, init) => { if (init.method === "POST") { const body = JSON.parse(init.body as string); expect(body.expectedRevision).toBe(0); expect(body.action).toBe("Measure"); state = { ...state, revision: 1, structures: state.structures.map(s => s.id === body.structureId ? { ...s, measuredAt: date } : s), summary: { ...state.summary, measured: 1, pending: 1, progress: 50 } }; return new Response(null, { status: 204 }); } return state; });
 const view = renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 const checks = await screen.findAllByRole("checkbox"); expect(checks).toHaveLength(2);
 fireEvent.click(checks[0]); fireEvent.click(checks[0]);
 await screen.findByText(/Avance: 50%/); expect(screen.getAllByRole("checkbox")[0]).toBeChecked(); expect(screen.getAllByRole("checkbox")[1]).not.toBeChecked();
 expect(fetch.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
 view.unmount(); renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 expect((await screen.findAllByRole("checkbox"))[0]).toBeChecked();
});
it("requires retirement confirmation and cancellation does not write", async () => {
 const fetch = mockBackend(() => ready); renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 await userEvent.click((await screen.findAllByRole("button", { name: /Retirar estructura/ }))[0]);
 await userEvent.click(screen.getByRole("button", { name: "Cancelar" })); expect(fetch.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(0);
});
it("retries the same command after unknown transport failure", async () => {
 const bodies: string[] = [];
 mockBackend((_, init) => { if (init.method === "POST") { bodies.push(init.body as string); if (bodies.length === 1) throw new TypeError("network"); return new Response(null, { status: 204 }); } return ready; });
 renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, installer);
 fireEvent.click((await screen.findAllByRole("checkbox"))[0]);
 await userEvent.click(await screen.findByRole("button", { name: "Reintentar operación pendiente" }));
 await waitFor(() => expect(bodies).toHaveLength(2)); expect(bodies[0]).toBe(bodies[1]);
});
it.each(["Management", "Accounting", "CommercialAdvisor"] as const)("denies UI writes for %s even with the same subject and server flag", async role => {
 mockBackend(() => ready); renderOperational(<MeasurementPanel projectId={id} onRefresh={vi.fn()} />, { ...user, roles: [role], isManagement: role === "Management" });
 for (const check of await screen.findAllByRole("checkbox")) expect(check).toBeDisabled();
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
 expect(screen.getAllByRole("checkbox")).toHaveLength(2);
 expect(screen.getAllByRole("heading", { name: "Toma de medidas", level: 2 })).toHaveLength(1);
});
