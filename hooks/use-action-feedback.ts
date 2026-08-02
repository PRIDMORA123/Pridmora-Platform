"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionFeedbackState } from "@/types/action-feedback";

type RunActionOptions<T> = {
  loadingMessage?: string;
  successMessage?: string;
  errorMessage?: string;
  successDurationMs?: number;
  onSuccess?: (result: T) => void;
  onError?: (error: unknown) => void;
};

const INITIAL_STATE: ActionFeedbackState = {
  status: "idle",
};

export function useActionFeedback() {
  const [feedback, setFeedback] =
    useState<ActionFeedbackState>(INITIAL_STATE);

  const resetTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const mountedRef = useRef(true);
  const loadingRef = useRef(false);

  useEffect(() => {
    // React Strict Mode runs effect cleanups between mount passes.
    // Always re-assert mounted on setup so async completions can settle UI state.
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearResetTimer();
    loadingRef.current = false;
    setFeedback(INITIAL_STATE);
  }, [clearResetTimer]);

  const markUnsaved = useCallback(
    (message = "Unsaved changes") => {
      if (loadingRef.current) return;

      clearResetTimer();

      setFeedback({
        status: "unsaved",
        message,
      });
    },
    [clearResetTimer]
  );

  const runAction = useCallback(
    async <T,>(
      action: () => Promise<T>,
      options: RunActionOptions<T> = {}
    ): Promise<T | null> => {
      if (loadingRef.current) {
        return null;
      }

      clearResetTimer();
      loadingRef.current = true;

      setFeedback({
        status: "loading",
        message: options.loadingMessage ?? "Saving…",
      });

      try {
        const result = await action();

        loadingRef.current = false;

        if (!mountedRef.current) {
          return result;
        }

        setFeedback({
          status: "success",
          message: options.successMessage ?? "Saved",
        });

        options.onSuccess?.(result);

        resetTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            setFeedback(INITIAL_STATE);
          }
        }, options.successDurationMs ?? 2500);

        return result;
      } catch (error) {
        loadingRef.current = false;

        if (!mountedRef.current) {
          return null;
        }

        setFeedback({
          status: "error",
          message:
            options.errorMessage ?? "Unable to complete this action",
        });

        options.onError?.(error);

        return null;
      }
    },
    [clearResetTimer]
  );

  return {
    feedback,
    isLoading: feedback.status === "loading",
    hasUnsavedChanges: feedback.status === "unsaved",
    runAction,
    markUnsaved,
    reset,
  };
}
