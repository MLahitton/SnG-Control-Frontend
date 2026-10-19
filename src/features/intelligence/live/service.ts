import type { ApiClient } from "@/lib/api/types";
import { sessionId as parseSessionId, parseSdp, parseLiveSession, parseLiveClose } from "./contracts";

export const liveService = {
  create: async (api: ApiClient, sdp: string, signal: AbortSignal) => parseLiveSession(await api.post<unknown>("intelligence/live/session", { sdp: parseSdp(sdp) }, { signal })),
  close: async (api: ApiClient, sessionId: string) => parseLiveClose(await api.post<unknown>("intelligence/live/close", { sessionId: parseSessionId(sessionId) }, { signal: AbortSignal.timeout(3000) })),
};
