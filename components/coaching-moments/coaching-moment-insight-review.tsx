"use client";

import type { CoachingMomentInsight } from "@/lib/coaching-moments/coaching-moment";
import {
  IdentityCoachContent,
  IdentityInsight,
} from "@/components/identity-intelligence";

export type CoachingMomentInsightReviewProps = {
  insight: CoachingMomentInsight;
  editedSummary: string;
  busy?: boolean;
  error?: string | null;
  onEditedSummaryChange: (value: string) => void;
  onKeep: () => void;
  onSaveEdit: () => void;
  onDiscard: () => void;
};

export function CoachingMomentInsightReview({
  insight,
  editedSummary,
  busy = false,
  error = null,
  onEditedSummaryChange,
  onKeep,
  onSaveEdit,
  onDiscard,
}: CoachingMomentInsightReviewProps) {
  const isEdited = editedSummary.trim() !== insight.summary.trim();

  return (
    <div className="coaching-moment-insight">
      <IdentityInsight
        title="Concise insight"
        evidenceStrength="emerging"
        evidenceLabel="Optional draft for your review. Nothing is approved until you keep it."
        reviewState="draft"
        compact
      >
        <IdentityCoachContent kind="notes" label="Interaction summary">
          <label className="coaching-moment-field" htmlFor="coaching-moment-insight">
            <span className="sr-only">Interaction summary</span>
            <textarea
              id="coaching-moment-insight"
              value={editedSummary}
              disabled={busy}
              rows={4}
              onChange={event => onEditedSummaryChange(event.target.value)}
            />
          </label>
        </IdentityCoachContent>

        {insight.commitment ? (
          <section className="coaching-moment-guidance__block">
            <h4>Confirmed commitment</h4>
            <p>{insight.commitment}</p>
          </section>
        ) : null}

        {insight.patternConnection ? (
          <section className="coaching-moment-guidance__block">
            <h4>Possible connection</h4>
            <p>{insight.patternConnection}</p>
          </section>
        ) : null}

        {insight.followUpQuestion ? (
          <section className="coaching-moment-guidance__block">
            <h4>Suggested follow-up question</h4>
            <p>{insight.followUpQuestion}</p>
          </section>
        ) : null}
      </IdentityInsight>

      {error ? (
        <p className="coaching-moment-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="coaching-moment-actions">
        <button
          type="button"
          className="identity-modal-button identity-modal-button--secondary"
          disabled={busy}
          onClick={onDiscard}
        >
          Discard
        </button>
        {isEdited ? (
          <button
            type="button"
            className="identity-modal-button identity-modal-button--primary"
            disabled={busy || !editedSummary.trim()}
            onClick={onSaveEdit}
          >
            Keep edited insight
          </button>
        ) : (
          <button
            type="button"
            className="identity-modal-button identity-modal-button--primary"
            disabled={busy}
            onClick={onKeep}
          >
            Keep
          </button>
        )}
      </div>
    </div>
  );
}
