"use client";

import { useEffect, useState } from "react";
import { apiJson, errorMessage } from "@/lib/api-client";
import type { Client } from "@/lib/types";
import type { DevelopmentUpdateReviewTask } from "@/lib/development-updates/types";

function formatDate(value: string): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function GlobalIntelligenceView({
  clients,
  onOpenClient,
  onReviewUpdate,
  onOpenMyDevelopment,
}: {
  clients: Client[];
  onOpenClient: (client: Client) => void;
  onReviewUpdate?: (client: Client, updateId: string) => void;
  onOpenMyDevelopment?: () => void;
}) {
  const [tasks, setTasks] = useState<DevelopmentUpdateReviewTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await apiJson<{ awaitingReview: DevelopmentUpdateReviewTask[] }>(
          "/api/development-updates"
        );
        if (!cancelled) setTasks(data.awaitingReview ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err, "Unable to load development updates."));
          setTasks([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [clients.length]);

  return (
    <section className="page">
      <div className="page-heading">
        <p className="eyebrow">Development</p>
        <h1>Development Intelligence</h1>
        <p>
          Individual and team development intelligence built from reviewed conversation
          evidence. Separate from your own development record.
        </p>
      </div>

      <div className="button-row" style={{ marginBottom: 24 }}>
        {onOpenMyDevelopment ? (
          <button type="button" className="secondary" onClick={onOpenMyDevelopment}>
            My development
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="inline-error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {loading ? <p className="muted">Loading development updates…</p> : null}

      <section className="intelligence-section">
        <h2>Updates ready for review</h2>
        {tasks.length === 0 ? (
          <article className="panel empty-panel">
            <h3>No development updates waiting</h3>
            <p className="muted empty-state">
              When a session is completed, one suggested development update will appear here.
            </p>
          </article>
        ) : (
          <div className="list-card">
            {tasks.map(task => {
              const client = clients.find(entry => entry.id === task.clientId);
              return (
                <div className="session-row" key={task.update.id}>
                  <span className="grow">
                    <strong>{task.clientName}</strong>
                    <small>
                      Suggested changes are ready from your session
                      {task.sessionDate ? ` on ${formatDate(task.sessionDate)}` : ""}.
                    </small>
                  </span>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      if (client && onReviewUpdate) {
                        onReviewUpdate(client, task.update.id);
                      } else if (client) {
                        onOpenClient(client);
                      }
                    }}
                  >
                    Review update
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
