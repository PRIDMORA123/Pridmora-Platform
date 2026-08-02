"use client";

import type { Session } from "@/lib/types";
import { SESSION_STATUS_LABELS } from "@/lib/session-workflow";
import { getFutureOrOpenSession } from "@/lib/session-workflow";

function timelineLabel(session: Session, nextId: string | undefined): string {
  if (session.status === "completed") return "Completed";
  if (
    session.status === "in_progress" ||
    session.status === "paused" ||
    session.status === "awaiting_completion"
  ) {
    return "In progress";
  }
  if (session.id === nextId) return "Next";
  return SESSION_STATUS_LABELS[session.status] ?? session.status;
}

export function SessionTimeline({
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
  const list = [...sessions].sort((a, b) => a.sessionNumber - b.sessionNumber);
  const next = getFutureOrOpenSession(sessions);

  return (
    <section
      className="identity-session-timeline"
      aria-labelledby="coaching-sessions-heading"
    >
      <h2 id="coaching-sessions-heading">Coaching sessions</h2>

      {list.length === 0 ? (
        <p className="identity-empty-copy">No coaching sessions recorded yet.</p>
      ) : (
        <ol className="identity-session-timeline__list">
          {list.map(session => (
            <li key={session.id}>
              <button
                type="button"
                className="identity-session-timeline__item"
                data-state={timelineLabel(session, next?.id).toLowerCase()}
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
                <span>
                  Session {session.sessionNumber}
                  {session.title?.trim() ? ` · ${session.title.trim()}` : ""}
                </span>
                <span className="identity-session-timeline__status">
                  {timelineLabel(session, next?.id)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {!archived ? (
        <div className="button-row identity-session-timeline__actions">
          <button type="button" className="secondary" onClick={onSchedule}>
            Schedule conversation
          </button>
        </div>
      ) : null}
    </section>
  );
}
