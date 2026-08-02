"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { identityErrorMessages } from "@/lib/identity-language";

/**
 * Dirty-state helpers for forms with meaningful coaching content.
 * Prefer ConfirmDialog for in-app navigation; beforeunload only when dirty.
 */
export function useUnsavedChanges(isDirty: boolean) {
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const confirmLeave = useCallback((message = identityErrorMessages.unsavedChanges) => {
    if (!dirtyRef.current) return true;
    return window.confirm(message);
  }, []);

  return { confirmLeave };
}

export function useDirtySnapshot<T>(value: T): {
  dirty: boolean;
  markClean: (next?: T) => void;
  baseline: T;
} {
  const [baseline, setBaseline] = useState(value);
  const dirty = JSON.stringify(value) !== JSON.stringify(baseline);

  const markClean = useCallback((next?: T) => {
    setBaseline(next !== undefined ? next : value);
  }, [value]);

  return { dirty, markClean, baseline };
}
