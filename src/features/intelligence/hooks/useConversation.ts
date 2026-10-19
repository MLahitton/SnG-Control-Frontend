"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApiClient } from "@/lib/api/types";
import { conversationService } from "../conversation";

type Scope = { api: ApiClient; id?: string; controller: AbortController };
/** React memory only. Each scope is bound to the original authenticated identity. */
export function useConversation(api: ApiClient, enabled: boolean) {
  const scope = useRef<Scope | null>(null);
  const lifetime = useRef(0);
  const [revision, setRevision] = useState(0);
  const [resetting, setResetting] = useState(false);
  const key = useMemo(() => ({ api, enabled, revision }), [api, enabled, revision]);
  const [result, setResult] = useState<{ key: typeof key; id?: string; error?: unknown }>();
  const release = useCallback(async () => {
    const current = scope.current;
    scope.current = null;
    if (!current) return;
    current.controller.abort();
    if (current.id) await conversationService.close(current.api, current.id).catch(() => {});
  }, []);
  useEffect(() => {
    if (!enabled) return;
    lifetime.current += 1;
    const current: Scope = { api: api.forCurrentSession(), controller: new AbortController() };
    scope.current = current;
    async function create() {
      // Let an immediate StrictMode teardown cancel before starting the HTTP request.
      if (scope.current !== current) return;
      try {
        const created = await conversationService.create(current.api, current.controller.signal);
        if (scope.current !== current) {
          void conversationService.close(current.api, created.conversationId).catch(() => {});
          return;
        }
        current.id = created.conversationId;
        setResult({ key, id: created.conversationId }); setResetting(false);
      } catch (error) {
        if (scope.current === current) { setResult({ key, error }); setResetting(false); }
      }
    }
    queueMicrotask(() => { void create(); });
    return () => { lifetime.current += 1; void release(); };
  }, [enabled, api, key, release]);
  async function reset() {
    const version = lifetime.current;
    setResetting(true);
    await release();
    // A reset finishing after logout must never create another conversation.
    if (version === lifetime.current) setRevision((value) => value + 1);
  }
  const current = result?.key === key && !resetting ? result : undefined;
  return { id: current?.id, error: current?.error, loading: !current, reset };
}
