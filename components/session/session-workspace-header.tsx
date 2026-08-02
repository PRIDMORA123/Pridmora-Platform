"use client";

import type { ReactNode } from "react";
import {
  formatSessionDateLabel,
  getSessionSequenceLabel,
} from "@/lib/session/session-display";
import { SESSION_STATUS_LABELS } from "@/lib/session-workflow";
import type { SessionStatus } from "@/lib/types";

export type SessionWorkspaceHeaderProps = {
  clientName: string;
  role?: string | null;
  organisation?: string | null;
  /** @deprecated Prefer role + organisation */
  relationshipName?: string | null;
  sessionNumber?: number | null;
  totalSessions?: number | null;
  sessionDate?: string | null;
  sessionTime?: string | null;
  previousSessionDate?: string | null;
  status: SessionStatus;
  sessionTitle?: string | null;
  primaryFocus?: string | null;
  /** Intentionally unused — primary action lives in stage content. */
  nextActionLabel?: string | null;
  actions?: ReactNode;
};

/**
 * Session page identity chrome.
 * Hierarchy: client → role/org → session metadata (date · status).
 * Stage labels and next-action copy belong in the workflow / primary CTA.
 */
export function SessionWorkspaceHeader({
  clientName,
  role,
  organisation,
  relationshipName,
  sessionNumber,
  totalSessions,
  sessionDate,
  sessionTime,
  previousSessionDate,
  status,
  sessionTitle,
  primaryFocus,
  actions,
}: SessionWorkspaceHeaderProps) {
  const sequenceLabel = getSessionSequenceLabel({
    sessionNumber,
    totalSessions,
  });

  const dateLabel = formatSessionDateLabel(sessionDate, sessionTime);
  const previousLabel = previousSessionDate?.trim()
    ? formatSessionDateLabel(previousSessionDate)
    : null;

  const relationshipLine =
    [role?.trim(), organisation?.trim()].filter(Boolean).join(" · ") ||
    relationshipName?.trim() ||
    "";

  const focusLine = primaryFocus?.trim() || sessionTitle?.trim() || "";

  return (
    <header className="session-stage-header">
      <div className="session-stage-header__main">
        <h1 className="session-stage-header__client">{clientName}</h1>

        {relationshipLine ? (
          <p className="session-stage-header__relationship">
            {relationshipLine}
          </p>
        ) : null}

        <p className="session-stage-header__sequence">{sequenceLabel}</p>

        {focusLine ? (
          <p className="session-stage-header__title">{focusLine}</p>
        ) : null}

        <div className="session-stage-header__meta">
          <span>{dateLabel}</span>
          <span
            className={`session-stage-header__status status-pill status-${status}`}
          >
            {SESSION_STATUS_LABELS[status]}
          </span>
          {previousLabel && previousLabel !== "Date not set" ? (
            <span className="session-stage-header__previous">
              Previous session · {previousLabel}
            </span>
          ) : null}
        </div>
      </div>

      {actions ? (
        <div className="session-stage-header__actions">{actions}</div>
      ) : null}
    </header>
  );
}
