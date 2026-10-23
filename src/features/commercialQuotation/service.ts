import type { ApiClient } from "@/lib/api/types";
import { parsePreview, parseConfirmation } from "./parser";

export const commercialQuotationService = {
  download(api: ApiClient, projectId: string, final: boolean, signal: AbortSignal) {
    return api.downloadStream(`projects/${projectId}/${final ? "commercial-quotation/file" : "budget-quotation/commercial-file"}`, { signal });
  },
  async preview(api: ApiClient, projectId: string, file: File, signal: AbortSignal) {
    const body = new FormData(); body.append("file", file);
    return parsePreview(await api.upload<unknown>(`projects/${projectId}/commercial-quotation/preview`, body, { signal }), projectId);
  },
  async confirm(api: ApiClient, projectId: string, file: File, signal: AbortSignal) {
    const body = new FormData(); body.append("file", file);
    return parseConfirmation(await api.upload<unknown>(`projects/${projectId}/commercial-quotation/confirm`, body, { signal }), projectId);
  },
};
