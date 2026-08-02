"use client";

import { SaveStatus } from "@/components/feedback/save-status";
import type { ActionFeedbackState } from "@/types/action-feedback";

export type SessionSaveStatusProps = {
  feedback?: ActionFeedbackState;
  state?: "idle" | "saving" | "saved" | "unsaved" | "error";
  message?: string;
};

/**
 * Thin wrapper so session stages share one save-status surface.
 * Prefers ActionFeedback when available; falls back to simple state.
 */
export function SessionSaveStatus({
  feedback,
  state = "idle",
  message,
}: SessionSaveStatusProps) {
  if (feedback) {
    return <SaveStatus feedback={feedback} />;
  }

  if (state === "idle") return null;

  const resolvedMessage =
    message ||
    (state === "saving"
      ? "Saving"
      : state === "saved"
        ? "Saved"
        : state === "unsaved"
          ? "Unsaved changes"
          : "Save failed");

  return (
    <span
      className={["identity-save-status", `is-${state}`].join(" ")}
      role="status"
      aria-live="polite"
    >
      <span className="identity-save-status-mark" aria-hidden="true" />
      <span>{resolvedMessage}</span>
    </span>
  );
}
