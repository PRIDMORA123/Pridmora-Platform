"use client";

import { IdentityBackLink } from "@/components/identity";
import { DevelopmentIntelligenceEvidencePanel } from "@/components/development-evidence/development-intelligence-evidence-panel";
import type { Client } from "@/lib/types";

/**
 * Manager's own Development Intelligence — built only from their
 * self-development evidence in the current organisation.
 */
export function MyDevelopmentIntelligenceView({
  client,
  onBack,
  onOpenEvidence,
}: {
  client: Client;
  onBack: () => void;
  onOpenEvidence: () => void;
}) {
  return (
    <section className="page identity-reveal">
      <IdentityBackLink onClick={onBack}>Back to My development</IdentityBackLink>

      <div className="page-heading">
        <p className="eyebrow">My development</p>
        <h1>Development Intelligence</h1>
        <p>
          What your approved development evidence currently supports about your
          own development — separate from people you manage.
        </p>
      </div>

      <div className="button-row" style={{ marginBottom: "1.25rem" }}>
        <button type="button" className="secondary" onClick={onOpenEvidence}>
          View development evidence
        </button>
      </div>

      <DevelopmentIntelligenceEvidencePanel
        clientId={client.id}
        onOpenEvidence={onOpenEvidence}
      />
    </section>
  );
}
