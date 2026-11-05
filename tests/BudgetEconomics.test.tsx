import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { parseEconomics, type BudgetEconomics } from "@/features/budgetQuotation/economics";
import { parsePreview, parseConfirmation } from "@/features/budgetQuotation/parser";
import { parseBudgetView } from "@/features/quotationViews/contracts";
import { BudgetQuotationPreview } from "@/features/budgetQuotation/BudgetQuotationPreview";
import { BudgetQuotationReadView } from "@/features/quotationViews/QuotationReadViews";
import { BudgetEconomicsNotice } from "@/features/budgetQuotation/BudgetEconomicsNotice";
import { createDraft, buildConfirmation } from "@/features/budgetQuotation/validation";
import { formatProposalMoney } from "@/features/quotationViews/proposalFormat";
import { quotationPreview, quotationConfirmed } from "./budgetQuotationFixtures";
import { budgetRead } from "./quotationReadFixtures";
import { mockBackend, renderOperational } from "./operationalFixtures";
import { user } from "./fixtures";
const economics: BudgetEconomics = {
  status: "Success", currencyCode: "COP", projectTotal: "1234567.89", projectTotalCell: "O343", mainItemTotalsDiffer: true,
  items: quotationPreview.items.map((i,n) => ({ section: i.section, sourceRow: i.sourceRow, unitPrice: n ? "20.01" : "1000.25", totalPrice: n ? "33.02" : "500.03" })),
};
it("accepts precise decimals on preview, confirmation and historical read, without changing technical submission", () => {
  const preview = parsePreview({ ...quotationPreview, economics }, quotationPreview.projectId);
  expect(preview.economics).toEqual(economics);
  expect(parseConfirmation({ ...quotationConfirmed, economics }, quotationConfirmed.projectId).economics).toEqual(economics);
  expect(parseBudgetView({ ...budgetRead, economics }, budgetRead.projectId).economics).toEqual(economics);
  expect(buildConfirmation(preview, createDraft(preview))).toEqual(buildConfirmation(quotationPreview, createDraft(quotationPreview)));
  expect(formatProposalMoney("9007199254740993.01")).toBe("COP $ 9.007.199.254.740.993,01");
});
it.each(["row", "duplicate", "number", "currency", "extra", "partial"])("rejects invalid economics: %s", kind => {
  const v = structuredClone(economics);
  if (kind === "row") v.items[0].sourceRow = 99999;
  if (kind === "duplicate") v.items[1] = v.items[0];
  if (kind === "number") Object.assign(v.items[0], { unitPrice: 1000.25 });
  if (kind === "currency") Object.assign(v, { currencyCode: "USD" });
  if (kind === "extra") Object.assign(v, { storageKey: "private" });
  if (kind === "partial") v.items.pop();
  expect(() => parseEconomics(v, quotationPreview.items)).toThrow();
});
it("shows original item prices by row even when response order differs, preserving total and edited quantities", () => {
  const preview = { ...quotationPreview, economics: { ...economics, items: [...economics.items].reverse() } };
  const draft = createDraft(preview); draft[0].quantity = "9";
  render(<BudgetQuotationPreview preview={preview} draft={draft} disabled={false} onChange={() => {}} />);
  expect(within(screen.getByRole("group", { name: "Ítem V-2" })).getByText("COP $ 1.000,25")).toBeInTheDocument();
  expect(within(screen.getByRole("group", { name: "Ítem V-2" })).getByText("COP $ 500,03")).toBeInTheDocument();
  expect(screen.getByText("COP $ 1.234.567,89")).toBeInTheDocument();
  expect(screen.getByText(/suma de subtotales principales difiere/)).toBeInTheDocument();
});
it.each([
  ["RecalculationRequired", /necesita recalcularse/],
  ["InconsistentFormulaCache", /no coinciden/],
  ["InvalidEconomics", /No se pudieron validar/],
  ["OriginalUnavailable", /archivo original/],
] as const)("explains unavailable %s without manufactured zero amounts", (status, message) => {
  render(<BudgetEconomicsNotice economics={{ status, currencyCode: "COP", projectTotal: null, projectTotalCell: null, items: [], mainItemTotalsDiffer: null }} />);
  expect(screen.getByText(message)).toBeInTheDocument();
  expect(screen.queryByText(/COP \$/)).not.toBeInTheDocument();
});
it("reads the confirmed original again after remount and does not mix projects or versions", async () => {
  const second = { ...budgetRead, projectId: "project-2", quotationVersionId: "version-2", versionNumber: 2,
    economics: { ...economics, projectTotal: "7654321.98" } };
  mockBackend(() => { throw new Error("Unexpected request"); }, path => path.includes("project-2")
    ? second : { ...budgetRead, economics });
  const account = { ...user, roles: ["Management" as const], isManagement: true };
  const view = renderOperational(<BudgetQuotationReadView projectId={budgetRead.projectId} />, account);
  expect(await screen.findByText("COP $ 1.234.567,89")).toBeInTheDocument();
  view.unmount();
  const reload = renderOperational(<BudgetQuotationReadView projectId={budgetRead.projectId} />, account);
  expect(await screen.findByText("COP $ 1.234.567,89")).toBeInTheDocument();
  reload.unmount();
  renderOperational(<BudgetQuotationReadView projectId="project-2" />, account);
  expect(await screen.findByText("COP $ 7.654.321,98")).toBeInTheDocument();
  expect(screen.queryByText("COP $ 1.234.567,89")).not.toBeInTheDocument();
  expect(() => parseBudgetView(second, budgetRead.projectId)).toThrow();
});
