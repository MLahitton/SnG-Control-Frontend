import type { Structure, TechnicalDetails } from "./contracts";
import { metresToMm } from "./units";
export const emptyTechnical: TechnicalDetails = { handleStatus: null, handleHeightMm: null, viewSide: null, openingType: null, openingDirection: null, openingHand: null, hasAlfajia: null, alfajiaMeasurementMm: null };
// Pick only editable fields: API projections may also contain computed completeness properties.
export function technicalKey(t: TechnicalDetails) {
 return JSON.stringify([t.handleStatus, t.handleHeightMm, t.viewSide, t.openingType, t.openingDirection, t.openingHand, t.hasAlfajia, t.alfajiaMeasurementMm]);
}
export function missingMeasurementFields(s: Structure): string[] {
 const missing: string[] = [], t = s.technical;
 if (!s.measurementType) missing.push("Tipo de medida");
 if (!s.actualLocation?.trim()) missing.push("Ubicación real");
 if (!(s.actualWidth != null && s.actualWidth > 0)) missing.push("Ancho real");
 if (!(s.actualHeight != null && s.actualHeight > 0)) missing.push("Alto real");
 if (!s.actualSystemText?.trim()) missing.push("Sistema en obra");
 if (!t?.handleStatus) missing.push("Estado de manija");
 else if (t.handleStatus === "Confirmed" && !(t.handleHeightMm != null && t.handleHeightMm > 0 && t.handleHeightMm <= 5000 && s.actualHeight != null && t.handleHeightMm <= metresToMm(s.actualHeight))) missing.push("Altura de manija válida (mm)");
 if (!t?.viewSide) missing.push("Referencia de vista");
 if (!t?.openingType) missing.push("Tipo de apertura");
 if ((t?.openingType === "HingedDoor" || t?.openingType === "HingedWindow") && !t.openingDirection) missing.push("Dirección de apertura");
 if (t?.openingType === "HingedDoor" && !t.openingHand) missing.push("Lado de bisagras");
 if (t?.hasAlfajia == null) missing.push("Presencia o ausencia de alfajía");
 else if (t.hasAlfajia && !(t.alfajiaMeasurementMm != null && t.alfajiaMeasurementMm > 0 && t.alfajiaMeasurementMm <= 10000)) missing.push("Medida de alfajía válida (mm)");
 if (!s.comparisonCurrent) missing.push("Revisión explícita de comparabilidad dimensional");
 if (s.comparisonStatus === "OverThreshold" && !s.modification) missing.push("Modificación formal y croquis asociado");
 if (s.modification && !s.modificationComplete) {
  if (!s.modification.reason?.trim()) missing.push("Motivo de modificación");
  if (!s.modification.description?.trim()) missing.push("Descripción de modificación");
  if (!s.modification.sketchVersionId) missing.push("Croquis asociado a la modificación");
  missing.push("Confirmar modificación sobre la ficha vigente");
 }
 return missing;
}
