"use client";

import {
  COACHING_MOMENT_TYPE_LABELS,
  type CoachingMoment,
  type CoachingMomentStatus,
} from "@/lib/coaching-moments/coaching-moment";

const STATUS_LABELS: Record<CoachingMomentStatus, string> = {
  draft: "Draft",
  prepared: "Prepared",
  in_progress: "In conversation",
  captured: "Captured",
  complete: "Saved",
  discarded: "Discarded",
};

export function CoachingMomentStatusBadge({
  moment,
}: {
  moment: Pick<CoachingMoment, "status" | "inferredType">;
}) {
  return (
    <div className="coaching-moment-status" aria-live="polite">
      <span className="coaching-moment-status__badge">
        {STATUS_LABELS[moment.status]}
      </span>
      {moment.inferredType ? (
        <span className="coaching-moment-status__type">
          {COACHING_MOMENT_TYPE_LABELS[moment.inferredType]}
        </span>
      ) : null}
    </div>
  );
}

export function CoachingMomentSaveState({
  state,
}: {
  state: "idle" | "saving" | "saved" | "unsaved" | "error";
}) {
  if (state === "idle") return null;

  const labels = {
    saving: "Saving…",
    saved: "Saved",
    unsaved: "Unsaved",
    error: "Save failed",
  } as const;

  return (
    <p
      className={`coaching-moment-save-state is-${state}`}
      aria-live="polite"
      role={state === "error" ? "alert" : undefined}
    >
      {labels[state]}
    </p>
  );
}
