"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// Local request state only. A changed loader/filter hides the previous result;
// aborted or late requests cannot replace the current view.
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [revision, setRevision] = useState(0);
  const key = useMemo(() => ({ load, revision }), [load, revision]);
  const [result, setResult] = useState<{ key: typeof key; data?: T; error?: unknown }>();
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setResult({ key, data }); },
      (error: unknown) => { if (!controller.signal.aborted) setResult({ key, error }); },
    );
    return () => controller.abort();
  }, [load, key]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const update = (data: T) => setResult({ key, data });
  return {
    data: result?.key === key ? result.data : undefined,
    error: result?.key === key ? result.error : undefined,
    loading: result?.key !== key,
    refresh, update,
  };
}
