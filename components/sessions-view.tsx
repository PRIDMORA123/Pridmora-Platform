"use client";

import { useMemo } from "react";
import type { Client, Session } from "@/lib/types";
import { isClientArchived } from "@/lib/types";
import {
  formatSessionDateTime,
  SESSION_STATUS_LABELS,
  sessionDisplayTitle,
} from "@/lib/session-workflow";

type SessionRow = {
  client: Client;
  session: Session;
};

export function SessionsView({
  clients,
  onOpenSession,
}: {
  clients: Client[];
  onOpenSession: (clientId: string, sessionId: string) => void;
}) {
  const rows = useMemo(() => {
    const list: SessionRow[] = [];
    for (const client of clients) {
      if (isClientArchived(client)) continue;
      for (const session of client.sessions) {
        list.push({ client, session });
      }
    }
    return list.sort((a, b) => {
      const statusRank: Record<string, number> = {
        in_progress: 0,
        awaiting_completion: 1,
        prepared: 2,
        planned: 3,
        completed: 4,
      };
      const byStatus =
        (statusRank[a.session.status] ?? 9) - (statusRank[b.session.status] ?? 9);
      if (byStatus !== 0) return byStatus;
      return b.session.sessionNumber - a.session.sessionNumber;
    });
  }, [clients]);

  return (
    <section className="page">
      <div className="page-heading">
        <p className="eyebrow">Conversations</p>
        <h1>Development conversations</h1>
        <p>Open the next step for each conversation without leaving the workflow.</p>
      </div>

      {rows.length === 0 ? (
        <article className="panel empty-panel">
          <h2>No conversations yet</h2>
          <p className="muted empty-state">
            Schedule a conversation from a person&apos;s overview to begin preparation.
          </p>
        </article>
      ) : (
        <div className="list-card">
          {rows.map(({ client, session }) => (
            <button
              key={session.id}
              type="button"
              className="session-row"
              onClick={() => onOpenSession(client.id, session.id)}
            >
              <span className="avatar">{client.initials}</span>
              <span className="grow">
                <strong>
                  {client.name} · {sessionDisplayTitle(session)}
                </strong>
                <small>
                  {formatSessionDateTime(session)} · {SESSION_STATUS_LABELS[session.status]}
                </small>
              </span>
              <span className="row-hint">Open</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
