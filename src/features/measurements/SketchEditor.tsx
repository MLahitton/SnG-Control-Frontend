"use client";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";
import type { SketchDrawing, SketchStroke } from "./contracts";
import { normalizedPoint, paint, exportWebp } from "./sketch";
import styles from "./MeasurementPanel.module.css";
export function SketchEditor({ drawing, disabled, feedback, viewSide, onSave, onCancel, onDirty, onDraftChange, onPause }: { onDraftChange?: (drawing: SketchDrawing) => void; onPause?: () => void; feedback?: ReactNode; drawing: SketchDrawing; disabled: boolean; viewSide?: string | null; onSave: (drawing: SketchDrawing, webp: string) => void; onCancel: () => void; onDirty: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null); const canvas = useRef<HTMLCanvasElement>(null); const active = useRef<{ pointer: number; stroke: SketchStroke } | null>(null);
  const [strokes, setStrokes] = useState(drawing.strokes); const [redo, setRedo] = useState<SketchStroke[]>([]);
  const [sourceStrokes, setSourceStrokes] = useState(drawing.strokes);
  if (sourceStrokes !== drawing.strokes) {
    setSourceStrokes(drawing.strokes);
    if (strokes !== drawing.strokes) { setStrokes(drawing.strokes); setRedo([]); }
  }
  const [tool, setTool] = useState<SketchStroke["tool"]>("Pen"); const [color, setColor] = useState<SketchStroke["color"]>("#111111"); const [width, setWidth] = useState(4);
  const [error, setError] = useState(""); const [clearing, setClearing] = useState(false); const [exporting, setExporting] = useState(false);
  const locked = exporting;
  const writeLocked = disabled || exporting;
  function update(next: SketchStroke[]) { setStrokes(next); onDraftChange?.({ ...drawing, strokes: next }); onDirty(); }
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => previous?.focus(); }, []);
  useEffect(() => { const frame = requestAnimationFrame(() => { if (canvas.current) { try { paint(canvas.current, strokes); } catch { setError("No se pudo inicializar el lienzo."); } } }); return () => cancelAnimationFrame(frame); }, [strokes]);
  function start(e: PointerEvent<HTMLCanvasElement>) {
    if (locked || active.current || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (strokes.length >= 200 || strokes.reduce((n, s) => n + s.points.length, 0) >= 20000) { setError("Límite: 200 trazos y 20000 puntos."); return; }
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    active.current = { pointer: e.pointerId, stroke: { tool, color, width, points: [normalizedPoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())] } };
    paint(e.currentTarget, [...strokes, active.current.stroke]);
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    const a = active.current; if (!a || a.pointer !== e.pointerId || locked) return; e.preventDefault();
    if (a.stroke.points.length >= 2000 || strokes.reduce((n, s) => n + s.points.length, 0) + a.stroke.points.length >= 20000) return;
    a.stroke.points.push(normalizedPoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())); paint(e.currentTarget, [...strokes, a.stroke]);
  }
  function finish(e: PointerEvent<HTMLCanvasElement>) { const a = active.current; if (!a || a.pointer !== e.pointerId) return; active.current = null; update([...strokes, a.stroke]); setRedo([]); }
  async function save() {
    if (!canvas.current || writeLocked || active.current) return; setExporting(true); setError("");
    try { paint(canvas.current, strokes); onSave({ ...drawing, strokes }, await exportWebp(canvas.current)); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo exportar el croquis."); }
    finally { setExporting(false); }
  }
  return <dialog ref={dialog} className={styles.sketchDialog} aria-labelledby="sketch-title" onCancel={e => { e.preventDefault(); if (!locked) { if (onPause) onPause(); else if (!disabled) onCancel(); } }}>
    <div className="stack"><h2 id="sketch-title">Croquis de Instalación</h2><p>Vista: {viewSide === "Inside" ? "Por dentro" : viewSide === "Outside" ? "Por fuera" : "Sin registrar"}. Bisagras izquierda/derecha según esta vista.</p>
    <div className={styles.tools}>
      <button type="button" disabled={locked} aria-pressed={tool === "Pen"} onClick={() => setTool("Pen")}>Lápiz</button><button type="button" disabled={locked} aria-pressed={tool === "Eraser"} onClick={() => setTool("Eraser")}>Borrador</button>
      <label>Color<select disabled={locked} value={color} onChange={e => setColor(e.target.value as SketchStroke["color"])}><option value="#111111">Negro</option><option value="#0066cc">Azul</option><option value="#cc2222">Rojo</option></select></label>
      <label>Grosor<input disabled={locked} type="range" min="1" max="20" value={width} onChange={e => setWidth(Number(e.target.value))} /></label>
      <button type="button" disabled={locked || !strokes.length} onClick={() => { setRedo([...redo, strokes[strokes.length - 1]]); update(strokes.slice(0, -1)); }}>Deshacer</button>
      <button type="button" disabled={locked || !redo.length} onClick={() => { update([...strokes, redo[redo.length - 1]]); setRedo(redo.slice(0, -1)); }}>Rehacer</button>
      <button type="button" disabled={locked} onClick={() => setClearing(true)}>Limpiar lienzo</button>
    </div>
    {clearing && <div role="alert"><p>¿Eliminar todos los trazos del borrador? El croquis guardado se conserva hasta guardar.</p><button disabled={locked} onClick={() => { update([]); setRedo([]); setClearing(false); }}>Confirmar limpieza</button><button onClick={() => setClearing(false)}>Conservar trazos</button></div>}
    <canvas ref={canvas} width={1200} height={900} className={styles.canvas} aria-label="Lienzo de croquis para mouse, dedo o lápiz" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={e => { active.current = null; paint(e.currentTarget, strokes); }} />
    {feedback}
    <p>{strokes.length}/200 trazos · lienzo 1200 × 900 · guardado WEBP</p>{error && <p role="alert">{error}</p>}
    <div className={styles.tools}>{onPause && <button type="button" className="button-secondary" disabled={locked} onClick={onPause}>Volver a ficha · conservar borrador</button>}<button type="button" className="button-secondary" disabled={writeLocked} onClick={onCancel}>Cancelar croquis</button><button type="button" className="button-primary" disabled={writeLocked} onClick={() => void save()}>{writeLocked ? "Guardando…" : "Guardar croquis"}</button></div></div>
  </dialog>;
}
