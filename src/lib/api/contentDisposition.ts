export function downloadFilename(header: string | null): string | null {
  if (!header) return null;
  const extended = /(?:^|;)\s*filename\*\s*=\s*UTF-8'[^']*'([^;]+)/i.exec(header);
  const basic = /(?:^|;)\s*filename\s*=\s*(?:"([^"]*)"|([^;]*))/i.exec(header);
  let filename: string | undefined;
  try {
    filename = extended ? decodeURIComponent(extended[1].trim()) : basic?.[1] ?? basic?.[2]?.trim();
  } catch {
    return null;
  }
  if (!filename || filename.length > 200 || filename === "." || filename === ".."
    || /[\\/<>:"|?*\u0000-\u001f\u007f]/.test(filename)
    || /^[. ]|[. ]$/.test(filename)
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(filename)) return null;
  return filename;
}
