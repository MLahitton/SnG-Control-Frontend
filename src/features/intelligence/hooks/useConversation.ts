"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ApiClient } from "@/lib/api/types";
import { conversationService } from "../conversation";

type Scope = { api: ApiClient; controller: AbortController; operation: number };
/** Local selectors only; durable history belongs to the authenticated server subject. */
export function useConversation(api: ApiClient, enabled: boolean) {
  const scope = useRef<Scope | null>(null);
  const key = useMemo(() => ({ api, enabled }), [api, enabled]);
  const [result, setResult] = useState<{ key: typeof key; id?: string; error?: unknown }>();
  useEffect(() => {
    if (!enabled) return;
    const current: Scope = { api: api.forCurrentSession(), controller: new AbortController(), operation: 0 };
    scope.current = current;
    queueMicrotask(async () => {
      if (scope.current !== current) return;
      try {
        const resumed = await conversationService.resume(current.api, current.controller.signal);
        if (scope.current === current && current.operation === 0) setResult({ key, id: resumed.conversationId });
      } catch (error) {
        if (scope.current === current && current.operation === 0) setResult({ key, error });
      }
    });
    return () => { current.controller.abort(); if (scope.current === current) scope.current = null; };
  }, [enabled, api, key]);
  async function select(mode: "create" | "resume", signal?: AbortSignal): Promise<string> {
    const current = scope.current;
    if (!current || signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const operation = ++current.operation;
    setResult(undefined);
    try {
      const selected = await conversationService[mode](current.api, signal ? AbortSignal.any([current.controller.signal, signal]) : current.controller.signal);
      if (scope.current !== current || operation !== current.operation || signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      setResult({ key, id: selected.conversationId });
      return selected.conversationId;
    } catch (error) {
      if (scope.current === current && operation === current.operation) setResult({ key, error });
      throw error;
    }
  }
  const current = result?.key === key ? result : undefined;
  return {
    id: current?.id, error: current?.error, loading: !current,
    reset: async () => { try { await select("create"); } catch { /* Error is rendered by the panel. */ } },
    recover: (signal?: AbortSignal) => select("resume", signal),
  };
}
