import type { ApiClient } from "@/lib/api/types";
import { IntelligenceContractError } from "./parser";

export function conversationId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new IntelligenceContractError();
  return value;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IntelligenceContractError();
  return value as Record<string, unknown>;
}
export function parseConversationRequest(path: string, value: unknown) {
  const v = record(value);
  if (path === "conversation" && Object.keys(v).length === 0) return {};
  if (path === "conversation/close" && Object.keys(v).length === 1) return { conversationId: conversationId(v.conversationId) };
  throw new IntelligenceContractError();
}
export function parseConversation(value: unknown): { conversationId: string; expiresAt: string } {
  const v = record(value);
  if (Object.keys(v).length !== 2 || typeof v.expiresAt !== "string" || !/^\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|\+00:00)$/.test(v.expiresAt) || !Number.isFinite(Date.parse(v.expiresAt))) throw new IntelligenceContractError();
  return { conversationId: conversationId(v.conversationId), expiresAt: v.expiresAt };
}
export function parseConversationClose(value: unknown): { closed: true } {
  const v = record(value);
  if (Object.keys(v).length !== 1 || v.closed !== true) throw new IntelligenceContractError();
  return { closed: true };
}
export const conversationService = {
  create: async (api: ApiClient, signal?: AbortSignal) => parseConversation(await api.post<unknown>("intelligence/conversation", {}, { signal })),
  close: async (api: ApiClient, id: string) => parseConversationClose(await api.post<unknown>("intelligence/conversation/close", { conversationId: conversationId(id) }, { signal: AbortSignal.timeout(3000) })),
};
