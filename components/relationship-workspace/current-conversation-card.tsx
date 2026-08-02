"use client";

import { SessionModuleTile } from "@/components/relationship-workspace/session-module-tile";
import {
  conversationDisplayTitle,
  conversationStatusLabel,
  deriveSessionWorkspaceState,
  type SessionModuleId,
  type SessionModuleState,
} from "@/lib/relationship-workspace";
import { getConciseSessionFocus } from "@/lib/session/session-display";
import { formatSessionDateLabel } from "@/lib/session/session-display";
import type { Session } from "@/lib/types";

export type CurrentConversationCardProps = {
  session: Session;
  clientFirstName?: string;
  onModuleAction: (moduleId: SessionModuleId) => void;
  /** When false, the workspace owns the single primary CTA above this card. */
  showPrimaryAction?: boolean;
  onPrimaryAction?: (moduleId: SessionModuleId | null) => void;
  primaryActionOverride?: string | null;
  footer?: React.ReactNode;
};

export function CurrentConversationCard({
  session,
  clientFirstName,
  onModuleAction,
  showPrimaryAction = false,
  onPrimaryAction,
  primaryActionOverride,
  footer,
}: CurrentConversationCardProps) {
  const workspace = deriveSessionWorkspaceState(session);
  const title = conversationDisplayTitle(session);
  const dateLabel = formatSessionDateLabel(session.date, session.time);
  const statusLabel = conversationStatusLabel(session);
  const focus = getConciseSessionFocus({
    purpose: session.prepPurpose,
    focus: session.focus,
    exploration: session.prepTopics,
    clientFirstName,
  });

  return (
    <section
      className="current-conversation-card current-conversation-card--primary-surface"
      aria-labelledby="current-conversation-title"
    >
      <header className="current-conversation-card__header">
        <p className="current-conversation-card__eyebrow">
          Session {session.sessionNumber}
        </p>
        <h2
          id="current-conversation-title"
          className="current-conversation-card__title"
        >
          {title}
        </h2>
        <p className="current-conversation-card__meta">
          {dateLabel} · {statusLabel}
        </p>
      </header>

      <div className="current-conversation-card__focus">
        <p className="current-conversation-card__label">Focus</p>
        <p className="current-conversation-card__focus-text">{focus}</p>
      </div>

      <div
        className="current-conversation-card__modules"
        role="list"
        aria-label="Conversation modules"
      >
        {workspace.modules.map((module: SessionModuleState) => (
          <div
            key={module.id}
            role="listitem"
            className={
              module.status === "current"
                ? "current-conversation-card__module-span"
                : undefined
            }
          >
            <SessionModuleTile
              title={module.title}
              description={module.description}
              status={module.status}
              statusLabel={module.statusLabel}
              actionLabel={module.actionLabel}
              intelligence={module.intelligence}
              current={module.id === workspace.currentModuleId}
              unavailableReason={module.unavailableReason}
              onClick={
                module.available
                  ? () => onModuleAction(module.id)
                  : undefined
              }
            />
          </div>
        ))}
      </div>

      {showPrimaryAction && onPrimaryAction ? (
        <div className="current-conversation-card__primary">
          <button
            type="button"
            className="identity-button is-primary"
            onClick={() => onPrimaryAction(workspace.primaryModuleId)}
          >
            {primaryActionOverride || workspace.primaryActionLabel}
          </button>
        </div>
      ) : null}

      {footer ? (
        <div className="current-conversation-card__footer">{footer}</div>
      ) : null}
    </section>
  );
}
