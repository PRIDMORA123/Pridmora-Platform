"use client";

import type { Session } from "@/lib/types";
import { SESSION_STATUS_LABELS } from "@/lib/session-workflow";
import { formatSessionDateLabel } from "@/lib/session/session-display";

function coachingSessionsOnly(sessions: Session[]): Session[] {
  // Initial conversations are relationship metadata — never session_number rows here.
  return [...sessions].sort((a, b) => a.sessionNumber - b.sessionNumber);
}

export function CoachingSessionsSection({
  sessions,
  archived = false,
  onOpenSession,
  onPrepare,
  onSchedule,
}: {
  sessions: Session[];
  archived?: boolean;
  onOpenSession: (sessionId: string) => void;
  onPrepare: (sessionId?: string) => void;
  onSchedule: () => void;
}) {
  const list = coachingSessionsOnly(sessions);

  return (
    <section
      className="relationship-journey-section"
      aria-labelledby="coaching-sessions-heading"
    >
      <header className="relationship-journey-section__header">
        <div>
          <p className="journey-eyebrow">Coaching sessions</p>
          <h2 id="coaching-sessions-heading">Coaching sessions</h2>
          <p>The conversations that form this coaching relationship.</p>
        </div>
      </header>

      {list.length === 0 ? (
        <p className="identity-empty-copy">
          No coaching sessions have been recorded yet. An initial conversation,
          where used, is kept separate and does not become Session 1
          automatically.
        </p>
      ) : (
        <ol className="relationship-session-list">
          {list.map(session => (
            <li key={session.id}>
              <button
                type="button"
                className="relationship-session-list__item"
                onClick={() => {
                  if (
                    session.status === "planned" ||
                    session.status === "prepared"
                  ) {
                    onPrepare(session.id);
                    return;
                  }
                  onOpenSession(session.id);
                }}
              >
                <span className="relationship-session-list__title">
                  Session {session.sessionNumber}
                  {session.title?.trim() ? ` · ${session.title.trim()}` : ""}
                </span>
                <span className="relationship-session-list__meta">
                  {formatSessionDateLabel(session.date, session.time)} ·{" "}
                  {SESSION_STATUS_LABELS[session.status]}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {!archived ? (
        <div className="button-row" style={{ marginTop: 16 }}>
          <button type="button" className="secondary" onClick={onSchedule}>
            Schedule conversation
          </button>
        </div>
      ) : null}
    </section>
  );
}
