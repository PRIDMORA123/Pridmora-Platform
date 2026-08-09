"use client";

import { ArrowLeft } from "lucide-react";
import type { Client } from "@/lib/types";
import { ClientWorkspaceTabs, type ClientWorkspaceTab } from "@/components/client-workspace-tabs";
import {
  ClientIdentityHeader,
  IdentityEmptyState,
  IdentitySection,
  IdentityStatus,
} from "@/components/identity";
import { coachingStatusLabel } from "@/lib/identity-journey-path";
import { identityEmptyStates } from "@/lib/identity-language";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import { resolveProductLanguage } from "@/lib/role-language";

export function PersonActionsView({
  client,
  onBack,
  onTabChange,
}: {
  client: Client;
  onBack: () => void;
  onTabChange?: (tab: ClientWorkspaceTab) => void;
}) {
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);
  const actions = client.actions;

  return (
    <section className="page identity-reveal">
      <button type="button" className="back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden /> Back to Current Position
      </button>

      {onTabChange ? (
        <ClientWorkspaceTabs active="history" onChange={onTabChange} />
      ) : null}

      <ClientIdentityHeader
        client={client}
        journeyStage={coachingStatusLabel(client)}
        developmentFocus={client.currentFocus.trim() || null}
      />

      <IdentitySection
        title="Commitments"
        description={`Outstanding and recent commitments linked to this ${language.relationshipSingular}.`}
      >
        {actions.length === 0 ? (
          <IdentityEmptyState
            title={identityEmptyStates.noCommitments.title}
            description="Commitments agreed in development conversations will appear here for follow-up."
          />
        ) : (
          <div className="action-list">
            {actions.map(action => (
              <div key={action.id} className="action-row">
                <div className="grow">
                  <strong>{action.title}</strong>
                  <small>
                    {action.status}
                    {action.due ? ` · due ${action.due}` : ""}
                    {action.owner ? ` · ${action.owner}` : ""}
                  </small>
                  {action.notes ? <p className="muted">{action.notes}</p> : null}
                </div>
                <IdentityStatus
                  tone={
                    action.status === "Complete"
                      ? "success"
                      : action.status === "In progress"
                        ? "info"
                        : "neutral"
                  }
                >
                  {action.status}
                </IdentityStatus>
              </div>
            ))}
          </div>
        )}
      </IdentitySection>
    </section>
  );
}
