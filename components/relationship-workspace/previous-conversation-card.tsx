"use client";

import type { PreviousConversationCardModel } from "@/lib/relationship-workspace";

export function PreviousConversationCard({
  conversation,
  onView,
}: {
  conversation: PreviousConversationCardModel;
  onView: (sessionId: string) => void;
}) {
  return (
    <article className="previous-conversation-card session-history-card">
      <header className="previous-conversation-card__header session-history-card__eyebrow-block">
        <p className="previous-conversation-card__eyebrow session-history-card__eyebrow">
          Session {conversation.sessionNumber}
        </p>
        <h3
          className="previous-conversation-card__title session-history-card__title"
          title={conversation.title}
        >
          {conversation.title}
        </h3>
        <p className="previous-conversation-card__meta session-history-card__meta">
          {conversation.dateLabel} · {conversation.completionLabel}
        </p>
      </header>

      <div className="previous-conversation-card__body session-history-card__content">
        <div>
          <p className="previous-conversation-card__label">Key outcome</p>
          <p
            className="previous-conversation-card__text"
            title={conversation.outcome}
          >
            {conversation.outcome}
          </p>
        </div>
        <div>
          <p className="previous-conversation-card__label">Commitment</p>
          <p
            className="previous-conversation-card__text"
            title={conversation.commitment}
          >
            {conversation.commitment}
          </p>
        </div>
      </div>

      <div className="previous-conversation-card__action session-history-card__action">
        <button
          type="button"
          className="identity-button is-secondary is-sm"
          onClick={() => onView(conversation.id)}
        >
          View conversation
        </button>
      </div>
    </article>
  );
}
