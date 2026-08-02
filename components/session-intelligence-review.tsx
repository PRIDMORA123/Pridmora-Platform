"use client";

/**
 * Legacy session intelligence review has been replaced by a single
 * Development Update review. Kept as a thin adapter for any residual imports.
 */
import { DevelopmentUpdateReviewView } from "@/components/development-update-review";
import type { Client, Session } from "@/lib/types";

export function SessionIntelligenceReviewView({
  updateId,
  onBack,
  onComplete,
}: {
  client?: Client;
  session?: Session;
  updateId?: string;
  onBack: () => void;
  onComplete?: () => void;
}) {
  if (!updateId) {
    return (
      <section className="page">
        <article className="panel empty-panel">
          <h1>Development Update</h1>
          <p className="muted">
            Individual insight approval has been replaced by one Development Update per session.
          </p>
          <div className="button-row">
            <button type="button" className="primary" onClick={onBack}>
              Return to person
            </button>
          </div>
        </article>
      </section>
    );
  }

  return (
    <DevelopmentUpdateReviewView
      updateId={updateId}
      onBack={onBack}
      onApplied={onComplete}
      onDiscarded={onComplete}
    />
  );
}
