import type { TechnicalDetails } from "./contracts";
export function technicalText(value: TechnicalDetails | null | undefined) {
 if (!value) return "Sin registrar";
 const opening = { NotApplicable: "No aplica", HingedDoor: "Puerta batiente", HingedWindow: "Ventana batiente", Other: "Otro" };
 return `Manija: ${value.handleStatus === "NotApplicable" ? "No aplica" : value.handleHeightMm == null ? "Pendiente" : `${value.handleHeightMm} mm confirmados`} · Vista: ${value.viewSide === "Inside" ? "Por dentro" : value.viewSide === "Outside" ? "Por fuera" : "Pendiente"} · Apertura: ${value.openingType ? opening[value.openingType] : "Pendiente"}${value.openingDirection ? value.openingDirection === "Inward" ? " hacia adentro" : " hacia afuera" : ""}${value.openingHand ? value.openingHand === "Left" ? ", bisagras a la izquierda" : ", bisagras a la derecha" : ""} · Alfajía: ${value.hasAlfajia === false ? "No" : value.hasAlfajia === true ? value.alfajiaMeasurementMm == null ? "Sí, medida pendiente" : `${value.alfajiaMeasurementMm} mm` : "Pendiente"}`;
}
