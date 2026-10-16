import { describe, expect, it, vi } from "vitest";
import { saveDownload } from "@/lib/api/saveDownload";

function download(filename: string | null = "backend.zip") {
  return { stream: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([80, 75])); controller.close(); } }), filename };
}
describe("browser document download", () => {
  it("opens the picker before the request and pipes bytes without a Blob", async () => {
    const chunks: Uint8Array[] = [];
    const writable = new WritableStream<Uint8Array>({ write(chunk) { chunks.push(chunk); } });
    const picker = vi.fn().mockResolvedValue({ createWritable: async () => writable });
    vi.stubGlobal("showSaveFilePicker", picker);
    const load = vi.fn(async () => { expect(picker).toHaveBeenCalledWith({ suggestedName: "current.zip" }); return download(); });
    const blob = vi.spyOn(Response.prototype, "blob");
    expect(await saveDownload(load, "current.zip")).toBe(true);
    expect(chunks).toEqual([new Uint8Array([80, 75])]);
    expect(blob).not.toHaveBeenCalled();
  });
  it("treats cancelled selection as cancellation and makes no request", async () => {
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError")));
    const load = vi.fn();
    expect(await saveDownload(load, "current.zip")).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });
  it("uses a download anchor and backend filename in fallback, then revokes the object URL", async () => {
    vi.stubGlobal("showSaveFilePicker", undefined);
    const create = vi.fn(() => "blob:test-only"); const revoke = vi.fn();
    vi.stubGlobal("URL", class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("backend.zip"); expect(this.href).toBe("blob:test-only"); expect(this.target).toBe("");
    });
    expect(await saveDownload(async () => download(), "current.zip")).toBe(true);
    expect(click).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledWith("blob:test-only");
    expect(document.querySelector("a,iframe,object,embed")).toBeNull();
  });
  it("does not accept paths as suggested or response filenames", async () => {
    vi.stubGlobal("showSaveFilePicker", undefined);
    vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:safe"); static revokeObjectURL = vi.fn(); });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe("documento"); });
    await saveDownload(async () => download("../private"), "C:\\private\\file");
  });
  it("cancels the incoming stream if creating the destination fails", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue({ createWritable: async () => { throw new Error("write failed"); } }));
    await expect(saveDownload(async () => ({ stream, filename: null }), "current.zip")).rejects.toThrow("write failed");
    expect(cancel).toHaveBeenCalledOnce();
  });
});
