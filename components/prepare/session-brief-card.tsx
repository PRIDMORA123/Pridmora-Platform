"use client";

import { useState, type ReactNode } from "react";
import {
  getAllDisplayQuestions,
  getConciseSessionFocus,
  getDisplayQuestions,
  getDisplayTopics,
  getClientFirstName,
} from "@/lib/session/session-display";
import { IdentityInsight } from "@/components/identity-intelligence";

export type SessionBriefCardProps = {
  clientName: string;
  purpose?: string | null;
  focus?: string | null;
  exploration?: string | null;
  topics?: string | string[] | null;
  questions?: string | string[] | null;
  previousCommitment?: string | null;
  mode?: "manual" | "assisted" | "comprehensive";
  supportingInsight?: string | null;
  /** Progressive disclosure content for Comprehensive only. */
  deeperContextSlot?: ReactNode;
  /** True when approved coaching evidence was used for this brief. */
  hasApprovedEvidence?: boolean;
  /** Show when supporting context content exists. */
  hasSupportingContext?: boolean;
  /** Show when a detailed brief exists. */
  hasDetailedBrief?: boolean;
  onOpenSupportingContext?: () => void;
  onViewDetailedBrief?: () => void;
  onViewSources?: () => void;
  onStartSession: () => void;
  /** Opens or toggles the session-brief review disclosure. */
  onReview: () => void;
  reviewOpen?: boolean;
  reviewPanelId?: string;
  startDisabled?: boolean;
  startBusy?: boolean;
};

/**
 * Calm default Session Brief card.
 * Answers: “Am I ready for this conversation?”
 */
export function SessionBriefCard({
  clientName,
  purpose,
  focus,
  exploration,
  topics,
  questions,
  previousCommitment,
  mode = "assisted",
  supportingInsight,
  deeperContextSlot = null,
  hasApprovedEvidence = false,
  hasSupportingContext = false,
  hasDetailedBrief = false,
  onOpenSupportingContext,
  onViewDetailedBrief,
  onViewSources,
  onStartSession,
  onReview,
  reviewOpen = false,
  reviewPanelId,
  startDisabled = false,
  startBusy = false,
}: SessionBriefCardProps) {
  const [questionsExpanded, setQuestionsExpanded] = useState(false);
  const [deeperContextOpen, setDeeperContextOpen] = useState(false);

  const clientFirstName = getClientFirstName(clientName);
  const isManual = mode === "manual";
  const isComprehensive = mode === "comprehensive";

  const primaryFocus = getConciseSessionFocus({
    purpose,
    focus,
    exploration,
    clientFirstName,
  });

  const displayTopics = getDisplayTopics(topics, { max: 3 });
  const allQuestions = getAllDisplayQuestions(questions);
  const questionCap = isComprehensive ? 6 : 3;
  const visibleQuestions = questionsExpanded
    ? allQuestions.slice(0, questionCap)
    : getDisplayQuestions(questions, { max: 3 });
  const hiddenQuestionCount = Math.min(
    Math.max(allQuestions.length - 3, 0),
    isComprehensive ? 3 : 0
  );

  const commitment = previousCommitment?.trim() || "";
  const hasCommitment = Boolean(commitment);

  const showInsight =
    isComprehensive &&
    deeperContextOpen &&
    Boolean(supportingInsight?.trim());

  const readyDescription = hasApprovedEvidence
    ? `Prepared from ${clientFirstName}'s approved coaching evidence.`
    : "Prepared from the information currently available.";

  const reviewLabel = isManual
    ? reviewOpen
      ? "Close preparation notes"
      : "Add preparation notes"
    : reviewOpen
      ? "Close session brief"
      : "Review session brief";

  return (
    <section
      className="session-brief-card session-brief-card--principal prepare-ready preparation-brief"
      aria-labelledby="session-brief-ready-title"
    >
      <div className="prepare-ready__status preparation-brief__ready">
        <span className="prepare-ready__indicator" aria-hidden="true" />
        <div>
          <h2
            id="session-brief-ready-title"
            className="prepare-ready__label"
          >
            Preparation ready
          </h2>
          <p className="prepare-ready__description">{readyDescription}</p>
          {hasApprovedEvidence && onViewSources ? (
            <button
              type="button"
              className="identity-text-action prepare-ready__sources"
              onClick={onViewSources}
            >
              View sources
            </button>
          ) : null}
        </div>
      </div>

      {isManual ? (
        <div className="session-brief-card__body preparation-brief__section">
          <h3>Manual preparation</h3>
          <p className="session-brief-card__manual-note">
            No generated brief is active.
          </p>
        </div>
      ) : (
        <div className="session-brief-card__body">
          <section className="session-brief-card__section preparation-brief__section">
            <h2>Primary focus</h2>
            <p className="session-brief-card__focus">{primaryFocus}</p>
          </section>

          {displayTopics.length > 0 ? (
            <section className="session-brief-card__section preparation-brief__section">
              <h2>Areas to explore</h2>
              <ul className="session-brief-card__topics preparation-brief__list">
                {displayTopics.map(topic => (
                  <li key={topic.original}>{topic.label}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {visibleQuestions.length > 0 ? (
            <section className="session-brief-card__section preparation-brief__section">
              <h2>Suggested questions</h2>
              <ol className="session-brief-card__questions preparation-brief__questions">
                {visibleQuestions.map((question, index) => (
                  <li key={`${index}-${question}`}>{question}</li>
                ))}
              </ol>
              {hiddenQuestionCount > 0 && !questionsExpanded ? (
                <button
                  type="button"
                  className="identity-text-action"
                  onClick={() => setQuestionsExpanded(true)}
                >
                  View {hiddenQuestionCount} more question
                  {hiddenQuestionCount === 1 ? "" : "s"}
                </button>
              ) : null}
            </section>
          ) : null}

          <section className="session-brief-card__section preparation-brief__section">
            <h2>Previous commitment</h2>
            <p className="session-brief-card__commitment">
              {hasCommitment
                ? commitment
                : "No previous commitment was recorded."}
            </p>
          </section>

          {isComprehensive &&
          (supportingInsight?.trim() ||
            deeperContextSlot ||
            (hasDetailedBrief && onViewDetailedBrief)) ? (
            <div className="preparation-brief__disclosure">
              <button
                type="button"
                className="identity-text-action"
                aria-expanded={deeperContextOpen}
                onClick={() => setDeeperContextOpen(current => !current)}
              >
                {deeperContextOpen
                  ? "Hide deeper context"
                  : "View deeper context"}
              </button>

              {deeperContextOpen ? (
                <div className="preparation-brief__deeper">
                  {showInsight ? (
                    <IdentityInsight
                      title="Relevant insight"
                      evidenceStrength="supported"
                      evidenceLabel="Suggested from approved coaching evidence."
                      reviewState="draft"
                      compact
                    >
                      <p>{supportingInsight!.trim()}</p>
                    </IdentityInsight>
                  ) : null}

                  {deeperContextSlot}

                  {hasDetailedBrief && onViewDetailedBrief ? (
                    <button
                      type="button"
                      className="identity-text-action"
                      onClick={onViewDetailedBrief}
                    >
                      View detailed brief
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {!isManual &&
      !isComprehensive &&
      ((hasSupportingContext && onOpenSupportingContext) ||
        (hasDetailedBrief && onViewDetailedBrief)) ? (
        <div className="prepare-ready__context">
          {hasSupportingContext && onOpenSupportingContext ? (
            <div className="prepare-ready__context-item">
              <span>Additional context available</span>
              <button
                type="button"
                className="identity-text-action"
                onClick={onOpenSupportingContext}
              >
                View additional context
              </button>
            </div>
          ) : null}

          {hasDetailedBrief && onViewDetailedBrief ? (
            <button
              type="button"
              className="identity-text-action"
              onClick={onViewDetailedBrief}
            >
              View detailed brief
            </button>
          ) : null}
        </div>
      ) : null}

      {!isManual &&
      isComprehensive &&
      hasSupportingContext &&
      onOpenSupportingContext ? (
        <div className="prepare-ready__context">
          <div className="prepare-ready__context-item">
            <span>Additional context available</span>
            <button
              type="button"
              className="identity-text-action"
              onClick={onOpenSupportingContext}
            >
              View additional context
            </button>
          </div>
        </div>
      ) : null}

      <div className="prepare-ready__actions session-brief-card__actions">
        <button
          type="button"
          className="identity-button is-primary identity-button--primary"
          disabled={startDisabled || startBusy}
          onClick={onStartSession}
        >
          {startBusy ? "Starting…" : "Start conversation"}
        </button>
        <button
          type="button"
          className="identity-button is-secondary identity-button--secondary"
          aria-expanded={reviewOpen}
          aria-controls={reviewPanelId}
          onClick={onReview}
        >
          {reviewLabel}
        </button>
      </div>
    </section>
  );
}
