"use client";
import { useEffect, useRef, useState } from "react";
import type { ApiClient } from "@/lib/api/types";
import { initialLiveView, LiveConnection } from "../live/connection";

export function useLiveVoice(api: ApiClient) {
  const [view, setView] = useState(initialLiveView);
  const connection = useRef<LiveConnection | null>(null);
  const locked = useRef(false);
  useEffect(() => () => { connection.current?.dispose(); connection.current = null; }, []);
  async function start(conversationId?: string) {
    if (locked.current) return;
    locked.current = true;
    connection.current?.dispose();
    const live = new LiveConnection(api.forCurrentSession(), (next) => {
      if (connection.current !== live) return;
      setView(next);
      if (next.state === "idle" || next.state === "error") locked.current = false;
    });
    connection.current = live;
    await live.start(conversationId);
  }
  function clear() { connection.current?.dispose(); connection.current = null; locked.current = false; setView(initialLiveView); }
  return { ...view, start, clear, stop: () => connection.current?.close(), mute: () => connection.current?.mute(), resumeAudio: () => connection.current?.resumeAudio(), active: !["idle", "error"].includes(view.state) };
}
