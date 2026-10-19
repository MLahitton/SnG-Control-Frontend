export const intelligenceRoutes = {
  conversation: "POST", "conversation/close": "POST",
  session: "GET", chat: "POST", "voice/transcribe": "POST", voice: "POST", "voice/speech": "POST",
  "live/session": "POST", "live/close": "POST",
} as const;
export function intelligenceMethod(path: string): string | undefined {
  return Object.hasOwn(intelligenceRoutes, path) ? intelligenceRoutes[path as keyof typeof intelligenceRoutes] : undefined;
}
