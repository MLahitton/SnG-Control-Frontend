import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { parseVerification } from "@/features/accounting/verification";
import { AccountingPanel } from "@/features/accounting/AccountingPanel";
import { canonicalAmount, formatDeposit, parseAccounting, parseAccountingWrite } from "@/features/accounting/contracts";
import { TasksPage } from "@/features/tasks/TasksPage";
import { renderOperational, task as baseTask, project, client } from "./operationalFixtures";
import { user } from "./fixtures";
const id = "11111111-1111-4111-8111-111111111111";
const date = "2026-10-28T18:00:00Z";
const absent = { projectId: id, accountingHandoff: { available: false, quotationRound: null, commercialQuotationId: null, sentAt: null }, deposit: { available: false, amount: null, currencyCode: "COP", receivedAt: null, recordedAt: null, reference: null, note: null } };
const waiting = { ...absent, accountingHandoff: { available: true, quotationRound: 2, commercialQuotationId: id, sentAt: date } };
const recorded = { ...waiting, deposit: { available: true, amount: "5000000.01", currencyCode: "COP", receivedAt: "2026-10-28T12:00:00-05:00", recordedAt: date, reference: "TEST", note: null } };
const task = { ...baseTask, projectId: id, quotationRound: null, type: "RegisterInitialDeposit" as const, area: "Accounting" as const, assignedToGoogleSubject: user.subject };
const completed = { ...task, status: "Completed", startedAt: date, completedAt: date, leadTimeStatus: "UntrackedLegacy" };
const presentation = { ...baseTask, projectId: id, type: "PresentQuotationToClient" as const, area: "Commercial" as const, quotationRound: 2, status: "Completed" as const, assignedToGoogleSubject: user.subject };
function backend(handler: (path: string, init: RequestInit) => unknown) {
 const fetch = vi.fn(async (url: string, init: RequestInit) => { const v = handler(url.replace("/api/backend/", ""), init); return v instanceof Response ? v : Response.json(v); });
 vi.stubGlobal("fetch", fetch); return fetch;
}
it("keeps absent, waiting and recorded evidence separate with exact COP values", () => {
 for (const value of [absent, waiting, recorded]) expect(parseAccounting(value, id)).toEqual(value);
 expect(parseAccountingWrite({ state: recorded, task: completed }, id, "record").state).toEqual(recorded);
 expect(parseAccountingWrite({ state: waiting, task }, id, "send").task.quotationRound).toBeNull();
 expect(formatDeposit("999999999999999999.99")).toBe("$999.999.999.999.999.999,99 COP");
 expect(canonicalAmount("5000000,01")).toBe("5000000.01");
});
it.each(["0", "-1", "1e6", "5.000.000,00", "NaN", "1.001", "1000000000000000000", "  "])("rejects noncanonical or invalid input %s", v => expect(canonicalAmount(v)).toBeNull());
it.each([{ amount: 5 }, { amount: "0.00" }, { currencyCode: "USD" }, { receivedAt: "2026-10-28T12:00:00" }, { recordedAt: "2020-01-01T00:00:00Z" }, { available: false }, { extra: true }])("rejects malformed deposit %j", change => {
 expect(() => parseAccounting({ ...recorded, deposit: { ...recorded.deposit, ...change } }, id)).toThrow();
});
it("rejects incomplete completion and invented task timing", () => {
 for (const change of [{ deadlineAt: date }, { quotationRound: 2 }, { startedAt: null }, { completedAt: null }, { area: "Budgets" }]) expect(() => parseAccountingWrite({ state: recorded, task: { ...completed, ...change } }, id, "record")).toThrow();
});

const docId = "22222222-2222-4222-8222-222222222222";
const reviewId = "33333333-3333-4333-8333-333333333333";
const doc = { id: docId, originalFileName: "receipt.pdf", contentType: "application/pdf", sizeBytes: 3, uploadedAt: date, uploadedBy: { email: null, name: "Advisor" }, uploadBatchId: id, isCurrent: true, replacedAt: null, replacedByDocumentId: null, inInitialHandoff: false };
const review = { id: reviewId, status: "Pending", submittedAt: date, decidedAt: null, decidedBy: null, note: null, documentIds: [docId] };
const ready = { projectId: id, available: true, canManage: true, canSubmit: true, canReview: false, accounting: absent, documents: [doc], reviews: [] };
const pending = { ...ready, canManage: false, canSubmit: false, canReview: true, accounting: waiting, reviews: [review] };
const done = { ...pending, canReview: false, accounting: recorded, reviews: [{ ...review, status: "Approved", decidedAt: date, decidedBy: { name: "Accountant", email: null } }] };
it("requires confirmation, freezes selected receipts and prevents double clicks", async () => {
 let sent = false;
 const refresh = vi.fn().mockResolvedValue(undefined);
 const fetch = backend((_, init) => { if (init.method === "POST") { const body = JSON.parse(init.body as string); expect(body.documentIds).toEqual([docId]); expect(body.requestKey).toMatch(/^[0-9a-f-]{36}$/); sent = true; return { reviewId }; } return sent ? pending : ready; });
 renderOperational(<AccountingPanel projectId={id} tasks={[presentation]} onRefresh={refresh} />);
 await userEvent.click(await screen.findByRole("button", { name: "Enviar a Contabilidad" }));
 expect(fetch.mock.calls.filter(([, i]) => i.method === "POST")).toHaveLength(0);
 await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
 expect(fetch.mock.calls.filter(([, i]) => i.method === "POST")).toHaveLength(0);
 await userEvent.click(screen.getByRole("button", { name: "Enviar a Contabilidad" }));
 const confirm = screen.getByRole("button", { name: "Confirmar envío a Contabilidad" }); fireEvent.click(confirm); fireEvent.click(confirm);
 await screen.findByText(/Revisión pendiente de Contabilidad/);
 expect(fetch.mock.calls.filter(([, i]) => i.method === "POST")).toHaveLength(1);
 await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
});
it("does not show the section before the approved stage", async () => {
 backend(() => ({ ...ready, available: false, canManage: false, canSubmit: false, documents: [] }));
 renderOperational(<AccountingPanel projectId={id} tasks={[presentation]} onRefresh={vi.fn()} />);
 await waitFor(() => expect(screen.queryByText(/Consultando etapa/)).not.toBeInTheDocument());
 expect(screen.queryByText("Verificación del anticipo")).not.toBeInTheDocument();
});
async function enterPayment() {
 await userEvent.type(await screen.findByLabelText("Valor recibido (COP)"), "5000000,01");
 fireEvent.change(screen.getByLabelText("Fecha/hora de recepción (Colombia)"), { target: { value: "2026-10-28T12:00" } });
 await userEvent.click(screen.getByRole("button", { name: "Aprobar anticipo" }));
}
it("approves canonical COP and aware receipt time, confirms once and restores state on reload", async () => {
 let saved = false;
 const fetch = backend((_, init) => { if (init.method === "POST") { expect(JSON.parse(init.body as string)).toEqual({ approve: true, amount: "5000000.01", receivedAt: "2026-10-28T12:00:00-05:00", note: null }); saved = true; return new Response(null, { status: 204 }); } return saved ? done : pending; });
 const view = renderOperational(<AccountingPanel projectId={id} tasks={[task]} onRefresh={vi.fn()} />, { ...user, roles: ["Accounting"] });
 await enterPayment();
 expect(fetch.mock.calls.filter(([, i]) => i.method === "POST")).toHaveLength(0);
 const confirm = screen.getByRole("button", { name: "Confirmar aprobación" }); fireEvent.click(confirm); fireEvent.click(confirm);
 await screen.findByText("Anticipo registrado"); expect(screen.getByText("$5.000.000,01 COP")).toBeInTheDocument();
 expect(fetch.mock.calls.filter(([, i]) => i.method === "POST")).toHaveLength(1);
 view.unmount(); renderOperational(<AccountingPanel projectId={id} tasks={[task]} onRefresh={vi.fn()} />, { ...user, roles: ["Accounting"] });
 await screen.findByText("Anticipo registrado"); expect(screen.queryByLabelText("Valor recibido (COP)")).not.toBeInTheDocument();
});
it.each(["Management", "CommercialHead", "CommercialAdvisor"] as const)("keeps %s read only", async role => {
 backend(() => pending);
 renderOperational(<AccountingPanel projectId={id} tasks={[task]} onRefresh={vi.fn()} />, { ...user, roles: [role], isManagement: role === "Management" });
 await screen.findByText("Verificación del anticipo");
 expect(screen.queryByRole("button", { name: "Aprobar anticipo" })).not.toBeInTheDocument();
 expect(screen.queryByLabelText("Adjuntar comprobantes")).not.toBeInTheDocument();
});
it("does not allow another accountant to decide", async () => {
 backend(() => pending);
 renderOperational(<AccountingPanel projectId={id} tasks={[{ ...task, assignedToGoogleSubject: "another" }]} onRefresh={vi.fn()} />, { ...user, roles: ["Accounting"] });
 await screen.findByText(/Revisión pendiente/); expect(screen.queryByLabelText("Valor recibido (COP)")).not.toBeInTheDocument();
});
it("reads the assigned Accounting inbox with project, client and SG context", async () => {
 const fetch = backend(path => path === "clients" ? [client] : path === "projects" ? [{ ...project, id, sgCode: "SG0091" }] : [task]);
 renderOperational(<TasksPage />, { ...user, roles: ["Accounting"] });
 expect(await screen.findByText("Registrar anticipo inicial")).toBeInTheDocument();
 expect(screen.getByText(/Cliente de prueba/)).toBeInTheDocument(); expect(screen.getByText(/SG0091/)).toBeInTheDocument();
 expect(fetch.mock.calls.some(([url]) => url.includes("area=Accounting") && url.includes("status=Pending"))).toBe(true);
});
it("refreshes a concurrent decision without retrying the write or exposing server detail", async () => {
 let saved = false; const refresh = vi.fn().mockResolvedValue(undefined);
 const fetch = backend((_, init) => { if (init.method === "POST") { saved = true; return Response.json({ code: "VerificationAlreadyDecided", detail: "private infrastructure detail" }, { status: 409 }); } return saved ? done : pending; });
 renderOperational(<AccountingPanel projectId={id} tasks={[task]} onRefresh={refresh} />, { ...user, roles: ["Accounting"] });
 await enterPayment(); await userEvent.click(screen.getByRole("button", { name: "Confirmar aprobación" }));
 await screen.findByText("Anticipo registrado");
 expect(screen.getByRole("alert")).toHaveTextContent("ya fue resuelta");
 expect(screen.queryByText("private infrastructure detail")).not.toBeInTheDocument();
 expect(fetch.mock.calls.filter(([, i]) => i.method === "POST")).toHaveLength(1);
 expect(refresh).toHaveBeenCalledTimes(1);
});
it("requires a rejection note, preserves reviewed evidence and allows a later request", async () => {
 let rejected = false;
 const history = { ...ready, accounting: waiting, reviews: [{ ...review, status: "Rejected", note: "Comprobante ilegible", decidedAt: date, decidedBy: { email: null, name: "Accountant" } }] };
 const fetch = backend((_, init) => { if (init.method === "POST") { expect(JSON.parse(init.body as string)).toEqual({ approve: false, amount: null, receivedAt: null, note: "Comprobante ilegible" }); rejected = true; return new Response(null, { status: 204 }); } return rejected ? history : pending; });
 const view = renderOperational(<AccountingPanel projectId={id} tasks={[task]} onRefresh={vi.fn()} />, { ...user, roles: ["Accounting"] });
 expect(await screen.findByRole("button", { name: "Rechazar anticipo" })).toBeDisabled();
 await userEvent.type(screen.getByLabelText("Observaciones"), "Comprobante ilegible");
 await userEvent.click(screen.getByRole("button", { name: "Rechazar anticipo" }));
 expect(fetch.mock.calls.filter(([, i]) => i.method === "POST")).toHaveLength(0);
 await userEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
 await screen.findByText("Comprobante ilegible");
 view.unmount(); renderOperational(<AccountingPanel projectId={id} tasks={[presentation]} onRefresh={vi.fn()} />);
 expect(await screen.findByRole("button", { name: "Enviar a Contabilidad" })).toBeEnabled();
 expect(screen.getByText("Comprobante ilegible")).toBeInTheDocument();
 expect(screen.getAllByRole("button", { name: "receipt.pdf" })).toHaveLength(2);
});
it("uploads multiple files with explicit replacement without submitting them", async () => {
 const fetch = backend((path, init) => { if (init.method === "POST") { expect(path).toMatch(/receipts\/batch$/); const form = init.body as FormData; expect(form.get("file-0")).toBeInstanceOf(File); expect(form.get("file-1")).toBeInstanceOf(File); expect(form.get("file-2")).toBeNull(); return {}; } return ready; });
 renderOperational(<AccountingPanel projectId={id} tasks={[presentation]} onRefresh={vi.fn()} />);
 await userEvent.upload(await screen.findByLabelText("Adjuntar comprobantes"), [new File(["one"], "corrected.pdf"), new File(["two"], "additional.pdf")]);
 await userEvent.selectOptions(screen.getByLabelText("corrected.pdf"), docId);
 await userEvent.click(screen.getByRole("button", { name: "Cargar comprobantes" }));
 await screen.findByText(/Comprobantes cargados/);
 const form = fetch.mock.calls.find(([, i]) => i.method === "POST")![1].body as FormData;
 const manifest = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(form.get("manifest") as Blob); });
 expect(JSON.parse(manifest).files[0].replacesDocumentId).toBe(docId);
 expect(fetch.mock.calls.filter(([, i]) => i.method === "POST")).toHaveLength(1);
});
it("reuses the same idempotency key after a failed submit", async () => {
 const keys: string[] = [];
 backend((_, init) => { if (init.method === "POST") { keys.push(JSON.parse(init.body as string).requestKey); return Response.json({}, { status: 503 }); } return ready; });
 renderOperational(<AccountingPanel projectId={id} tasks={[presentation]} onRefresh={vi.fn()} />);
 await userEvent.click(await screen.findByRole("button", { name: "Enviar a Contabilidad" }));
 await userEvent.click(screen.getByRole("button", { name: "Confirmar envío a Contabilidad" }));
 await screen.findByRole("alert");
 await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar envío a Contabilidad" })).toBeEnabled());
 await userEvent.click(screen.getByRole("button", { name: "Confirmar envío a Contabilidad" }));
 await waitFor(() => expect(keys).toHaveLength(2)); expect(keys[0]).toBe(keys[1]);
});
it("rejects foreign evidence, duplicate pending reviews and malformed decisions", () => {
 expect(parseVerification(pending, id)).toEqual(pending);
 for (const change of [{ projectId: docId }, { documents: [] }, { reviews: [review, { ...review, id }] }, { reviews: [{ ...review, status: "Rejected" }] }, { documents: [doc, doc] }]) expect(() => parseVerification({ ...pending, ...change }, id)).toThrow();
});

it("explains missing Installation configuration without completing or retrying approval", async () => {
 const fetch = backend((_, init) => init.method === "POST" ? Response.json({ code: "InstallationAssigneeNotConfigured" }, { status: 503 }) : pending);
 renderOperational(<AccountingPanel projectId={id} tasks={[task]} onRefresh={vi.fn()} />, { ...user, roles: ["Accounting"] });
 await enterPayment(); await userEvent.click(screen.getByRole("button", { name: "Confirmar aprobación" }));
 expect(await screen.findByRole("alert")).toHaveTextContent("Falta configurar la cuenta de Instalación");
 expect(screen.queryByText("Anticipo registrado")).not.toBeInTheDocument();
 expect(fetch.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
});

it("shows receipt correction in the advisor default inbox and links to the project", async () => {
 const correction = { ...task, type: "CorrectDepositReceipts", area: "Commercial", status: "InProgress", startedAt: date, leadTimeStatus: "UntrackedLegacy" };
 const fetch = backend(path => path === "projects" ? [{ ...project, id }] : [correction]);
 renderOperational(<TasksPage />);
 await screen.findByText("Corregir comprobantes del anticipo");
 expect(screen.getByRole("link", { name: project.name })).toHaveAttribute("href", `/projects/${id}`);
 expect(screen.getByText(/Corrección de comprobantes sin SLA/)).toBeInTheDocument();
 expect(fetch.mock.calls.some(([url]) => url.includes("area=Commercial") && url.includes("status=InProgress"))).toBe(true);
});
