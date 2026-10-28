import type { ApiClient } from "@/lib/api/types";
import { parseQuotationRounds, parseRequestedRequotation } from "./contracts";
export const quotationRoundsService = {
  async read(api: ApiClient, id: string, signal: AbortSignal) {
    return parseQuotationRounds(await api.get<unknown>(`projects/${id}/quotation-rounds`, { signal }), id);
  },
  async request(api: ApiClient, id: string, requestedChanges: string, signal: AbortSignal) {
    return parseRequestedRequotation(await api.post<unknown>(`projects/${id}/requotation-request`, { requestedChanges }, { signal }), id);
  },
};
