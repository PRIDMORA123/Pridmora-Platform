"use client";

import { useMemo, useState } from "react";
import { ActionsWorkspace } from "@/components/actions/actions-workspace";
import type { CoachingAction, Session } from "@/lib/types";
import { formatSessionDateLabel } from "@/lib/session/session-display";

export type SessionNextStepsProps = {
  clientName: string;
  clientId: string;
  session: Session;
  actions: CoachingAction[];
  nextSessionDate?: string | null;
  readOnly?: boolean;
  /** When true, stage orientation is rendered by the page chrome. */
  hideStageHeader?: boolean;
  onSaveAction: (action: CoachingAction & { clientId: string }) => Promise<CoachingAction>;
  onCompleteSession?: () => void;
  onScheduleNext?: () => void;
  onReturnToJourney?: () => void;
};

type CommitmentSource = "coach recorded" | "AI suggested" | "coach confirmed";

function commitmentMetadataLabel(source: CommitmentSource): string {
  switch (source) {
    case "coach confirmed":
      return "Confirmed by coach";
    case "AI suggested":
      return "AI suggested";
    case "coach recorded":
      return "Recorded by coach";
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
  nextSessionDate,
  readOnly = false,
  hideStageHeader = false,
  onSaveAction,
  onCompleteSession,
  onScheduleNext,
  onReturnToJourney,
}: SessionNextStepsProps) {
  const [noNextSteps, setNoNextSteps] = useState(false);

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
          <h3>
            {allCoachConfirmed
              ? "Coach-confirmed commitments"
              : "Agreed client commitments"}
          </h3>
          {commitmentLines.length === 0 ? (
            <p className="session-next-steps__empty">
              {noNextSteps
                ? "No next steps recorded for this session."
                : "No open commitments yet."}
            </p>
          ) : (
            <ul className="session-next-steps__list">
              {commitmentLines.map(item => (
                <li key={item.id}>
                  <span>{item.text}</span>
                  {!allCoachConfirmed ? (
                    <small className="session-next-steps__meta">
                      {commitmentMetadataLabel(item.source)}
                    </small>
                  ) : null}
                </li>
              ))}
            </ul>
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
          />
        </div>

        <footer className="identity-session-completion-actions session-next-steps__actions">
          {session.status === "awaiting_completion" && onCompleteSession ? (
            <button
              type="button"
              className="identity-button primary"
              disabled={readOnly}
              onClick={onCompleteSession}
            >
              Complete session
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
        </footer>
      </div>
    </div>
  );
}
