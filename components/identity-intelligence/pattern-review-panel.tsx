"use client";

import { useEffect, useRef, useState } from "react";
import type { CoachingPattern } from "@/lib/patterns/types";
import { formatSupportedBySessions } from "@/lib/patterns/display";
import { withoutSupportingContextEvidence } from "@/lib/patterns/evidence";
import {
  IdentityEvidenceList,
  evidenceTypeLabel,
  formatEvidenceDateLabel,
  type IdentityEvidenceItem,
} from "@/components/identity-intelligence/identity-evidence-list";

export type PatternReviewPanelProps = {
  pattern: CoachingPattern;
  sessionNumbers?: Map<string, number>;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (input: {
    action: "accept" | "reject" | "edit" | "no_longer_relevant";
    title?: string;
    description?: string;
    coachComment?: string;
  }) => Promise<void>;
};

function buildEvidenceItems(
  pattern: CoachingPattern,
  sessionNumbers?: Map<string, number>
): IdentityEvidenceItem[] {
  return withoutSupportingContextEvidence(pattern.evidence).map((ref, index) => {
    const sessionNumber =
      ref.sessionId && sessionNumbers?.get(ref.sessionId);
    return {
      id: `${ref.sourceType}-${ref.sourceId}-${index}`,
      sourceType: ref.sourceType,
      typeLabel: evidenceTypeLabel(ref.sourceType),
      sessionLabel:
        sessionNumber != null ? `Session ${sessionNumber}` : undefined,
      dateLabel: formatEvidenceDateLabel(ref.sourceDate),
      sortKey: ref.sourceDate ?? null,
      excerpt: ref.excerpt ?? null,
    };
  });
}

/**
 * Inline pattern review panel — expands adjacent to the selected pattern.
 */
export function PatternReviewPanel({
  pattern,
  sessionNumbers,
  busy = false,
  onClose,
  onSubmit,
}: PatternReviewPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [comment, setComment] = useState(pattern.coachComment ?? "");
  const alreadyAccepted = pattern.coachAccepted === true && !pattern.pendingSuggestion;

  useEffect(() => {
    setComment(pattern.coachComment ?? "");
  }, [pattern.id, pattern.coachComment]);

  useEffect(() => {
    const heading = headingRef.current;
    const panel = panelRef.current;
    if (!heading || !panel) return;

    heading.focus();

    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (typeof panel.scrollIntoView === "function") {
      panel.scrollIntoView({
        block: "nearest",
        behavior: reduceMotion ? "auto" : "smooth",
      });
    }
  }, [pattern.id]);

  const evidenceItems = buildEvidenceItems(pattern, sessionNumbers);

  return (
    <div
      ref={panelRef}
      className="pattern-review-panel pattern-review-panel--inline"
      role="region"
      aria-labelledby={`pattern-review-heading-${pattern.id}`}
    >
      <header className="pattern-review-panel__header">
        <h3
          id={`pattern-review-heading-${pattern.id}`}
          ref={headingRef}
          tabIndex={-1}
          className="pattern-review-panel__title"
        >
          {alreadyAccepted ? "View reviewed pattern" : "Review pattern"}
        </h3>
        <button
          type="button"
          className="identity-button is-secondary"
          onClick={onClose}
          disabled={busy}
        >
          Close review
        </button>
      </header>

      <div className="pattern-review-panel__body">
        <p className="pattern-review-panel__pattern-title">{pattern.title}</p>
        <p className="pattern-review-panel__summary">
          {formatSupportedBySessions(pattern, sessionNumbers)}
        </p>
        <p className="pattern-review-panel__description">{pattern.description}</p>

        <div className="pattern-review-panel__evidence">
          <h4 className="pattern-review-panel__eyebrow">Supporting evidence</h4>
          <IdentityEvidenceList items={evidenceItems} chronological />
        </div>

        <label className="pattern-review-panel__decision">
          <span className="pattern-review-panel__eyebrow">Coach decision</span>
          <textarea
            value={comment}
            disabled={busy || alreadyAccepted}
            rows={3}
            onChange={event => setComment(event.target.value)}
            placeholder="Optional professional interpretation…"
          />
        </label>
      </div>

      {!alreadyAccepted ? (
        <div className="pattern-review-panel__actions">
          <button
            type="button"
            className="identity-button is-primary"
            disabled={busy}
            onClick={() =>
              void onSubmit({
                action: "accept",
                coachComment: comment,
              })
            }
          >
            Accept pattern
          </button>
          <button
            type="button"
            className="identity-button is-secondary"
            disabled={busy}
            onClick={() =>
              void onSubmit({
                action: "no_longer_relevant",
                coachComment: comment,
              })
            }
          >
            Not relevant
          </button>
          <button
            type="button"
            className="identity-button is-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Close review
          </button>
        </div>
      ) : (
        <div className="pattern-review-panel__actions">
          <button
            type="button"
            className="identity-button is-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Close review
          </button>
        </div>
      )}
    </div>
  );
}
