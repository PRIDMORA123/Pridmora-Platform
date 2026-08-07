"use client";

import { relationshipPublicIdentity } from "@/lib/relationship-identity";
import type { Client } from "@/lib/types";

type ClientIdentityHeaderProps = {
  client: Pick<
    Client,
    | "id"
    | "name"
    | "role"
    | "organisation"
    | "identityMode"
    | "displayLabel"
    | "confidentialReference"
    | "aiNameAllowed"
  >;
  journeyStage?: string | null;
  developmentFocus?: string | null;
  latestConversationDate?: string | null;
  sessionLine?: string | null;
  sessionStatus?: string | null;
  showSummary?: boolean;
  actions?: React.ReactNode;
};

/**
 * Public relationship header only.
 * Confidential workspaces stay anonymous here — private identity is opened
 * deliberately from the coach overflow menu, never inline.
 */
export function ClientIdentityHeader({
  client,
  journeyStage,
  developmentFocus,
  latestConversationDate,
  sessionLine,
  sessionStatus,
  showSummary = false,
  actions,
}: ClientIdentityHeaderProps) {
  const resolved = relationshipPublicIdentity(client);
  const meta = [resolved.role, resolved.organisation].filter(Boolean).join(" · ");
  const sessionParts = [sessionLine, sessionStatus].filter(Boolean);
  const isConfidential = resolved.identityMode === "confidential";

  return (
    <section
      className={`client-identity-header client-identity-header--compact${
        showSummary ? "" : " client-identity-header-simple"
      }`}
    >
      <div className="client-identity-primary">
        <p className="client-identity-eyebrow">
          {isConfidential ? "Confidential relationship" : "Development relationship"}
        </p>

        {isConfidential && resolved.confidentialReference ? (
          <p className="client-identity-reference">{resolved.confidentialReference}</p>
        ) : null}

        <h1 className="client-identity-name">{resolved.displayName}</h1>

        {meta ? <p className="client-identity-role">{meta}</p> : null}

        {sessionParts.length ? (
          <p className="client-identity-session">{sessionParts.join(" · ")}</p>
        ) : null}
      </div>

      {showSummary ? (
        <dl className="client-identity-summary">
          <HeaderDetail
            label="Current stage"
            value={journeyStage || "Coaching relationship established"}
          />
          <HeaderDetail
            label="Current focus"
            value={developmentFocus || "Not recorded yet"}
          />
          <HeaderDetail
            label="Latest conversation"
            value={latestConversationDate || "No conversation yet"}
          />
        </dl>
      ) : null}

      {actions ? (
        <div className="client-identity-actions">{actions}</div>
      ) : null}
    </section>
  );
}

function HeaderDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="client-identity-detail">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
