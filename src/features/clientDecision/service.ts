import type { ApiClient } from "@/lib/api/types";
import { parseDecision, parseRecordedDecision, type ClientDecision } from "./contracts";

export const clientDecisionService = {
  async read(api: ApiClient, id: string, signal: AbortSignal) {
    return parseDecision(await api.get<unknown>(`projects/${id}/client-quotation-decision`, { signal }), id);
  },
  async record(api: ApiClient, id: string, decision: ClientDecision, note: string | null, signal: AbortSignal) {
    return parseRecordedDecision(await api.post<unknown>(`projects/${id}/client-quotation-decision`, { decision, note }, { signal }), id);
  },
};
