import { conversationId as parseConversationId } from "../conversation";
import type { ApiClient } from "@/lib/api/types";
import { sessionId as parseSessionId, parseSdp, parseLiveSession, parseLiveClose } from "./contracts";

export const liveService = {
  create: async (api: ApiClient, sdp: string, signal: AbortSignal, conversationId?: string) => parseLiveSession(await api.post<unknown>("intelligence/live/session", { sdp: parseSdp(sdp), ...(conversationId ? { conversationId: parseConversationId(conversationId) } : {}) }, { signal })),
  close: async (api: ApiClient, sessionId: string) => parseLiveClose(await api.post<unknown>("intelligence/live/close", { sessionId: parseSessionId(sessionId) }, { signal: AbortSignal.timeout(3000) })),
};
