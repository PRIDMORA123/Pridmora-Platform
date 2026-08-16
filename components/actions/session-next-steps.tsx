"use client";

import { useMemo, useState } from "react";
import { ActionsWorkspace } from "@/components/actions/actions-workspace";
import { StagePrimaryAction } from "@/components/coaching-journey/stage-primary-action";
import type { CoachingAction, Session } from "@/lib/types";
import { formatSessionDateLabel } from "@/lib/session/session-display";
import {
  IDENTITY_EMPTY_STATES,
  priorOpenCommitmentsHint,
} from "@/lib/identity-empty-states";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import type { ProfessionalRole } from "@/lib/organisations/types";

export type SessionNextStepsProps = {
  clientName: string;
  clientId: string;
  session: Session;
  actions: CoachingAction[];
  /** Open commitments from earlier conversations (relationship-wide). */
  priorOpenCommitmentCount?: number;
  nextSessionDate?: string | null;
  readOnly?: boolean;
  /** When true, stage orientation is rendered by the page chrome. */
  hideStageHeader?: boolean;
  productRole?: ProfessionalRole | null;
  onSaveAction: (action: CoachingAction & { clientId: string }) => Promise<CoachingAction>;
  onCompleteSession?: () => void;
  onScheduleNext?: () => void;
  onReturnToJourney?: () => void;
};

type CommitmentSource = "coach recorded" | "AI suggested" | "coach confirmed";

function commitmentSectionTitle(input: {
  allCoachConfirmed: boolean;
  isManager: boolean;
}): string {
  if (input.isManager) {
    return input.allCoachConfirmed
      ? "Manager-confirmed commitments"
      : "Agreed commitments";
  }
  return input.allCoachConfirmed
    ? "Coach-confirmed commitments"
    : "Agreed client commitments";
}

function commitmentMetadataLabel(
  source: CommitmentSource,
  isManager: boolean
): string {
  switch (source) {
    case "coach confirmed":
      return isManager ? "Confirmed by manager" : "Confirmed by coach";
    case "AI suggested":
      return "AI suggested";
    case "coach recorded":
      return isManager ? "Recorded by manager" : "Recorded by coach";
  }
}

/** Display-only split for suggested focus — does not mutate stored text. */
export function splitSuggestedFocusItems(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const byLine = trimmed
    .split(/\r?\n/)
    .map(line => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);

  if (byLine.length > 1) return byLine;

  const byDash = trimmed
    .split(/\s+[–—-]\s+/)
    .map(part => part.trim())
    .filter(Boolean);

  if (byDash.length > 1) return byDash;

  return [trimmed];
}

/**
 * Next Steps: carry forward what matters without re-typing the session.
 */
export function SessionNextSteps({
  clientName,
  clientId,
  session,
  actions,
  priorOpenCommitmentCount = 0,
  nextSessionDate,
  readOnly = false,
  hideStageHeader = false,
  productRole,
  onSaveAction,
  onCompleteSession,
  onScheduleNext,
  onReturnToJourney,
}: SessionNextStepsProps) {
  const [noNextSteps, setNoNextSteps] = useState(false);
  const organisation = useOrganisation();
  const resolvedRole = productRole ?? organisation?.professionalRole ?? null;
  const isManager = resolvedRole === "manager";

  const suggestedFocus = session.suggestedFocus.trim();
  const suggestedFocusItems = useMemo(
    () => splitSuggestedFocusItems(suggestedFocus),
    [suggestedFocus]
  );
  const coachFollowUp = session.reflectPrivate.trim() || session.reflection.trim();

  const commitmentLines = useMemo(() => {
    const fromActions = actions
      .filter(action => action.status !== "Complete")
      .map(action => ({
        id: action.id,
        text: action.title,
        source: "coach recorded" as CommitmentSource,
      }));

    if (fromActions.length > 0) return fromActions;

    const text = (session.agreedActions || session.commitments || "").trim();
    if (!text || /no commitment was agreed/i.test(text)) return [];

    return text
      .split(/\r?\n/)
      .map(line => line.replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean)
      .map((line, index) => ({
        id: `text-${index}`,
        text: line,
        source:
          session.summaryStatus === "approved"
            ? ("coach confirmed" as CommitmentSource)
            : ("AI suggested" as CommitmentSource),
      }));
  }, [actions, session.agreedActions, session.commitments, session.summaryStatus]);

  const allCoachConfirmed =
    commitmentLines.length > 0 &&
    commitmentLines.every(item => item.source === "coach confirmed");

  const openActions = actions.filter(action => action.status !== "Complete");
  const sessionOnlyCommitments =
    openActions.length === 0 && commitmentLines.length > 0;

  const commitmentsHeading = commitmentSectionTitle({
    allCoachConfirmed,
    isManager,
  });

  const nextDateLabel = nextSessionDate?.trim()
    ? formatSessionDateLabel(nextSessionDate)
    : "Not scheduled";

  return (
    <div className="session-next-steps">
      {!hideStageHeader ? (
        <header className="session-next-steps__header">
          <div className="session-next-steps__header-copy">
            <p className="session-next-steps__eyebrow">After the session</p>
            <h2>Carry forward what matters</h2>
            <p>
              Confirm commitments and the focus for next time. AI may suggest; you
              decide.
            </p>
          </div>
        </header>
      ) : null}

      <div className="identity-page-flow">
        <section className="identity-session-surface session-next-steps__card">
          <h3>{commitmentsHeading}</h3>
          {commitmentLines.length === 0 ? (
            <div className="session-next-steps__empty">
              <p>
                {noNextSteps
                  ? "No next steps recorded for this session."
                  : IDENTITY_EMPTY_STATES.noCommitmentsFromConversation.title}
              </p>
              {!noNextSteps ? (
                <>
                  <p className="organisation-muted">
                    {
                      IDENTITY_EMPTY_STATES.noCommitmentsFromConversation
                        .description
                    }
                  </p>
                  {priorOpenCommitmentCount > 0 ? (
                    <p className="organisation-muted">
                      {priorOpenCommitmentsHint(priorOpenCommitmentCount)}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : (
            <>
              <ul className="session-next-steps__list">
                {commitmentLines.map(item => (
                  <li key={item.id}>
                    <span>{item.text}</span>
                    {!allCoachConfirmed ? (
                      <small className="session-next-steps__meta">
                        {commitmentMetadataLabel(item.source, isManager)}
                      </small>
                    ) : null}
                  </li>
                ))}
              </ul>
              {sessionOnlyCommitments ? (
                <p className="session-next-steps__sync-note organisation-muted">
                  These commitments are agreed and will be tracked. They will
                  appear in Open Commitments once recorded as actions.
                </p>
              ) : null}
            </>
          )}

          <label className="session-next-steps__check">
            <input
              type="checkbox"
              checked={noNextSteps}
              disabled={readOnly}
              onChange={event => setNoNextSteps(event.target.checked)}
            />
            <span>No next steps for this session</span>
          </label>
        </section>

        {coachFollowUp ? (
          <section className="identity-session-surface identity-session-surface--private session-next-steps__card is-private">
            <h3>Coach follow-up</h3>
            <p className="session-next-steps__privacy-label">Private</p>
            <p>{coachFollowUp}</p>
          </section>
        ) : null}

        <section className="identity-session-surface session-next-steps__card">
          <h3>Suggested focus for the next session</h3>
          {suggestedFocusItems.length === 0 ? (
            <p>
              No suggested focus yet. You can add one when scheduling the next
              session.
            </p>
          ) : (
            <ul className="session-next-steps__focus-list">
              {suggestedFocusItems.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="identity-session-surface identity-session-surface--compact session-next-steps__card session-next-steps__next-session">
          <h3>Next session</h3>
          <p>{nextDateLabel}</p>
        </section>

        <div className="identity-actions-block">
          <ActionsWorkspace
            clientName={clientName}
            clientId={clientId}
            sessionId={session.id}
            actions={actions}
            readOnly={readOnly}
            onSaveAction={onSaveAction}
            embedded
            sessionScoped
            priorOpenCommitmentCount={priorOpenCommitmentCount}
            suppressOpenEmptyState={sessionOnlyCommitments}
          />
        </div>

        <StagePrimaryAction
          sticky={session.status === "awaiting_completion"}
          className="identity-session-completion-actions session-next-steps__actions"
        >
          {session.status === "awaiting_completion" && onCompleteSession ? (
            <button
              type="button"
              className="identity-button primary"
              disabled={readOnly}
              onClick={onCompleteSession}
            >
              Complete conversation
            </button>
          ) : null}

          {onScheduleNext ? (
            <button
              type="button"
              className="identity-button secondary"
              disabled={readOnly && session.status !== "completed"}
              onClick={onScheduleNext}
            >
              Schedule next session
            </button>
          ) : null}

          {onReturnToJourney ? (
            <button
              type="button"
              className="identity-text-action"
              onClick={onReturnToJourney}
            >
              Return to Current Position
            </button>
          ) : null}
        </StagePrimaryAction>
      </div>
    </div>
  );
}
