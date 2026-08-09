"use client";

import { useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/feedback/action-button";
import { SessionSaveStatus } from "@/components/session/session-save-status";
import { SessionErrorMessage } from "@/components/session/session-error-message";
import { SummaryInsightsView } from "@/components/summary-insights/summary-insights-view";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { serialiseError } from "@/lib/api-client";
import { BRAND } from "@/lib/brand";
import {
  contentFromSession,
  serialiseSummaryContent,
} from "@/lib/summary-insights/serialise-summary-content";
import {
  hasSummaryInsightsContent,
} from "@/lib/summary-insights/normalise-summary-content";
import type { SummaryInsightsContent } from "@/lib/summary-insights/types";
import { SUMMARY_STATUS_LABELS } from "@/lib/session-workflow";
import { toActionButtonStatus } from "@/types/action-feedback";
import type { Session, SummaryStatus } from "@/lib/types";
import type { SummaryFields } from "@/types/summary-workspace";
import { SessionPatternInsightBanner } from "@/components/patterns/pattern-panels";
import "@/components/summary-insights/summary-insights.css";

export type SessionSummaryReviewProps = {
  session: Session;
  readOnly?: boolean;
  patternInsight?: {
    text: string;
    kind: "reinforces" | "weakens" | "emerging" | "insufficient";
  } | null;
  onGenerate: () => Promise<SummaryFields | null>;
  onSaveDraft: (summary: SummaryFields) => Promise<void>;
  onApprove: (summary: SummaryFields) => Promise<void>;
  onContinue?: () => void;
  onSkip?: () => void;
};

function fieldsFromContent(content: SummaryInsightsContent): SummaryFields {
  const serialised = serialiseSummaryContent(content);
  return {
    sessionSummary: serialised.summary,
    keyThemes: serialised.emergingThemes,
    outcomes: serialised.outcomes,
    agreedActions: serialised.agreedActions,
    strengthsObserved: serialised.strengthsObserved,
    coachingContext: serialised.valuesBecomingVisible,
    developmentEvidence: serialised.professionalIdentityDevelopment,
    suggestedFocus: serialised.suggestedFocus,
    evidenceQualification: serialised.coachReflection,
  };
}

function contentFromFields(fields: SummaryFields): SummaryInsightsContent {
  return contentFromSession({
    summary: fields.sessionSummary,
    emergingThemes: fields.keyThemes,
    strengthsObserved: fields.strengthsObserved ?? "",
    valuesBecomingVisible: fields.coachingContext ?? "",
    professionalIdentityDevelopment: fields.developmentEvidence ?? "",
    agreedActions: fields.agreedActions,
    commitments: fields.agreedActions,
    suggestedFocus: fields.suggestedFocus ?? fields.outcomes,
    outcomes: fields.outcomes,
    coachReflection: fields.evidenceQualification ?? "",
  });
}

/**
 * Session Summary review-and-approve screen.
 * Answers: “Is this an accurate record of the session?”
 */
export function SessionSummaryReview({
  session,
  readOnly = false,
  patternInsight = null,
  onGenerate,
  onSaveDraft,
  onApprove,
  onContinue,
  onSkip,
}: SessionSummaryReviewProps) {
  const [content, setContent] = useState(() => contentFromSession(session));
  const [status, setStatus] = useState<SummaryStatus>(session.summaryStatus);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [coachEdited, setCoachEdited] = useState(false);
  const mutateLockRef = useRef(false);
  const { feedback, isLoading, markUnsaved, runAction, reset } =
    useActionFeedback();

  useEffect(() => {
    setContent(contentFromSession(session));
    setStatus(session.summaryStatus);
    setEditing(false);
    setCoachEdited(false);
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, session.summaryStatus, session.summary]);

  function updateContent(next: SummaryInsightsContent) {
    setContent(next);
    setCoachEdited(true);
    if (status === "approved") setStatus("draft");
    markUnsaved();
  }

  async function regenerate() {
    if (mutateLockRef.current || isLoading) return;

    if (status === "approved" || coachEdited) {
      const confirmed = window.confirm(
        status === "approved"
          ? "This summary is approved. Regenerating requires confirmation and will not overwrite until you approve the new draft. Continue?"
          : "You have unsaved coach edits. Regenerating may replace the current unapproved draft. Your approved record will not change until you approve again. Continue?"
      );
      if (!confirmed) return;
    } else if (hasSummaryInsightsContent(content)) {
      const confirmed = window.confirm(
        "Regenerate the AI draft? The current unapproved draft may be replaced."
      );
      if (!confirmed) return;
    }

    mutateLockRef.current = true;
    setError("");

    await runAction(() => onGenerate(), {
      loadingMessage: "Creating session summary…",
      successMessage: "Draft ready for review",
      errorMessage: "Unable to create summary",
      onSuccess: generated => {
        if (generated) {
          setContent(contentFromFields(generated));
          setStatus("draft");
          setCoachEdited(false);
          setEditing(false);
        }
      },
      onError: err => {
        console.error("Summary regeneration failed", {
          operation: "regenerate_summary",
          sessionId: session.id,
          relationshipId: session.clientId,
          status,
          ...serialiseError(err),
        });
        setError(
          "The session summary could not be created. Your existing draft has not been changed. Try again."
        );
      },
    });

    mutateLockRef.current = false;
  }

  async function saveEdits() {
    if (mutateLockRef.current) return;
    mutateLockRef.current = true;
    setError("");

    await runAction(() => onSaveDraft(fieldsFromContent(content)), {
      loadingMessage: "Saving edits…",
      successMessage: "Draft saved",
      errorMessage: "Unable to save draft",
      onSuccess: () => {
        setStatus("draft");
        setEditing(false);
      },
      onError: err => {
        console.error("Summary draft save failed", {
          operation: "save_summary_draft",
          sessionId: session.id,
          relationshipId: session.clientId,
          ...serialiseError(err),
        });
        setError(
          "Your edits could not be saved. The text remains on screen and has not been lost."
        );
      },
    });

    mutateLockRef.current = false;
  }

  async function approve() {
    if (mutateLockRef.current || isLoading) return;
    mutateLockRef.current = true;
    setError("");

    await runAction(() => onApprove(fieldsFromContent(content)), {
      loadingMessage: "Approving summary…",
      successMessage: "Summary approved",
      errorMessage: "Unable to approve summary",
      onSuccess: () => {
        setStatus("approved");
        setEditing(false);
        onContinue?.();
      },
      onError: err => {
        console.error("Summary approval failed", {
          operation: "approve_summary",
          sessionId: session.id,
          relationshipId: session.clientId,
          ...serialiseError(err),
        });
        setError(
          "The summary could not be approved. Your draft remains available for review."
        );
      },
    });

    mutateLockRef.current = false;
  }

  const hasSummary = hasSummaryInsightsContent(content);

  return (
    <div className="session-summary-review session-summary-review--plain">
      <div className="session-summary-review__status">
        <span className={`summary-status-banner is-${status}`} role="status">
          <span className="session-summary-review__status-label">
            {SUMMARY_STATUS_LABELS[status]}
          </span>
          {status === "draft" ? (
            <em className="summary-ai-label">AI draft — your review required</em>
          ) : null}
        </span>
        <div className="session-summary-review__live" aria-live="polite">
          <SessionSaveStatus feedback={feedback} />
        </div>
      </div>

      {patternInsight ? (
        <SessionPatternInsightBanner
          text={patternInsight.text}
          kind={patternInsight.kind}
        />
      ) : null}

      {error ? (
        <SessionErrorMessage
          message={error}
          onRetry={() => {
            void regenerate();
          }}
        />
      ) : null}

      {!hasSummary ? (
        <section className="session-summary-review__empty">
          <p>
            Use {BRAND.intelligenceName} to organise the session notes and
            identify grounded themes.
          </p>
          <div className="button-row">
            <ActionButton
              status={toActionButtonStatus(feedback.status)}
              idleLabel="Create Summary & Insights"
              loadingLabel="Creating…"
              successLabel="Created"
              errorLabel="Try again"
              disabled={readOnly || isLoading}
              onClick={() => {
                void regenerate();
              }}
            />
            {onSkip ? (
              <button
                type="button"
                className="identity-button secondary"
                disabled={isLoading}
                onClick={onSkip}
              >
                Skip for now
              </button>
            ) : null}
          </div>
        </section>
      ) : (
        <>
          <SummaryInsightsView
            content={content}
            status={status}
            editing={editing}
            readOnly={readOnly}
            disabled={isLoading}
            onChange={updateContent}
          />

          <footer className="session-summary-review__actions">
            {status !== "approved" ? (
              <ActionButton
                status={toActionButtonStatus(feedback.status)}
                idleLabel="Approve summary"
                loadingLabel="Approving…"
                successLabel="Approved"
                errorLabel="Try again"
                disabled={!hasSummary || readOnly || isLoading || editing}
                onClick={() => {
                  void approve();
                }}
              />
            ) : (
              <button
                type="button"
                className="identity-button primary"
                onClick={() => onContinue?.()}
              >
                Continue
              </button>
            )}

            {editing ? (
              <ActionButton
                variant="secondary"
                status={toActionButtonStatus(feedback.status)}
                idleLabel="Save edits"
                loadingLabel="Saving…"
                successLabel="Saved"
                errorLabel="Try again"
                disabled={readOnly || isLoading}
                onClick={() => {
                  void saveEdits();
                }}
              />
            ) : (
              <button
                type="button"
                className="identity-button secondary"
                disabled={readOnly || isLoading}
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
            )}

            <button
              type="button"
              className="identity-button secondary"
              disabled={readOnly || isLoading}
              onClick={() => {
                void regenerate();
              }}
            >
              Regenerate
            </button>

            {onSkip && status !== "approved" ? (
              <button
                type="button"
                className="identity-button secondary"
                disabled={isLoading}
                onClick={onSkip}
              >
                Skip for now
              </button>
            ) : null}
          </footer>
        </>
      )}
    </div>
  );
}
