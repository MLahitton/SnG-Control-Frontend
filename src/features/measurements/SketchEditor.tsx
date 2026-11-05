"use client";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";
import type { SketchAnnotation, SketchDrawing, SketchStroke } from "./contracts";
import { normalizedPoint, paint, exportWebp } from "./sketch";
import styles from "./MeasurementPanel.module.css";
export function SketchEditor({ drawing, disabled, feedback, viewSide, onSave, onCancel, onDirty, onDraftChange, onPause, onPendingInputChange }: { onPendingInputChange?: (pending: boolean) => void; onDraftChange?: (drawing: SketchDrawing) => void; onPause?: () => void; feedback?: ReactNode; drawing: SketchDrawing; disabled: boolean; viewSide?: string | null; onSave: (drawing: SketchDrawing, webp: string) => void; onCancel: () => void; onDirty: () => void }) {
  const textInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null); const canvas = useRef<HTMLCanvasElement>(null); const active = useRef<{ pointer: number; stroke: SketchStroke } | null>(null);
  const [value, setValue] = useState(drawing); const [undo, setUndo] = useState<SketchDrawing[]>([]); const [redo, setRedo] = useState<SketchDrawing[]>([]);
  const [source, setSource] = useState(drawing);
  if (source !== drawing) { setSource(drawing); if (value !== drawing) { setValue(drawing); setUndo([]); setRedo([]); } }
  const strokes = value.strokes; const annotations = value.annotations ?? [];
  const [stroking, setStroking] = useState(false);
  const [annotation, setAnnotation] = useState<SketchAnnotation | null>(null);
  const [tool, setTool] = useState<SketchStroke["tool"] | "Text">("Pen"); const [color, setColor] = useState<SketchStroke["color"]>("#111111"); const [width, setWidth] = useState(4);
  const [error, setError] = useState(""); const [clearing, setClearing] = useState(false); const [exporting, setExporting] = useState(false);
  useEffect(() => { onPendingInputChange?.(!!annotation || stroking); }, [annotation, stroking, onPendingInputChange]);
  useEffect(() => { textInput.current?.focus(); }, [annotation?.id]);
  const locked = exporting;
  const writeLocked = disabled || exporting;
  function apply(next: SketchDrawing) { setValue(next); onDraftChange?.(next); onDirty(); }
  function update(next: SketchDrawing) { setUndo(previous => [...previous, value].slice(-100)); setRedo([]); apply(next); }
  function saveAnnotation() {
    if (!annotation || !annotation.content.trim() || annotation.content.length > 300 || /[\x00-\x1f\x7f]/.test(annotation.content)) return;
    update({ ...value, version: 2, annotations: [...annotations.filter(a => a.id !== annotation.id), { ...annotation, content: annotation.content.trim() }] }); setAnnotation(null);
  }
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => previous?.focus(); }, []);
  useEffect(() => { const frame = requestAnimationFrame(() => { if (canvas.current) { try { paint(canvas.current, strokes, value.annotations); } catch { setError("No se pudo inicializar el lienzo."); } } }); return () => cancelAnimationFrame(frame); }, [strokes, value.annotations]);
  function start(e: PointerEvent<HTMLCanvasElement>) {
    if (locked || active.current || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (tool === "Text") {
      const point = normalizedPoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
      if (annotation) { setAnnotation({ ...annotation, ...point }); return; }
      const existing = [...annotations].reverse().find(a => Math.abs(a.x - point.x) < .15 && Math.abs(a.y - point.y) < .06);
      if (existing) setAnnotation({ ...existing });
      else if (annotations.length < 50) setAnnotation({ id: crypto.randomUUID(), content: "", ...point, size: 24, color, order: annotations.length });
      else setError("Máximo 50 anotaciones.");
      return;
    }
    if (strokes.length >= 200 || strokes.reduce((n, s) => n + s.points.length, 0) >= 20000) { setError("Límite: 200 trazos y 20000 puntos."); return; }
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    setStroking(true);
    active.current = { pointer: e.pointerId, stroke: { tool, color, width, points: [normalizedPoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())] } };
    paint(e.currentTarget, [...strokes, active.current.stroke], annotations);
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    const a = active.current; if (!a || a.pointer !== e.pointerId || locked) return; e.preventDefault();
    if (a.stroke.points.length >= 2000 || strokes.reduce((n, s) => n + s.points.length, 0) + a.stroke.points.length >= 20000) return;
    a.stroke.points.push(normalizedPoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())); paint(e.currentTarget, [...strokes, a.stroke], annotations);
  }
  function finish(e: PointerEvent<HTMLCanvasElement>) { const a = active.current; if (!a || a.pointer !== e.pointerId) return; active.current = null; setStroking(false); update({ ...value, strokes: [...strokes, a.stroke] }); }
  function pause() { if (annotation) { if (!annotation.content.trim()) { setError("Confirma o cancela el texto antes de volver a la ficha."); return; } saveAnnotation(); } onPause?.(); }
  async function save() {
    if (!canvas.current || writeLocked || active.current || annotation) return; setExporting(true); setError("");
    try { paint(canvas.current, strokes, value.annotations); onSave(value, await exportWebp(canvas.current)); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo exportar el croquis."); }
    finally { setExporting(false); }
  }
  return <dialog ref={dialog} className={styles.sketchDialog} aria-labelledby="sketch-title" onCancel={e => { e.preventDefault(); if (!locked) { if (onPause) pause(); else if (!disabled) onCancel(); } }}>
    <div className="stack"><h2 id="sketch-title">Croquis de Instalación</h2><p>Vista: {viewSide === "Inside" ? "Por dentro" : viewSide === "Outside" ? "Por fuera" : "Sin registrar"}. Bisagras izquierda/derecha según esta vista.</p>
    <div className={styles.tools}>
      <button type="button" disabled={locked} aria-pressed={tool === "Pen"} onClick={() => setTool("Pen")}>Lápiz</button><button type="button" disabled={locked} aria-pressed={tool === "Eraser"} onClick={() => setTool("Eraser")}>Borrador</button>
      <button type="button" disabled={locked} aria-pressed={tool === "Text"} onClick={() => setTool("Text")}>Texto</button>
      <label>Color<select disabled={locked} value={color} onChange={e => setColor(e.target.value as SketchStroke["color"])}><option value="#111111">Negro</option><option value="#0066cc">Azul</option><option value="#cc2222">Rojo</option></select></label>
      <label>Grosor<input disabled={locked} type="range" min="1" max="20" value={width} onChange={e => setWidth(Number(e.target.value))} /></label>
      <button type="button" disabled={locked || !undo.length} onClick={() => { setRedo([...redo, value]); apply(undo[undo.length - 1]); setUndo(undo.slice(0, -1)); setAnnotation(null); }}>Deshacer</button>
      <button type="button" disabled={locked || !redo.length} onClick={() => { setUndo([...undo, value]); apply(redo[redo.length - 1]); setRedo(redo.slice(0, -1)); setAnnotation(null); }}>Rehacer</button>
      <button type="button" disabled={locked} onClick={() => setClearing(true)}>Limpiar lienzo</button>
    </div>
    {clearing && <div role="alert"><p>¿Eliminar todos los trazos del borrador? El croquis guardado se conserva hasta guardar.</p><button disabled={locked} onClick={() => { update({ ...value, strokes: [], ...(value.version === 2 ? { annotations: [] } : {}) }); setAnnotation(null); setClearing(false); }}>Confirmar limpieza</button><button onClick={() => setClearing(false)}>Conservar trazos</button></div>}
    <div className={styles.canvasStage}>
    <canvas ref={canvas} width={1200} height={900} className={styles.canvas} aria-label="Lienzo de croquis para mouse, dedo o lápiz" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={e => { active.current = null; setStroking(false); paint(e.currentTarget, strokes, annotations); }} />
    {annotation && <fieldset className={styles.inlineText} style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%`, transform: `translate(${annotation.x > .5 ? "-100%" : "0"}, ${annotation.y > .5 ? "-100%" : "0"})` }} disabled={locked} onKeyDown={e => { if (e.key === "Enter" && e.target === textInput.current) { e.preventDefault(); saveAnnotation(); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setAnnotation(null); } }}><label>Contenido del texto<input ref={textInput} maxLength={300} value={annotation.content} onChange={e => setAnnotation({ ...annotation, content: e.target.value })} /></label><label>Tamaño del texto<select value={annotation.size} onChange={e => setAnnotation({ ...annotation, size: Number(e.target.value) })}>{[12, 18, 24, 36, 48, 72].map(n => <option key={n}>{n}</option>)}</select></label><label>Color del texto<select value={annotation.color} onChange={e => setAnnotation({ ...annotation, color: e.target.value as SketchAnnotation["color"] })}><option value="#111111">Negro</option><option value="#0066cc">Azul</option><option value="#cc2222">Rojo</option></select></label><button type="button" disabled={!annotation.content.trim()} onClick={saveAnnotation}>Confirmar texto</button><button type="button" onClick={() => { update({ ...value, version: 2, annotations: annotations.filter(a => a.id !== annotation.id).map((a, order) => ({ ...a, order })) }); setAnnotation(null); }}>Eliminar texto</button><button type="button" onClick={() => setAnnotation(null)}>Cancelar edición de texto</button></fieldset>}
    </div>
    {tool === "Text" && <p>Toca para insertar o seleccionar texto. Con una anotación seleccionada, toca su nueva posición y confirma.</p>}
    {annotations.length > 0 && <label>Anotación<select value={annotation?.id ?? ""} disabled={locked} onChange={e => setAnnotation(annotations.find(a => a.id === e.target.value) ?? null)}><option value="">Seleccionar texto</option>{annotations.map(a => <option key={a.id} value={a.id}>{a.content}</option>)}</select></label>}

    {feedback}
    <p>{strokes.length}/200 trazos · lienzo 1200 × 900 · guardado WEBP</p>{error && <p role="alert">{error}</p>}
    <div className={styles.tools}>{onPause && <button type="button" className="button-secondary" disabled={locked} onClick={pause}>Volver a ficha · conservar borrador</button>}<button type="button" className="button-secondary" disabled={writeLocked} onClick={onCancel}>Cancelar croquis</button><button type="button" className="button-primary" disabled={writeLocked || !!annotation} onClick={() => void save()}>{writeLocked ? "Guardando…" : "Guardar croquis"}</button></div></div>
  </dialog>;
}
