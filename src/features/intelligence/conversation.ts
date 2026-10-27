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
  if ((path === "conversation" || path === "conversation/resume") && Object.keys(v).length === 0) return {};
  if (path === "conversation/close" && Object.keys(v).length === 1) return { conversationId: conversationId(v.conversationId) };
  throw new IntelligenceContractError();
}
function timestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw new IntelligenceContractError();
  return value;
}
export function parseConversation(value: unknown): { conversationId: string; createdAt: string; lastActivityAt: string } {
  const v = record(value);
  if (Object.keys(v).length !== 3) throw new IntelligenceContractError();
  return { conversationId: conversationId(v.conversationId), createdAt: timestamp(v.createdAt), lastActivityAt: timestamp(v.lastActivityAt) };
}
export function parseConversationClose(value: unknown): { closed: true } {
  const v = record(value);
  if (Object.keys(v).length !== 1 || v.closed !== true) throw new IntelligenceContractError();
  return { closed: true };
}
export const conversationService = {
  resume: async (api: ApiClient, signal?: AbortSignal) => parseConversation(await api.post<unknown>("intelligence/conversation/resume", {}, { signal })),
  create: async (api: ApiClient, signal?: AbortSignal) => parseConversation(await api.post<unknown>("intelligence/conversation", {}, { signal })),
  close: async (api: ApiClient, id: string) => parseConversationClose(await api.post<unknown>("intelligence/conversation/close", { conversationId: conversationId(id) }, { signal: AbortSignal.timeout(3000) })),
};
