import { CommercialQuotationPreview } from "@/features/commercialQuotation/CommercialQuotationPreview";
import { commercialPreview } from "./commercialQuotationFixtures";
import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { normalizeTechnicalMeasure, technicalMeasuresEqual, formatTechnicalValue, type TechnicalScale } from "@/lib/technicalMeasure";
// Same exact vectors as Backend TechnicalPrecisionTests (strings retain all source digits).
const cases: [string, TechnicalScale, string][] = [
 ["2.0019999999999998",3,"2.002"], ["5.845839999999999",6,"5.84584"],
 ["2.0024999999999999",3,"2.002"], ["2.0025",3,"2.003"], ["2.0025000000000001",3,"2.003"],
 ["5.845840499999999",6,"5.84584"], ["5.8458405",6,"5.845841"],
 ["0.0004999",3,"0"], ["0.0005",3,"0.001"], ["0.0000005",6,"0.000001"],
 ["-2.0025",3,"-2.003"], ["99999999999999999999.9995",3,"100000000000000000000"]
];
it.each(cases)("normalizes decimal %s at scale %i", (value, scale, expected) => {
 expect(normalizeTechnicalMeasure(value, scale)).toBe(expected);
 expect(technicalMeasuresEqual(value, expected, scale)).toBe(true);
});
it("preserves real differences across rounding boundaries", () => {
 expect(technicalMeasuresEqual("1.000499999", "1.0005", 3)).toBe(false);
 expect(technicalMeasuresEqual("5.845840499999999", "5.8458405", 6)).toBe(false);
 expect(technicalMeasuresEqual(2.0019999999999998, 2.002, 3)).toBe(true);
 expect(normalizeTechnicalMeasure(5e-7, 6)).toBe("0.000001");
 expect(normalizeTechnicalMeasure("7.9e-28", 6)).toBe("0");
});
it("formats measures consistently without changing money, quantities or source objects", () => {
 const source = { width: 2.0019999999999998, squareMeters: 5.845839999999999, unitPrice: "123.45" };
 const before = JSON.stringify(source);
 render(<dl><dd>{formatTechnicalValue("Width", source.width)}</dd><dd>{formatTechnicalValue("squareMeters", source.squareMeters)}</dd></dl>);
 expect(screen.getByText("2,002")).toBeInTheDocument(); expect(screen.getByText("5,84584")).toBeInTheDocument();
 expect(formatTechnicalValue("unitPrice", source.unitPrice)).toBe("123.45");
 expect(formatTechnicalValue("quantity", 3)).toBe("3"); expect(JSON.stringify(source)).toBe(before);
});

it("uses normalized formatting in the actual commercial preview without changing server difference counts", () => {
 const item = commercialPreview.items[0];
 const preview = { ...commercialPreview, items: [{ ...item, values: { ...item.values, width: 2.0019999999999998, squareMeters: 5.845839999999999 } }] };
 const snapshot = JSON.stringify(preview);
 render(<CommercialQuotationPreview preview={preview} />);
 expect(screen.getByText("2,002")).toBeInTheDocument();
 expect(screen.getByText("5,84584")).toBeInTheDocument();
 expect(screen.getByText("Cambios frente a Presupuestos")).toBeInTheDocument();
 expect(JSON.stringify(preview)).toBe(snapshot);
});
