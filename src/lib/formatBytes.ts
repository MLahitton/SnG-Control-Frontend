const sizeFormatter = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${sizeFormatter.format(bytes / 1000)} KB`;
  return `${sizeFormatter.format(bytes / 1_000_000)} MB`;
}
