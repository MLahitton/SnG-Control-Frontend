import type { ApiClient } from "@/lib/api/types";
import { parseResponse, parseSession, parseTranscript, parseVoice } from "./parser";
import { MAX_AUDIO_BYTES, MAX_MESSAGE_CHARACTERS, type IntelligenceResponseType } from "./types";
import { IntelligenceError } from "./errors";

function audioForm(file: File): FormData {
  if (!file.size || file.size > MAX_AUDIO_BYTES) throw new IntelligenceError(422);
  const body = new FormData();
  body.append("file", file);
  return body;
}
export const intelligenceService = {
  session: async (api: ApiClient, signal?: AbortSignal) => parseSession(await api.get<unknown>("intelligence/session", { signal })),
  chat: async (api: ApiClient, message: string, signal?: AbortSignal) => {
    if (!message.trim() || message.length > MAX_MESSAGE_CHARACTERS) throw new IntelligenceError(422);
    return parseResponse(await api.post<unknown>("intelligence/chat", { message }, { signal }));
  },
  voice: async (api: ApiClient, file: File, signal?: AbortSignal) => parseVoice(await api.upload<unknown>("intelligence/voice", audioForm(file), { signal })),
  transcribe: async (api: ApiClient, file: File, signal?: AbortSignal) => parseTranscript(await api.upload<unknown>("intelligence/voice/transcribe", audioForm(file), { signal })),
  speech: async (api: ApiClient, text: string, responseType: IntelligenceResponseType, signal?: AbortSignal) => {
    if (!text.trim() || text.length > 4000) throw new IntelligenceError(422);
    return api.postAudio("intelligence/voice/speech", { text, responseType }, { signal });
  },
};
