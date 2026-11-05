"use client";
import type { MeasurementAction, Structure } from "./contracts";
import { useSectionDraft } from "./useSectionDraft";
const draftKey = (v: { reason: string; description?: string }) => JSON.stringify({ ...v, reason: v.reason.trim(), ...(v.description !== undefined ? { description: v.description.trim() } : {}) });
export function AssessmentFields({ structure: s, writable, disabled, onCommand, onDirty }: { structure: Structure; writable: boolean; disabled: boolean; onCommand: (a: MeasurementAction) => void; onDirty: (id: string, dirty: boolean) => void }) {
 const comparison = useSectionDraft({ resolution: s.comparison?.resolution ?? "NotComparable", reason: s.comparison?.reason ?? "" }, draftKey, `comparison:${s.id}`, onDirty);
 const modification = useSectionDraft({ type: s.modification?.type ?? "Other", reason: s.modification?.reason ?? "", description: s.modification?.description ?? "", sketchVersionId: s.modification?.sketchVersionId ?? null }, draftKey, `modification:${s.id}`, onDirty);
 const label = s.comparisonCurrent && s.comparison?.resolution === "NotComparable" ? "Referencia no comparable — documentada" : s.comparisonStatus === "OverThreshold" ? "Requiere modificación · diferencia superior a 100 mm" : s.comparisonStatus === "NoDimensionalChange" ? "Sin modificación dimensional identificada" : "Comparación pendiente de revisión";
 return <div className="stack"><strong>{label}</strong>
 {s.modificationComplete && <p>Modificación documentada.</p>}
 {s.comparisonCurrent && s.comparison?.resolution === "Comparable" && <p>Comparación confirmada.</p>}
 {s.widthDifferenceMm != null && <p>Diferencia absoluta: ancho {s.widthDifferenceMm} mm · alto {s.heightDifferenceMm} mm.</p>}
 {s.comparisonCurrent && s.comparison?.resolution === "NotComparable" && <p>Referencia no comparable: revisión registrada. No equivale a ausencia de modificación.</p>}
 <details open={!s.comparisonCurrent}><summary>Revisar comparación</summary><p>Confirma la equivalencia técnica de la referencia cotizada. No se aplican ajustes de fabricación.</p>
 <fieldset disabled={!writable}><label>Referencia dimensional<select value={comparison.value.resolution} onChange={e => comparison.setValue({ ...comparison.value, resolution: e.target.value as "Comparable" | "NotComparable" })}><option value="NotComparable">No comparable · revisión explícita</option>{s.itemId && <option value="Comparable">Comparable con el tipo registrado</option>}</select></label>
 <label>Motivo de revisión<textarea maxLength={2000} value={comparison.value.reason} onChange={e => comparison.setValue({ ...comparison.value, reason: e.target.value })} /></label></fieldset>
 {writable && <button className="button-primary" disabled={disabled || !!s.measuredAt || !s.measurementType || !s.actualWidth || !s.actualHeight || !comparison.value.reason.trim()} onClick={() => onCommand({ action: "ResolveComparison", structureId: s.id, comparison: comparison.value })}>Confirmar revisión dimensional</button>}
 </details>
 <details open={s.comparisonStatus === "OverThreshold" && !s.modificationComplete}><summary>Modificar estructura</summary><p>Registra una modificación formal. El croquis debe documentar expresamente esta versión del cambio.</p>
 <fieldset disabled={!writable}><label>Tipo de modificación<select value={modification.value.type} onChange={e => modification.setValue({ ...modification.value, type: e.target.value })}>{Object.entries({ Dimensional: "Dimensional", System: "Sistema", Typology: "Tipología", Configuration: "Configuración", Structural: "Estructural", Other: "Otro" }).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
 <label>Motivo de modificación<textarea maxLength={2000} value={modification.value.reason} onChange={e => modification.setValue({ ...modification.value, reason: e.target.value })} /></label>
 <label>Descripción de modificación<textarea maxLength={4000} value={modification.value.description} onChange={e => modification.setValue({ ...modification.value, description: e.target.value })} /></label>
 <label><input type="checkbox" disabled={!s.sketchVersionId} checked={!!s.sketchVersionId && modification.value.sketchVersionId === s.sketchVersionId} onChange={e => modification.setValue({ ...modification.value, sketchVersionId: e.target.checked ? s.sketchVersionId ?? null : null })} />Confirmo que el croquis guardado documenta esta modificación</label></fieldset>
 {writable && <button className="button-primary" disabled={disabled || !!s.measuredAt} onClick={() => onCommand({ action: "RecordModification", structureId: s.id, modification: modification.value })}>Guardar modificación</button>}
 {s.modification && <p>Versión {s.modification.versionId} · {s.modificationComplete ? "Completa" : "Pendiente: guarda motivo, descripción, ficha actualizada y asociación explícita al croquis"}</p>}
 </details>{s.measuredAt && writable && <p>Desmarca Medido antes de revisar o modificar; los borradores se conservan.</p>}</div>;
}
