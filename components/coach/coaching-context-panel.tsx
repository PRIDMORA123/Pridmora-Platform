"use client";

import type { ReactNode } from "react";
import type {
  CoachingCommitment,
  SessionStatus,
  SuggestedQuestion,
} from "@/types/coach-workspace";
import { CoachingSupportActions } from "@/components/coach/coaching-support-actions";
import { SessionTimer } from "@/components/coach/session-timer";

type Props = {
  focus?: string | null;
  commitments: CoachingCommitment[];
  insights: string[];
  suggestedQuestions: SuggestedQuestion[];
  elapsedSeconds: number;
  sessionStatus: SessionStatus;
  notes: string;
  clientName?: string;
  preparation?: string;
  isOpen: boolean;
  onClose: () => void;
  onInsertQuestion: (question: SuggestedQuestion) => void;
  onAddSupportToNotes: (content: string) => void;
  onStartSession: () => void;
  onPauseSession: () => void;
  onResumeSession: () => void;
};

export function CoachingContextPanel({
  focus,
  commitments,
  insights,
  suggestedQuestions,
  elapsedSeconds,
  sessionStatus,
  notes,
  clientName,
  preparation,
  isOpen,
  onClose,
  onInsertQuestion,
  onAddSupportToNotes,
  onStartSession,
  onPauseSession,
  onResumeSession,
}: Props) {
  const openCommitments = commitments.filter(item => item.status === "open");

  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="coach-context-overlay"
          onClick={onClose}
          aria-label="Close session context"
        />
      )}

      <aside
        className={["coaching-context-panel", isOpen ? "is-open" : ""]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="coaching-context-panel__mobile-header">
          <h2>Session context</h2>

          <button type="button" onClick={onClose} aria-label="Close session context">
            Close
          </button>
        </div>

        <ContextSection title="Session focus">
          <p>{focus || "No session focus has been recorded."}</p>
        </ContextSection>

        <ContextSection title="Open commitments">
          {openCommitments.length > 0 ? (
            <ul className="context-commitment-list">
              {openCommitments.map(commitment => (
                <li key={commitment.id}>{commitment.text}</li>
              ))}
            </ul>
          ) : (
            <p className="context-empty-copy">No open commitments.</p>
          )}
        </ContextSection>

        <ContextSection title="Key insights">
          {insights.length > 0 ? (
            <ul className="context-insight-list">
              {insights.map((insight, index) => (
                <li key={`${index}-${insight}`}>{insight}</li>
              ))}
            </ul>
          ) : (
            <p className="context-empty-copy">
              Insights will appear as the coaching relationship develops.
            </p>
          )}
        </ContextSection>

        <ContextSection title="Suggested questions">
          {suggestedQuestions.length > 0 ? (
            <div className="suggested-question-list">
              {suggestedQuestions.map(question => (
                <button
                  type="button"
                  key={question.id}
                  onClick={() => onInsertQuestion(question)}
                >
                  {question.text}
                  <span>Add to notes</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="context-empty-copy">No suggested questions available.</p>
          )}
        </ContextSection>

        <SessionTimer
          elapsedSeconds={elapsedSeconds}
          sessionStatus={sessionStatus}
          onStart={onStartSession}
          onPause={onPauseSession}
          onResume={onResumeSession}
        />

        <CoachingSupportActions
          notes={notes}
          focus={focus}
          clientName={clientName}
          preparation={preparation}
          onAddToNotes={onAddSupportToNotes}
        />
      </aside>
    </>
  );
}

function ContextSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="context-panel-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
