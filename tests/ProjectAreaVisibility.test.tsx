import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProjectDetailPage } from "@/features/projects/ProjectDetailPage";
import { client, project, inProgressTask, mockBackend, renderOperational } from "./operationalFixtures";
import { handedOffDocuments } from "./documentFixtures";
import { user } from "./fixtures";
vi.mock("@/features/accounting/AccountingPanel", () => ({ AccountingPanel: () => <p>Accounting content</p> }));
vi.mock("@/features/measurements/MeasurementPanel", () => ({ MeasurementPanel: () => <p>Technical measurement workspace</p> }));
vi.mock("@/features/quotationRounds/QuotationRoundsPanel", () => ({ QuotationRoundsPanel: () => <p>Quotation history content</p> }));
vi.mock("@/features/clientDecision/ClientDecisionCard", () => ({ ClientDecisionCard: () => <p>Negotiation content</p> }));
vi.mock("@/features/quotationViews/QuotationReadViews", () => ({ BudgetQuotationReadView: () => <p>Budget quotation content</p>, CommercialQuotationReadView: () => <p>Commercial prices content</p> }));
vi.mock("@/features/budgetQuotation/BudgetQuotationPanel", () => ({ BudgetQuotationPanel: () => <p>Budget quotation content</p> }));
vi.mock("@/features/commercialQuotation/CommercialQuotationPanel", () => ({ CommercialQuotationPanel: () => <p>Commercial review content</p> }));
const tasks = [
 { ...inProgressTask, id: "prepare", assignedToGoogleSubject: user.subject },
 { ...inProgressTask, id: "review", type: "ReviewQuotation", area: "Commercial", assignedToGoogleSubject: user.subject },
 { ...inProgressTask, id: "present", type: "PresentQuotationToClient", area: "Commercial", status: "Completed", assignedToGoogleSubject: user.subject },
 { ...inProgressTask, id: "deposit", type: "RegisterInitialDeposit", area: "Accounting", quotationRound: null, deadlineAt: null, wasOverdue: null, leadTimeStatus: "UntrackedLegacy", assignedToGoogleSubject: user.subject },
 { ...inProgressTask, id: "measure", type: "TakeMeasurements", area: "Installation", quotationRound: null, deadlineAt: null, wasOverdue: null, leadTimeStatus: "UntrackedLegacy", assignedToGoogleSubject: user.subject },
];
it.each(["CommercialAdvisor", "Budgets", "CommercialHead", "Accounting", "Installation", "Management"] as const)("prioritizes the %s workspace while preserving legitimate secondary context", async role => {
 const fetch = mockBackend(path => path.endsWith("/tasks") ? tasks : path.endsWith("/notifications") ? [] : path.endsWith("/documents") ? handedOffDocuments : path.startsWith("clients/") ? client : project);
 renderOperational(<ProjectDetailPage id={project.id} />, { ...user, roles: [role], isManagement: role === "Management" });
 await screen.findByRole("heading", { name: project.name });
 expect(!!screen.queryByText("Accounting content")).toBe(["CommercialAdvisor", "Accounting", "Management"].includes(role));
 expect(!!screen.queryByText("Technical measurement workspace")).toBe(["Installation", "Management"].includes(role));
 expect(!!screen.queryByText("Negotiation content")).toBe(["CommercialAdvisor", "CommercialHead", "Management"].includes(role));
 if (role === "Installation") {
   expect(screen.queryByText("Commercial prices content")).not.toBeInTheDocument();
   expect(screen.queryByText("Quotation history content")).not.toBeInTheDocument();
   expect(screen.getByText("Consultar tareas de otras áreas")).toBeInTheDocument();
 }
 if (["Installation", "Budgets", "CommercialHead", "Accounting"].includes(role)) {
   const details = screen.getByText("Contexto de otras áreas · Consulta complementaria").closest("details")!;
   details.open = true; fireEvent(details, new Event("toggle"));
   expect(await screen.findByText("Accounting content")).toBeInTheDocument();
   expect(screen.getByText("Negotiation content")).toBeInTheDocument();
 }
 expect(fetch.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
 expect(fetch.mock.calls.every(([, init]) => new Headers(init.headers).get("X-SnG-Active-Role") === role)).toBe(true);
});
