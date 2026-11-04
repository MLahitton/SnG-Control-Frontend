import type { SketchDrawing, SketchPoint, SketchStroke } from "./contracts";
export const emptyDrawing = (): SketchDrawing => ({ version: 1, width: 1200, height: 900, strokes: [] });
export function normalizedPoint(clientX: number, clientY: number, rect: Pick<DOMRect, "left" | "top" | "width" | "height">): SketchPoint {
  return { x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) };
}
export function paint(canvas: HTMLCanvasElement, strokes: SketchStroke[]) {
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("El dispositivo no dispone de lienzo 2D.");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 1200, 900); ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const stroke of strokes) {
    ctx.strokeStyle = stroke.tool === "Eraser" ? "#ffffff" : stroke.color; ctx.lineWidth = stroke.width;
    ctx.beginPath(); stroke.points.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x * 1200, p.y * 900); else ctx.lineTo(p.x * 1200, p.y * 900); });
    if (stroke.points.length === 1) { const p = stroke.points[0]; ctx.lineTo(p.x * 1200 + .01, p.y * 900); }
    ctx.stroke();
  }
}
export async function exportWebp(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", .9));
  if (!blob || blob.type !== "image/webp" || blob.size > 512000) throw new Error("No se pudo exportar WEBP (máximo 512 KB). Usa un navegador compatible.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join(""));
}
