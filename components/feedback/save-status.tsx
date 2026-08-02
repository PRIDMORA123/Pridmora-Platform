"use client";

import type { ActionFeedbackState } from "@/types/action-feedback";

export function SaveStatus({
  feedback,
}: {
  feedback: ActionFeedbackState;
}) {
  if (feedback.status === "idle") {
    return null;
  }

  return (
    <span
      className={["identity-save-status", `is-${feedback.status}`].join(" ")}
      role="status"
      aria-live="polite"
    >
      <span className="identity-save-status-mark" aria-hidden="true" />
      <span>{feedback.message}</span>
    </span>
  );
}
