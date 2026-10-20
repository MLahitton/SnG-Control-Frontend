import type { ApiClient } from "@/lib/api/types";
import { parseConfirmation, parsePreview, parseStatus, parseSendToCommercial } from "./parser";
import type { Confirmation } from "./types";

export const budgetQuotationService = {
  async getStatus(api: ApiClient, projectId: string, signal: AbortSignal) {
    return parseStatus(await api.get<unknown>(`projects/${projectId}/budget-quotation/status`, { signal }), projectId);
  },
  async sendToCommercial(api: ApiClient, projectId: string, signal: AbortSignal) {
    return parseSendToCommercial(await api.post<unknown>(`projects/${projectId}/send-to-commercial`, undefined, { signal }), projectId);
  },
  async preview(api: ApiClient, projectId: string, file: File, signal: AbortSignal) {
    const body = new FormData();
    body.append("file", file);
    return parsePreview(await api.upload<unknown>(`projects/${projectId}/budget-quotation/preview`, body, { signal }), projectId);
  },
  async confirm(api: ApiClient, projectId: string, file: File, payload: Confirmation, signal: AbortSignal) {
    const body = new FormData();
    body.append("file", file);
    body.append("confirmation", new Blob([JSON.stringify(payload)], { type: "application/json; charset=utf-8" }));
    return parseConfirmation(await api.upload<unknown>(`projects/${projectId}/budget-quotation/confirm`, body, { signal }), projectId);
  },
};
