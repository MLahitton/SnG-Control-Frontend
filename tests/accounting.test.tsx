import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
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
const approved = { available: true, quotationRound: 2, projectId: id, commercialQuotationId: id, presentQuotationTaskId: id, decision: "Approved", note: null, recordedAt: date };
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
it("requires explicit confirmation for the approved advisor handoff and prevents double clicks", async () => {
 const refresh = vi.fn().mockResolvedValue(undefined);
 const fetch = backend((path, init) => path.endsWith("client-quotation-decision") ? approved : init.method === "POST" ? { state: waiting, task } : absent);
 renderOperational(<AccountingPanel projectId={id} tasks={[presentation]} onRefresh={refresh} />);
 await userEvent.click(await screen.findByRole("button", { name: "Enviar a Contabilidad" }));
 expect(fetch.mock.calls.filter(([, i]) => i.method === "POST")).toHaveLength(0);
 expect(screen.getByText(/asociada a la ronda 2 aprobada/)).toBeInTheDocument();
 const confirm = screen.getByRole("button", { name: "Confirmar envío a Contabilidad" }); fireEvent.click(confirm); fireEvent.click(confirm);
 expect(await screen.findByText(/Esperando registro del anticipo/)).toBeInTheDocument();
 expect(fetch.mock.calls.filter(([, i]) => i.method === "POST")).toHaveLength(1);
 await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
});
it.each(["ChangesRequested", "Rejected"])("never offers handoff for %s", async decision => {
 backend(path => path.endsWith("client-quotation-decision") ? { ...approved, decision } : absent);
 renderOperational(<AccountingPanel projectId={id} tasks={[presentation]} onRefresh={vi.fn()} />);
 await screen.findByText(/Sin envío/); expect(screen.queryByRole("button", { name: "Enviar a Contabilidad" })).not.toBeInTheDocument();
});
it("records canonical money and Colombia receipt time after confirmation, then restores read-only state on remount", async () => {
 let saved = false;
 const fetch = backend((_, init) => { if (init.method === "POST") { expect(JSON.parse(init.body as string)).toEqual({ amount: "5000000.01", receivedAt: "2026-10-28T12:00:00-05:00", reference: "TEST", note: null }); saved = true; return { state: recorded, task: completed }; } return saved ? recorded : waiting; });
 const view = renderOperational(<AccountingPanel projectId={id} tasks={[task]} onRefresh={vi.fn()} />, { ...user, roles: ["Accounting"] });
 await userEvent.type(await screen.findByLabelText("Valor recibido (COP)"), "5000000,01");
 fireEvent.change(screen.getByLabelText("Fecha/hora de recepción (Colombia)"), { target: { value: "2026-10-28T12:00" } });
 await userEvent.type(screen.getByLabelText("Referencia opcional"), "TEST");
 await userEvent.click(screen.getByRole("button", { name: "Registrar anticipo" }));
 expect(fetch.mock.calls.filter(([, i]) => i.method === "POST")).toHaveLength(0);
 const confirm = screen.getByRole("button", { name: "Confirmar registro" }); fireEvent.click(confirm); fireEvent.click(confirm);
 expect(await screen.findByText("Anticipo registrado")).toBeInTheDocument();
 expect(screen.getByText("$5.000.000,01 COP")).toBeInTheDocument();
 expect(fetch.mock.calls.filter(([, i]) => i.method === "POST")).toHaveLength(1);
 view.unmount(); renderOperational(<AccountingPanel projectId={id} tasks={[task]} onRefresh={vi.fn()} />, { ...user, roles: ["Accounting"] });
 await screen.findByText("Anticipo registrado"); expect(screen.queryByLabelText("Valor recibido (COP)")).not.toBeInTheDocument();
});
it.each(["Management", "CommercialHead", "CommercialAdvisor"] as const)("shows read-only deposit to %s", async role => {
 backend(() => recorded);
 renderOperational(<AccountingPanel projectId={id} tasks={[task]} onRefresh={vi.fn()} />, { ...user, roles: [role], isManagement: role === "Management" });
 await screen.findByText("Anticipo registrado"); expect(screen.queryByRole("button", { name: "Registrar anticipo" })).not.toBeInTheDocument();
});
it("does not let another assigned accountant record", async () => {
 backend(() => waiting);
 renderOperational(<AccountingPanel projectId={id} tasks={[{ ...task, assignedToGoogleSubject: "another" }]} onRefresh={vi.fn()} />, { ...user, roles: ["Accounting"] });
 await screen.findByText(/Esperando registro/); expect(screen.queryByLabelText("Valor recibido (COP)")).not.toBeInTheDocument();
});
it("reads the assigned Accounting inbox with project, client and SG context", async () => {
 const fetch = backend(path => path === "clients" ? [client] : path === "projects" ? [{ ...project, id, sgCode: "SG0091" }] : [task]);
 renderOperational(<TasksPage />, { ...user, roles: ["Accounting"] });
 expect(await screen.findByText("Registrar anticipo inicial")).toBeInTheDocument();
 expect(screen.getByText(/Cliente de prueba/)).toBeInTheDocument(); expect(screen.getByText(/SG0091/)).toBeInTheDocument();
 expect(fetch.mock.calls.some(([url]) => url.includes("area=Accounting") && url.includes("status=Pending"))).toBe(true);
});

it("handles concurrent AlreadyRecorded by rereading, without retrying the write", async () => {
 let saved = false;
 const refresh = vi.fn().mockResolvedValue(undefined);
 const fetch = backend((_, init) => { if (init.method === "POST") { saved = true; return Response.json({ code: "AlreadyRecorded", detail: "private infrastructure detail" }, { status: 409 }); } return saved ? recorded : waiting; });
 renderOperational(<AccountingPanel projectId={id} tasks={[task]} onRefresh={refresh} />, { ...user, roles: ["Accounting"] });
 await userEvent.type(await screen.findByLabelText("Valor recibido (COP)"), "5000000.01");
 fireEvent.change(screen.getByLabelText("Fecha/hora de recepción (Colombia)"), { target: { value: "2026-10-28T12:00" } });
 await userEvent.click(screen.getByRole("button", { name: "Registrar anticipo" }));
 await userEvent.click(screen.getByRole("button", { name: "Confirmar registro" }));
 await screen.findByText("Anticipo registrado");
 expect(screen.getByRole("alert")).toHaveTextContent("ya está registrado");
 expect(screen.queryByText("private infrastructure detail")).not.toBeInTheDocument();
 expect(fetch.mock.calls.filter(([, i]) => i.method === "POST")).toHaveLength(1);
 expect(refresh).toHaveBeenCalledTimes(1);
});
