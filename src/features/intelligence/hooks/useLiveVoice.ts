"use client";
import { useEffect, useRef, useState } from "react";
import type { ApiClient } from "@/lib/api/types";
import { initialLiveView, LiveConnection } from "../live/connection";

export function useLiveVoice(api: ApiClient) {
  const [view, setView] = useState(initialLiveView);
  const connection = useRef<LiveConnection | null>(null);
  const locked = useRef(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); connection.current?.dispose(); connection.current = null; locked.current = false; pending.current = null; }, [api]);
  async function start(conversationId?: string, recover?: (signal?: AbortSignal) => Promise<string>) {
    if (locked.current || pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    locked.current = true;
    const scopedApi = api.forCurrentSession();
    connection.current?.dispose();
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (controller.signal.aborted) return;
        const live = new LiveConnection(scopedApi, (next) => {
          if (connection.current !== live) return;
          setView(next);
          if (next.state === "idle" || next.state === "error") locked.current = false;
        });
        connection.current = live;
        const outcome = await live.start(conversationId);
        if (controller.signal.aborted || outcome !== "conversation_unavailable") return;
        if (attempt !== 0 || !recover) throw new Error("Conversation unavailable");
        // start() has already closed the provisional peer and stopped every track.
        locked.current = true;
        setView({ ...initialLiveView(), state: "connecting" });
        conversationId = await recover(controller.signal);
      }
    } catch {
      if (!controller.signal.aborted) { locked.current = false; setView({ ...initialLiveView(), state: "error", failure: "unavailable" }); }
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }
  function clear() { pending.current?.abort(); pending.current = null; connection.current?.dispose(); connection.current = null; locked.current = false; setView(initialLiveView); }
  async function stop() {
    pending.current?.abort(); pending.current = null; locked.current = false;
    const current = connection.current;
    await current?.close();
    if (connection.current === current) setView((value) => value.state === "connecting" ? { ...value, state: "idle" } : value);
  }
  return { ...view, start, clear, stop, mute: () => connection.current?.mute(), resumeAudio: () => connection.current?.resumeAudio(), active: !["idle", "error"].includes(view.state) };
}
