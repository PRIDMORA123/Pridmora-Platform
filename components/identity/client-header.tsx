"use client";

import { useState } from "react";
import { apiJson } from "@/lib/api-client";
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

type PrivateIdentityPayload = {
  realName: string;
  email: string;
  phone: string;
  privateNotes: string;
  updatedAt?: string;
};

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

  const [privateOpen, setPrivateOpen] = useState(false);
  const [privateBusy, setPrivateBusy] = useState(false);
  const [privateError, setPrivateError] = useState("");
  const [privateIdentity, setPrivateIdentity] =
    useState<PrivateIdentityPayload | null>(null);

  async function loadPrivateIdentity() {
    if (!client?.id || privateBusy) return;
    setPrivateBusy(true);
    setPrivateError("");
    try {
      const data = await apiJson<{ privateIdentity: PrivateIdentityPayload | null }>(
        `/api/clients/${encodeURIComponent(client.id)}/private-identity`,
        { method: "GET" }
      );
      setPrivateIdentity(data.privateIdentity);
      setPrivateOpen(true);
    } catch (error) {
      setPrivateError(
        error instanceof Error
          ? error.message
          : "Unable to load private identity."
      );
      setPrivateOpen(true);
    } finally {
      setPrivateBusy(false);
    }
  }

  function hidePrivateIdentity() {
    setPrivateOpen(false);
    setPrivateIdentity(null);
    setPrivateError("");
  }

  return (
    <section
      className={`client-identity-header client-identity-header--compact${
        showSummary ? "" : " client-identity-header-simple"
      }`}
    >
      <div className="client-identity-primary">
        <p className="client-identity-eyebrow">
          {isConfidential ? "Confidential relationship" : "Coaching relationship"}
        </p>

        {isConfidential && resolved.confidentialReference ? (
          <p className="client-identity-reference">{resolved.confidentialReference}</p>
        ) : null}

        <h1 className="client-identity-name">{resolved.displayName}</h1>

        {meta ? <p className="client-identity-role">{meta}</p> : null}

        {sessionParts.length ? (
          <p className="client-identity-session">{sessionParts.join(" · ")}</p>
        ) : null}

        {isConfidential && client?.id ? (
          <div className="client-identity-private-controls">
            {!privateOpen ? (
              <button
                type="button"
                className="secondary"
                disabled={privateBusy}
                onClick={() => {
                  void loadPrivateIdentity();
                }}
              >
                {privateBusy ? "Loading…" : "View private identity"}
              </button>
            ) : (
              <div className="client-identity-private-panel">
                <div className="client-identity-private-panel-header">
                  <p className="client-identity-private-title">Private identity</p>
                  <button type="button" className="secondary" onClick={hidePrivateIdentity}>
                    Hide
                  </button>
                </div>
                {privateError ? (
                  <p className="dialog-error" role="alert">
                    {privateError}
                  </p>
                ) : privateIdentity ? (
                  <dl className="client-identity-private-fields">
                    <div>
                      <dt>Real name</dt>
                      <dd>{privateIdentity.realName || "Not recorded"}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{privateIdentity.email || "Not recorded"}</dd>
                    </div>
                    <div>
                      <dt>Phone</dt>
                      <dd>{privateIdentity.phone || "Not recorded"}</dd>
                    </div>
                    <div>
                      <dt>Private note</dt>
                      <dd>{privateIdentity.privateNotes || "Not recorded"}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="client-identity-private-empty">
                    No private identity details have been stored for this relationship.
                  </p>
                )}
              </div>
            )}
          </div>
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
