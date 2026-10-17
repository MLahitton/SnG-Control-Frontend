import type { ApiClient } from "@/lib/api/types";
import { parseResponse } from "../parser";
import { opaqueId, sessionId as parseSessionId, liveText, parseSdp, parseLiveSession, parseLiveClose } from "./contracts";

export const liveService = {
  create: async (api: ApiClient, sdp: string, signal: AbortSignal) => parseLiveSession(await api.post<unknown>("intelligence/live/session", { sdp: parseSdp(sdp) }, { signal })),
  delegate: async (api: ApiClient, sessionId: string, callId: string, question: string, signal: AbortSignal) => parseResponse(await api.post<unknown>("intelligence/live/delegate", { sessionId: parseSessionId(sessionId), callId: opaqueId(callId), question: liveText(question) }, { signal })),
  close: async (api: ApiClient, sessionId: string) => parseLiveClose(await api.post<unknown>("intelligence/live/close", { sessionId: parseSessionId(sessionId) }, { signal: AbortSignal.timeout(3000) })),
};
