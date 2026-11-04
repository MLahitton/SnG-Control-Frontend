"use client";
import { useSectionDraft } from "./useSectionDraft";
import { emptyTechnical, technicalKey } from "./completeness";
import type { MeasurementAction, Structure, TechnicalDetails } from "./contracts";
import { metresToMm } from "./units";
export function TechnicalFields({ structure: s, disabled, writable, onCommand, onDirty }: { structure: Structure; disabled: boolean; writable: boolean; onCommand: (a: MeasurementAction) => void; onDirty: (id: string, dirty: boolean) => void }) {
  const draft = useSectionDraft(s.technical ?? emptyTechnical, technicalKey, `technical:${s.id}`, onDirty);
  const { value, dirty } = draft;
  function change(patch: Partial<TechnicalDetails>) { draft.setValue({ ...value, ...patch }); }
  const hinged = value.openingType === "HingedDoor" || value.openingType === "HingedWindow";
  const invalid = (value.handleHeightMm !== null && (value.handleHeightMm <= 0 || value.handleHeightMm > 5000 || !s.actualHeight || value.handleHeightMm > metresToMm(s.actualHeight))) || (value.alfajiaMeasurementMm !== null && (value.alfajiaMeasurementMm <= 0 || value.alfajiaMeasurementMm > 10000));
  return <details><summary>Detalles técnicos</summary><form className="stack" onSubmit={e => { e.preventDefault(); if (!disabled && writable && dirty && !invalid) onCommand({ action: "RecordTechnical", structureId: s.id, technical: value }); }}>
    <fieldset className="stack" disabled={!writable}>
      <label>Manija<select className="form-control" value={value.handleStatus ?? ""} onChange={e => change({ handleStatus: (e.target.value || null) as TechnicalDetails["handleStatus"], handleHeightMm: null })}><option value="">Pendiente de verificar</option><option value="NotApplicable">No aplica</option><option value="Confirmed">Aplica · confirmar altura</option></select></label>
      {value.handleStatus === "Confirmed" && <label>Altura de manija (mm)<input className="form-control" type="number" inputMode="decimal" min="0" max="5000" step="any" placeholder="1100 (sugerido, sin confirmar)" value={value.handleHeightMm ?? ""} onChange={e => change({ handleHeightMm: e.target.value === "" ? null : Number(e.target.value) })} />{value.handleHeightMm === null && <button type="button" className="button-secondary" onClick={() => change({ handleHeightMm: 1100 })}>Confirmar 1100 mm</button>}</label>}
      <label>Referencia de vista<select className="form-control" value={value.viewSide ?? ""} onChange={e => change({ viewSide: (e.target.value || null) as TechnicalDetails["viewSide"] })}><option value="">Sin registrar</option><option value="Outside">Vista por fuera</option><option value="Inside">Vista por dentro</option></select></label>
      <label>Tipo de apertura<select className="form-control" value={value.openingType ?? ""} onChange={e => { const type = (e.target.value || null) as TechnicalDetails["openingType"]; change({ openingType: type, openingDirection: type === "HingedDoor" || type === "HingedWindow" ? value.openingDirection : null, openingHand: type === "HingedDoor" ? value.openingHand : null }); }}><option value="">Sin registrar</option><option value="NotApplicable">No aplica</option><option value="HingedDoor">Puerta batiente</option><option value="HingedWindow">Ventana batiente</option><option value="Other">Otro</option></select></label>
      {hinged && <label>Dirección<select className="form-control" value={value.openingDirection ?? ""} onChange={e => change({ openingDirection: (e.target.value || null) as TechnicalDetails["openingDirection"] })}><option value="">Sin registrar</option><option value="Inward">Hacia adentro</option><option value="Outward">Hacia afuera</option></select></label>}
      {value.openingType === "HingedDoor" && <label>Lado de bisagras desde la vista seleccionada<select className="form-control" value={value.openingHand ?? ""} onChange={e => change({ openingHand: (e.target.value || null) as TechnicalDetails["openingHand"] })}><option value="">Sin registrar</option><option value="Left">Izquierda · bisagras ◀</option><option value="Right">Derecha · bisagras ▶</option></select></label>}
      <p>Izquierda/derecha indica el lado de las bisagras observado desde la vista seleccionada. Cambiar la vista no invierte el lado guardado.</p>
      <label>Alfajía<select className="form-control" value={value.hasAlfajia === null ? "" : String(value.hasAlfajia)} onChange={e => change({ hasAlfajia: e.target.value === "" ? null : e.target.value === "true", alfajiaMeasurementMm: null })}><option value="">Sin registrar</option><option value="true">Sí</option><option value="false">No</option></select></label>
      {value.hasAlfajia === true && <label>Medida de alfajía (mm)<input className="form-control" type="number" inputMode="decimal" min="0" max="10000" step="any" value={value.alfajiaMeasurementMm ?? ""} onChange={e => change({ alfajiaMeasurementMm: e.target.value === "" ? null : Number(e.target.value) })} /></label>}
    </fieldset>
    {value.handleHeightMm != null && (!s.actualHeight || value.handleHeightMm > metresToMm(s.actualHeight)) && <p role="status">Guarda primero el alto real en Medidas en obra para validar esta altura de manija. Puedes seguir editando todos los campos.</p>}
    {invalid && <p role="alert">Revisa las medidas: manija positiva, máximo 5000 mm y no superior al alto real; alfajía positiva, máximo 10000 mm.</p>}
    {writable && <button className="button-primary" disabled={disabled || !dirty || invalid}>Guardar detalles técnicos</button>}
    {dirty && <p role="status">Detalles técnicos sin guardar.</p>}
    {dirty && s.measuredAt && <p>Si la ficha queda incompleta, desmarca Medido antes de guardar los detalles. El borrador se conserva.</p>}
  </form></details>;
}
