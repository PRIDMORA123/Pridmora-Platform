"use client";

import { useEffect, useState } from "react";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerEmpty } from "@/components/owner/owner-empty";
import { apiJson } from "@/lib/api-client";
import type { PlatformAuditEvent } from "@/lib/owner/types";

export default function OwnerAuditPage() {
  const [events, setEvents] = useState<PlatformAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const payload = await apiJson<{ events: PlatformAuditEvent[] }>(
          "/api/owner/audit"
        );
        if (!active) return;
        setEvents(payload.events);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load audit trail.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <OwnerShell
      title="Audit"
      subtitle="Immutable owner administrative events. Coaching content is never stored here."
    >
      {loading ? <p className="owner-muted">Loading audit trail…</p> : null}
      {error ? <p className="owner-error">{error}</p> : null}

      {!loading && events.length === 0 ? (
        <OwnerEmpty
          title="No audit events yet"
          description="Owner Console administrative actions will appear here once they occur."
        />
      ) : null}

      {events.length > 0 ? (
        <>
          <div className="owner-table-wrap">
            <table className="owner-table">
              <thead>
                <tr>
                  <th scope="col">Timestamp</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Action</th>
                  <th scope="col">Entity</th>
                  <th scope="col">Organisation</th>
                  <th scope="col">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {events.map(event => (
                  <tr key={event.id}>
                    <td>{new Date(event.createdAt).toLocaleString()}</td>
                    <td>{event.actorUserId || "—"}</td>
                    <td>{event.action}</td>
                    <td>
                      {event.entityType}
                      {event.entityId ? ` · ${event.entityId.slice(0, 8)}…` : ""}
                    </td>
                    <td>{event.organisationId ? `${event.organisationId.slice(0, 8)}…` : "—"}</td>
                    <td>
                      <code style={{ fontSize: "0.75rem" }}>
                        {JSON.stringify(event.metadata)}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="owner-stack" aria-label="Audit events">
            {events.map(event => (
              <article key={event.id} className="owner-stack-card">
                <p className="owner-attention-item__title">{event.action}</p>
                <div className="owner-stack-card__row">
                  <span className="owner-stack-card__label">When</span>
                  <span>{new Date(event.createdAt).toLocaleString()}</span>
                </div>
                <div className="owner-stack-card__row">
                  <span className="owner-stack-card__label">Entity</span>
                  <span>{event.entityType}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </OwnerShell>
  );
}
