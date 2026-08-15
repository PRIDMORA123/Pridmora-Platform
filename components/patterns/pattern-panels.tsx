"use client";

import { useState } from "react";
import type { CoachingPattern } from "@/lib/patterns/types";
import {
  coachReviewStateLabel,
  formatSupportedBySessions,
  patternStatusLabel,
  provenanceHref,
} from "@/lib/patterns/display";
import { selectPatternsForDevelopment } from "@/lib/patterns/prioritise";
import {
  IdentityInsight,
  IdentityPattern,
  IdentityEvidenceList,
  evidenceTypeLabel,
  formatEvidenceDateLabel,
  type EvidenceStrength,
  type IntelligenceReviewState,
  type IdentityEvidenceItem,
} from "@/components/identity-intelligence";
import { PatternReviewPanel } from "@/components/identity-intelligence/pattern-review-panel";

function toEvidenceStrength(
  strength: CoachingPattern["strength"]
): EvidenceStrength {
  if (strength === "established") return "established";
  if (strength === "emerging") return "supported";
  return "emerging";
}

function toReviewState(pattern: CoachingPattern): IntelligenceReviewState {
  if (pattern.coachAccepted === true) return "accepted";
  if (pattern.coachAccepted === false || pattern.suppressed) return "rejected";
  if (pattern.coachReviewed) return "reviewed";
  return "draft";
}

function evidenceItemsForPattern(
  pattern: CoachingPattern,
  sessionNumbers?: Map<string, number>
): IdentityEvidenceItem[] {
  return pattern.evidence.map((ref, index) => {
    const sessionNumber =
      ref.sessionId && sessionNumbers?.get(ref.sessionId);
    return {
      id: `${ref.sourceType}-${ref.sourceId}-${index}`,
      typeLabel: evidenceTypeLabel(ref.sourceType),
      sessionLabel:
        sessionNumber != null ? `Session ${sessionNumber}` : undefined,
      dateLabel: formatEvidenceDateLabel(ref.sourceDate),
      href: provenanceHref(ref),
    };
  });
}

export function RelevantPatternsPanel({
  patterns,
  sessionNumbers,
  onViewEvidence,
}: {
  patterns: CoachingPattern[];
  sessionNumbers?: Map<string, number>;
  onViewEvidence?: (pattern: CoachingPattern) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (patterns.length === 0) return null;

  return (
    <section
      className="relevant-patterns-panel"
      aria-labelledby="relevant-patterns-heading"
    >
      <h2 id="relevant-patterns-heading">Relevant patterns</h2>
      <div className="relevant-patterns-list">
        {patterns.slice(0, 2).map(pattern => {
          const open = openId === pattern.id;
          return (
            <IdentityPattern
              key={pattern.id}
              title={pattern.title}
              evidenceStrength={toEvidenceStrength(pattern.strength)}
              evidenceLabel={formatSupportedBySessions(pattern, sessionNumbers)}
              reviewState={toReviewState(pattern)}
              compact
              onViewEvidence={() => {
                setOpenId(current =>
                  current === pattern.id ? null : pattern.id
                );
                onViewEvidence?.(pattern);
              }}
            >
              <p>{pattern.description}</p>
              {open ? (
                <IdentityEvidenceList
                  items={evidenceItemsForPattern(pattern, sessionNumbers)}
                />
              ) : null}
            </IdentityPattern>
          );
        })}
      </div>
    </section>
  );
}

export function PatternsOverTimeSection({
  patterns,
  sessionNumbers,
  showAll = false,
  onReview,
  onViewAll,
  onRefresh,
  refreshing = false,
  reviewingPattern = null,
  onCloseReview,
  onSubmitReview,
  reviewBusy = false,
}: {
  patterns: CoachingPattern[];
  sessionNumbers?: Map<string, number>;
  showAll?: boolean;
  onReview?: (pattern: CoachingPattern) => void;
  onViewAll?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  reviewingPattern?: CoachingPattern | null;
  onCloseReview?: () => void;
  onSubmitReview?: (input: {
    action: "accept" | "reject" | "edit" | "no_longer_relevant";
    title?: string;
    description?: string;
    coachComment?: string;
  }) => Promise<void>;
  reviewBusy?: boolean;
}) {
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const selected = showAll
    ? patterns
    : selectPatternsForDevelopment(patterns, { limit: 3 });
  const visible =
    reviewingPattern && !selected.some(item => item.id === reviewingPattern.id)
      ? [...selected, reviewingPattern]
      : selected;

  return (
    <section
      className="patterns-over-time"
      aria-labelledby="patterns-over-time-heading"
    >
      <div className="patterns-over-time__header">
        <h2 id="patterns-over-time-heading">Recognised patterns</h2>
        {onRefresh ? (
          <button
            type="button"
            className="identity-text-action"
            disabled={refreshing}
            onClick={onRefresh}
          >
            {refreshing ? "Refreshing…" : "Refresh recognised patterns"}
          </button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="identity-empty-copy">
          No reliable longitudinal pattern is currently supported.
        </p>
      ) : (
        <div className="patterns-over-time__list">
          {visible.map(pattern => {
            const open = evidenceId === pattern.id;
            const isReviewing = reviewingPattern?.id === pattern.id;
            const reviewLabel =
              pattern.coachAccepted === true && !pattern.pendingSuggestion
                ? "View reviewed pattern"
                : "Review pattern";

            return (
              <div key={pattern.id} className="patterns-over-time__item">
                <IdentityPattern
                  title={pattern.title}
                  evidenceStrength={toEvidenceStrength(pattern.strength)}
                  evidenceLabel={formatSupportedBySessions(
                    pattern,
                    sessionNumbers
                  )}
                  reviewState={toReviewState(pattern)}
                  onViewEvidence={() =>
                    setEvidenceId(current =>
                      current === pattern.id ? null : pattern.id
                    )
                  }
                  actions={
                    onReview ? (
                      <button
                        type="button"
                        className="identity-button is-secondary"
                        aria-expanded={isReviewing}
                        onClick={() => {
                          if (isReviewing) {
                            onCloseReview?.();
                          } else {
                            onReview(pattern);
                          }
                        }}
                      >
                        {reviewLabel}
                      </button>
                    ) : null
                  }
                >
                  <p>{pattern.description}</p>
                  <p className="identity-supporting">
                    {patternStatusLabel(pattern.status)} ·{" "}
                    {coachReviewStateLabel(pattern)}
                  </p>
                  {pattern.pendingSuggestion ? (
                    <p className="patterns-over-time__pending">
                      {pattern.pendingSuggestion.changeSummary}
                    </p>
                  ) : null}
                  {open ? (
                    <IdentityEvidenceList
                      items={evidenceItemsForPattern(pattern, sessionNumbers)}
                    />
                  ) : null}
                </IdentityPattern>

                {isReviewing && onCloseReview && onSubmitReview ? (
                  <PatternReviewPanel
                    pattern={reviewingPattern}
                    sessionNumbers={sessionNumbers}
                    busy={reviewBusy}
                    onClose={onCloseReview}
                    onSubmit={onSubmitReview}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {!showAll && patterns.length > 3 && onViewAll ? (
        <button
          type="button"
          className="identity-text-action"
          onClick={onViewAll}
        >
          View all patterns
        </button>
      ) : null}
    </section>
  );
}

export function SessionPatternInsightBanner({
  text,
  kind,
}: {
  text: string;
  kind: "reinforces" | "weakens" | "emerging" | "insufficient";
}) {
  if (!text) return null;

  return (
    <IdentityInsight
      title="Session pattern note"
      evidenceStrength={kind === "emerging" ? "emerging" : "supported"}
      reviewState="draft"
      compact
    >
      <p>{text}</p>
      <span className="sr-only">Pattern relation: {kind}.</span>
    </IdentityInsight>
  );
}

/** @deprecated Prefer PatternReviewPanel from identity-intelligence */
export { PatternReviewPanel } from "@/components/identity-intelligence/pattern-review-panel";
