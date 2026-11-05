import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { useState } from "react";
import { formatSurface, formatProposalValue, formatProposalMoney, proposalTotals, unitSurface } from "@/features/quotationViews/proposalFormat";
import { ProposalTotals, ItemPrices } from "@/features/quotationViews/ProposalSummary";
import { BudgetQuotationItemEditor } from "@/features/budgetQuotation/BudgetQuotationItemEditor";
import { buildConfirmation, createDraft } from "@/features/budgetQuotation/validation";
import { quotationPreview } from "./budgetQuotationFixtures";
it.each([[2.8772999999999995, "2,88 m²"], [1.5, "1,50 m²"], [0, "0,00 m²"], [null, "No disponible"], [undefined, "No disponible"]])("formats %s without changing the source", (value, expected) => {
  expect(formatSurface(value)).toBe(expected);
});
it("uses mm for lengths and keeps surfaces in m², with explicit absent money", () => {
  expect(formatProposalValue("width", 2)).toBe("2.000 mm");
  expect(formatProposalValue("Height", "2.4")).toBe("2.400 mm");
  expect(formatProposalValue("squareMeters", 4.8)).toBe("4,80 m²");
  expect(formatProposalMoney(null)).toContain("No disponible");
  expect(formatProposalMoney(0)).not.toContain("No disponible");
});
it.each([
  [[{ squareMeters: 2.8, quantity: 1 }], 1, 2.8],
  [[{ squareMeters: 5.6, quantity: 2 }], 2, 5.6],
  [[{ squareMeters: 5.6, quantity: 2 }, { squareMeters: 1.4, quantity: 1 }], 3, 7],
] as const)("sums each complete item area exactly once", (items, units, surface) => {
  expect(proposalTotals(items)).toEqual({ units, surface });
  expect(unitSurface(5.6, 2)).toBe(2.8);
  expect(unitSurface(0, 0)).toBeNull();
});
it("does not manufacture totals for an incomplete draft", () => {
  expect(proposalTotals([{ squareMeters: NaN, quantity: 2 }]).surface).toBeNull();
});
it("renders document-authoritative money even when it differs from unit price times quantity or item sum", () => {
  render(<><ProposalTotals items={[{ squareMeters: 5.6, quantity: 2 }]} projectTotal={987654.3217} />
    <ItemPrices unitPrice={7.125} totalPrice={100.4567} /><ItemPrices /></>);
  expect(screen.getByText(/987.654,3217/)).toBeInTheDocument();
  expect(screen.getByText(/100,4567/)).toBeInTheDocument();
  expect(screen.getByText(/7,125/)).toBeInTheDocument();
  expect(screen.getAllByText("No disponible en esta etapa")).toHaveLength(2);
  expect(screen.getByText("5,60 m²")).toBeInTheDocument();
});
it("edits mm but submits metres and preserves unedited source area and economics", () => {
  const original = structuredClone(quotationPreview);
  const draft = createDraft(original);
  let saved = draft;
  function Editor() {
    const [items, setItems] = useState(draft);
    saved = items;
    return <BudgetQuotationItemEditor item={original.items[0]} draft={items[0]} disabled={false} ambiguous={false}
      onChange={(field, value) => setItems(items.map((i,n) => n === 0 ? { ...i, [field]: value } : i))} />;
  }
  render(<Editor />);
  fireEvent.change(screen.getByLabelText("Ancho (mm)"), { target: { value: "2000" } });
  fireEvent.change(screen.getByLabelText("Alto (mm)"), { target: { value: "2400" } });
  const payload = buildConfirmation(original, saved)!;
  expect(payload.items[0].width).toBe(2);
  expect(payload.items[0].height).toBe(2.4);
  expect(payload.items[0].squareMeters).toBe(original.items[0].squareMeters);
  expect(original).toEqual(quotationPreview);
  expect(screen.getByLabelText("Ancho (mm)")).toHaveValue(2000);
});

it("rounds the surface input for resting display without changing its precise draft", () => {
  const original = structuredClone(quotationPreview); original.items[0].squareMeters = 2.8772999999999995;
  const draft = createDraft(original);
  render(<BudgetQuotationItemEditor item={original.items[0]} draft={draft[0]} disabled={false} ambiguous={false} onChange={() => { throw new Error("Unexpected mutation"); }} />);
  const input = screen.getByLabelText("Superficie total del ítem (m²)");
  expect(input).toHaveValue(2.88);
  fireEvent.focus(input); expect(input).toHaveValue(2.8772999999999995);
  fireEvent.blur(input); expect(input).toHaveValue(2.88);
  expect(buildConfirmation(original, draft)!.items[0].squareMeters).toBe(2.8772999999999995);
});
