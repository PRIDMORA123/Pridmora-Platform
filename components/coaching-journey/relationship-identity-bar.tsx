import {
  formatSessionDateLabel,
  getSessionSequenceLabel,
} from "@/lib/session/session-display";
import { getRelationshipSubtitle } from "@/lib/coaching-journey";
import { SESSION_STATUS_LABELS } from "@/lib/session-workflow";
import type { SessionStatus } from "@/lib/types";

export type RelationshipIdentityBarProps = {
  clientName: string;
  role?: string | null;
  organisation?: string | null;
  sessionNumber?: number | null;
  totalSessions?: number | null;
  sessionTitle?: string | null;
  sessionDate?: string | null;
  sessionTime?: string | null;
  status?: SessionStatus | null;
  statusLabel?: string | null;
  actions?: React.ReactNode;
};

/**
 * Compact relationship identity — answers “who?” and “which session?”
 * Stage titles and coaching-purpose prose belong elsewhere.
 */
export function RelationshipIdentityBar({
  clientName,
  role,
  organisation,
  sessionNumber,
  totalSessions,
  sessionTitle,
  sessionDate,
  sessionTime,
  status,
  statusLabel,
  actions,
}: RelationshipIdentityBarProps) {
  const relationshipLine = getRelationshipSubtitle({
    role: role ?? undefined,
    organisation: organisation ?? undefined,
  });

  const sequenceLabel =
    sessionNumber != null
      ? getSessionSequenceLabel({ sessionNumber, totalSessions }).replace(
          /\s+of\s+\d+$/,
          ""
        )
      : null;

  const titlePart = sessionTitle?.trim() || null;
  const sessionLine = [sequenceLabel, titlePart].filter(Boolean).join(" · ");

  const dateLabel =
    sessionDate != null
      ? formatSessionDateLabel(sessionDate, sessionTime)
      : null;
  const resolvedStatus =
    statusLabel?.trim() ||
    (status ? SESSION_STATUS_LABELS[status] : null);
  const metaLine = [dateLabel, resolvedStatus].filter(Boolean).join(" · ");

  return (
    <header className="relationship-identity-bar">
      <div className="relationship-identity-bar__copy">
        <p className="relationship-identity-bar__name">{clientName}</p>
        {relationshipLine ? (
          <p className="relationship-identity-bar__role">{relationshipLine}</p>
        ) : null}
        {sessionLine ? (
          <p className="relationship-identity-bar__session">{sessionLine}</p>
        ) : null}
        {metaLine ? (
          <p className="relationship-identity-bar__meta">{metaLine}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="relationship-identity-bar__actions">{actions}</div>
      ) : null}
    </header>
  );
}
