"use client";
import { type ReactNode, useEffect, useState } from "react";
import { useApiClient } from "@/features/auth/hooks/useApiClient";
import { ErrorNotice } from "@/lib/api/ErrorNotice";
import type { MeasurementAction, SketchRead, Structure } from "./contracts";
import { SketchEditor } from "./SketchEditor";
import { emptyDrawing } from "./sketch";
export function SketchPanel({ projectId, structure: s, feedback, disabled, writable, onCommand, onDirty }: { feedback?: ReactNode; projectId: string; structure: Structure; disabled: boolean; writable: boolean; onCommand: (a: MeasurementAction) => void; onDirty: (id: string, dirty: boolean) => void }) {
  const api = useApiClient(); const [editing, setEditing] = useState(false); const [read, setRead] = useState<SketchRead>(); const [url, setUrl] = useState<string>(); const [error, setError] = useState<unknown>(); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!s.sketchVersionId) return; const controller = new AbortController(); let objectUrl: string | undefined;
    const path = `projects/${projectId}/measurements/structures/${s.id}/sketches/${s.sketchVersionId}`;
    void Promise.all([api.get<SketchRead>(path, { signal: controller.signal }), api.download(`${path}/image`, { signal: controller.signal })]).then(([data, file]) => {
      if (controller.signal.aborted) return; if (file.blob.type !== "image/webp") throw new Error("Formato de croquis no válido.");
      objectUrl = URL.createObjectURL(file.blob); setUrl(objectUrl); setRead(data); setError(undefined);
    }).catch(e => { if (!controller.signal.aborted) setError(e); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [api, projectId, s.id, s.sketchVersionId, attempt]);
  return <div className="stack"><strong>Croquis de Instalación</strong>
    {url && <img src={url} alt="Croquis de Instalación guardado en WEBP" style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "contain" }} /> /* eslint-disable-line @next/next/no-img-element */}
    <ErrorNotice error={error} retry={() => setAttempt(a => a + 1)} />
    <p>{s.sketchVersionId ? read ? `Guardado · revisión ${read.revision}` : "Cargando croquis…" : "Sin croquis guardado"}</p>
    {writable && <button className="button-secondary" disabled={disabled || (!!s.sketchVersionId && !read)} onClick={() => setEditing(true)}>{s.sketchVersionId ? "Editar croquis" : "Dibujar croquis"}</button>}
    {editing && <SketchEditor feedback={feedback} drawing={read?.drawing ?? emptyDrawing()} disabled={disabled} viewSide={s.technical?.viewSide} onDirty={() => onDirty(`sketch:${s.id}`, true)} onCancel={() => { setEditing(false); onDirty(`sketch:${s.id}`, false); }} onSave={(drawing, webp) => onCommand({ action: "RecordSketch", structureId: s.id, sketch: { drawing, webp } })} />}
  </div>;
}
