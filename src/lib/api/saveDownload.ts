import type { ApiStreamDownload } from "./types";
import { safeDownloadFilename } from "./contentDisposition";

interface SaveHandle {
  createWritable(): Promise<WritableStream<Uint8Array>>;
}
interface SavePickerWindow extends Window {
  showSaveFilePicker?: (options: { suggestedName: string }) => Promise<SaveHandle>;
}

// Called directly by the click handler so the picker retains user activation.
export async function saveDownload(
  load: () => Promise<ApiStreamDownload>, suggestedName: string, signal?: AbortSignal,
): Promise<boolean> {
  let download: ApiStreamDownload | undefined;
  try {
    const browser = window as SavePickerWindow;
    const name = safeDownloadFilename(suggestedName) ?? "documento";
    const handle = browser.showSaveFilePicker ? await browser.showSaveFilePicker({ suggestedName: name }) : undefined;
    signal?.throwIfAborted();
    download = await load();
    signal?.throwIfAborted();
    if (handle) {
      const writable = await handle.createWritable();
      await download.stream.pipeTo(writable, { signal });
    } else {
      const blob = await new Response(download.stream).blob();
      signal?.throwIfAborted();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      try {
        anchor.href = url;
        anchor.download = safeDownloadFilename(download.filename) ?? name;
        document.body.append(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        URL.revokeObjectURL(url);
      }
    }
    return true;
  } catch (error) {
    if (download && !download.stream.locked) void download.stream.cancel().catch(() => {});
    if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return false;
    throw error;
  }
}
