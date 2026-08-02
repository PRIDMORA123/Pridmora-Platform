"use client";

import { useState } from "react";
import { PreviousConversationCard } from "@/components/relationship-workspace/previous-conversation-card";
import { selectPreviousConversations } from "@/lib/relationship-workspace";
import type { Session } from "@/lib/types";

export function PreviousConversationsGallery({
  sessions,
  currentSessionId,
  onOpenSession,
  loadError = false,
  onRetry,
}: {
  sessions: Session[];
  currentSessionId?: string | null;
  onOpenSession: (sessionId: string) => void;
  loadError?: boolean;
  onRetry?: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const selection = selectPreviousConversations(sessions, currentSessionId);
  const cards = showAll ? selection.all : selection.visible;

  if (loadError) {
    return (
      <section
        className="previous-conversations-gallery"
        aria-labelledby="previous-conversations-title"
      >
        <h2 id="previous-conversations-title">Previous conversations</h2>
        <div className="relationship-canvas__recoverable" role="alert">
          <p>Session history could not be loaded</p>
          <p className="muted">
            Recent conversation records are temporarily unavailable.
          </p>
          {onRetry ? (
            <button
              type="button"
              className="identity-button is-secondary is-sm"
              onClick={onRetry}
            >
              Try again
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  if (selection.total === 0) {
    return (
      <section
        className="previous-conversations-gallery"
        aria-labelledby="previous-conversations-title"
      >
        <h2 id="previous-conversations-title">Previous conversations</h2>
        <p className="previous-conversations-gallery__empty">
          Previous conversations will appear here once recorded.
        </p>
      </section>
    );
  }

  return (
    <section
      className="previous-conversations-gallery previous-conversations-gallery--secondary"
      aria-labelledby="previous-conversations-title"
    >
      <div className="previous-conversations-gallery__header">
        <h2 id="previous-conversations-title">Previous conversations</h2>
        {selection.hasMore && !showAll ? (
          <button
            type="button"
            className="identity-text-action"
            onClick={() => setShowAll(true)}
          >
            View all conversations
          </button>
        ) : null}
        {showAll && selection.hasMore ? (
          <button
            type="button"
            className="identity-text-action"
            onClick={() => setShowAll(false)}
          >
            Show recent
          </button>
        ) : null}
      </div>

      <div className="previous-conversations-gallery__grid">
        {cards.map(conversation => (
          <PreviousConversationCard
            key={conversation.id}
            conversation={conversation}
            onView={onOpenSession}
          />
        ))}
      </div>
    </section>
  );
}
