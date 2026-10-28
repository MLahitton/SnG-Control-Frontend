import type { ApiClient } from "@/lib/api/types";
import { parseAccounting, parseAccountingWrite } from "./contracts";
export interface DepositInput { amount: string; receivedAt: string; reference: string | null; note: string | null }
export const accountingService = {
  async read(api: ApiClient, id: string, signal: AbortSignal) { return parseAccounting(await api.get<unknown>(`projects/${id}/initial-deposit`, { signal }), id); },
  async send(api: ApiClient, id: string, signal: AbortSignal) { return parseAccountingWrite(await api.post<unknown>(`projects/${id}/send-approved-quotation-to-accounting`, undefined, { signal }), id, "send"); },
  async record(api: ApiClient, id: string, body: DepositInput, signal: AbortSignal) { return parseAccountingWrite(await api.post<unknown>(`projects/${id}/initial-deposit`, { ...body }, { signal }), id, "record"); },
};
