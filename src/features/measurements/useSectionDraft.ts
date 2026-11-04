"use client";
import { useEffect, useState } from "react";
// Reconcile clean sections with official reads; never replace a locally edited section.
// Comparing against the previous source also preserves edits made while a save is in flight.
export function useSectionDraft<T>(source: T, keyOf: (value: T) => string, id: string, onDirty: (id: string, dirty: boolean) => void) {
  const sourceKey = keyOf(source);
  const [state, setState] = useState({ sourceKey, value: source });
  let value = state.value;
  if (state.sourceKey !== sourceKey) {
    value = keyOf(state.value) === state.sourceKey ? source : state.value;
    setState({ sourceKey, value });
  }
  const dirty = keyOf(value) !== sourceKey;
  useEffect(() => { onDirty(id, dirty); }, [id, dirty, onDirty]);
  return { value, dirty, setValue: (next: T) => setState({ sourceKey, value: next }), discard: () => setState({ sourceKey, value: source }) };
}
