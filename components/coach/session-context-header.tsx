import { useOrganisation } from "@/lib/organisations/organisation-context";
import { resolveProductLanguage } from "@/lib/role-language";
import type { ReactNode } from "react";
import type {
  CoachWorkspaceViewModel,
  SessionStatus,
} from "@/types/coach-workspace";

type Props = {
  client: CoachWorkspaceViewModel["client"];
  conversation: CoachWorkspaceViewModel["conversation"];
  sessionStatus: SessionStatus;
  onOpenContext: () => void;
  intelligenceIndicator?: ReactNode;
};

function getStatusLabel(status: SessionStatus) {
  switch (status) {
    case "prepared":
    case "not_started":
      return "Session not started";
    case "in_progress":
      return "Conversation in progress";
    case "paused":
      return "Conversation paused";
    case "completed":
      return "Conversation completed";
  }
}

export function SessionContextHeader({
  client,
  conversation,
  sessionStatus,
  onOpenContext,
  intelligenceIndicator,
}: Props) {
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);
  return (
    <header className="coach-context-header">
      <div className="coach-context-header__main">
        <p className="coach-context-header__eyebrow">{language.workspaceTitle}</p>

        <h1>{client.name}</h1>

        {(client.role || client.organisation) && (
          <p className="coach-context-header__client-meta">
            {[client.role, client.organisation].filter(Boolean).join(" · ")}
          </p>
        )}

        {conversation.focus && (
          <p className="coach-context-header__focus">{conversation.focus}</p>
        )}

        <div className="coach-context-header__metadata">
          <span>
            {conversation.date
              ? formatConversationDate(conversation.date)
              : "Date not set"}
          </span>

          {conversation.sequenceLabel && <span>{conversation.sequenceLabel}</span>}

          <SessionStatusBadge status={sessionStatus} />

          {intelligenceIndicator}
        </div>
      </div>

      <button
        type="button"
        className="coach-context-header__mobile-context"
        onClick={onOpenContext}
      >
        Session context
      </button>
    </header>
  );
}

function SessionStatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span className={["session-status-badge", `is-${status}`].join(" ")}>
      {getStatusLabel(status)}
    </span>
  );
}

function formatConversationDate(dateValue: string) {
  const isoCandidate = /^\d{4}-\d{2}-\d{2}/.test(dateValue)
    ? `${dateValue.slice(0, 10)}T00:00:00`
    : dateValue;
  const date = new Date(isoCandidate);

  if (Number.isNaN(date.getTime())) {
    return dateValue || "Date not set";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
