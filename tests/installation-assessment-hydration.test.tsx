import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AssessmentFields } from "@/features/measurements/AssessmentFields";
import type { Structure } from "@/features/measurements/contracts";

it.each([
  { resolution: "Comparable", modificationComplete: false, difference: 0, writable: true },
  { resolution: "Comparable", modificationComplete: true, difference: 101, writable: true },
  { resolution: "NotComparable", modificationComplete: true, difference: 101, writable: false },
  { resolution: "NotComparable", modificationComplete: false, difference: null, writable: false },
] as const)("renders and hydrates assessment without HTML warnings: %j", async ({ resolution, modificationComplete, difference, writable }) => {
  const structure: Structure = {
    id: "synthetic-unit", itemId: "synthetic-item", itemNumber: "V1", unitOrdinal: 1, unitCount: 1,
    description: "Synthetic", location: "Room", width: 2, height: 2.4, actualWidth: 2, actualHeight: 2.4,
    createdAt: "2026-11-05T12:00:00Z", measuredAt: null, retiredAt: null, measurementType: "Agreed",
    comparisonCurrent: true, comparison: { resolution, reason: "Reference checked", measurementType: "Agreed", width: 2, height: 2.4 },
    comparisonStatus: difference === 101 ? "OverThreshold" : "NoDimensionalChange",
    widthDifferenceMm: difference, heightDifferenceMm: difference === null ? null : 0, modificationComplete,
  };
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const recoverable = vi.fn(), command = vi.fn();
  const view = <AssessmentFields structure={structure} writable={writable} disabled={false} onCommand={command} onDirty={vi.fn()} />;
  const container = document.createElement("div"); document.body.append(container);
  let root: Root | undefined;
  try {
    // Parse the server HTML before hydrating: the browser repairs invalid paragraph nesting.
    container.innerHTML = renderToString(view);
    const serverParagraphs = [...container.querySelectorAll("p")];
    await act(async () => { root = hydrateRoot(container, view, { onRecoverableError: recoverable }); });
    expect(error).not.toHaveBeenCalled(); expect(warning).not.toHaveBeenCalled(); expect(recoverable).not.toHaveBeenCalled();
    expect(container.querySelectorAll("p")).toHaveLength(serverParagraphs.length);
    serverParagraphs.forEach((paragraph, index) => expect(container.querySelectorAll("p")[index]).toBe(paragraph));
    const ui = within(container);
    expect(ui.queryAllByText("Modificación documentada.")).toHaveLength(modificationComplete ? 1 : 0);
    expect(ui.queryAllByText("Comparación confirmada.")).toHaveLength(resolution === "Comparable" ? 1 : 0);
    if (difference !== null) expect(ui.getByText(`Diferencia absoluta: ancho ${difference} mm · alto 0 mm.`)).toBeInTheDocument();
    else expect(ui.queryByText(/Diferencia absoluta:/)).not.toBeInTheDocument();
    expect(ui.getByLabelText("Referencia dimensional")).toHaveValue(resolution);
    if (writable) expect(ui.getByLabelText("Referencia dimensional")).toBeEnabled();
    else expect(ui.getByLabelText("Referencia dimensional")).toBeDisabled();
    expect(command).not.toHaveBeenCalled();
  } finally {
    await act(async () => root?.unmount()); container.remove(); error.mockRestore(); warning.mockRestore();
  }
});
