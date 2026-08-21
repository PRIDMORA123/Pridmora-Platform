"use client";

import { useCallback, useEffect, useState } from "react";
import { IdentityBackLink } from "@/components/identity";
import {
  AURELIA_WORKING_DETAIL,
  AURELIA_WORKING_TITLE,
  IdentityProcessingState,
} from "@/components/identity/identity-processing-state";
import { DevelopmentIntelligenceEvidencePanel } from "@/components/development-evidence/development-intelligence-evidence-panel";
import { MyDevelopmentSubnav } from "@/components/my-development-subnav";
import { apiJson, errorMessage } from "@/lib/api-client";
import type { MyDevelopmentWorkspace } from "@/lib/my-development/workspace";
import type { DevelopmentProfile } from "@/lib/development-updates/types";
import type { Client } from "@/lib/types";

/**
 * Manager's own Development Intelligence — synthesis from the current
 * organisation self-development record only.
 */
export function MyDevelopmentIntelligenceView({
  client,
  onBack,
  onOpenEvidence,
  onOpenReflection,
}: {
  client: Client;
  onBack: () => void;
  onOpenEvidence: () => void;
  onOpenReflection?: () => void;
}) {
  const [workspace, setWorkspace] = useState<MyDevelopmentWorkspace | null>(
    null
  );
  const [profile, setProfile] = useState<DevelopmentProfile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [workspaceData, profileData] = await Promise.all([
        apiJson<{ workspace: MyDevelopmentWorkspace }>(
          "/api/my-development/workspace"
        ),
        apiJson<{
          profile?: DevelopmentProfile;
        }>(`/api/development-profiles/${client.id}`).catch(() => ({
          profile: undefined,
        })),
      ]);
      setWorkspace(workspaceData.workspace);
      setProfile(profileData.profile ?? null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load development intelligence."));
    } finally {
      setLoading(false);
    }
  }, [client.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const maturity = workspace?.maturity;

  return (
    <section className="page identity-reveal">
      <IdentityBackLink onClick={onBack}>Back to My development</IdentityBackLink>

      <div className="page-heading">
        <p className="eyebrow">My development</p>
        <h1>Development Intelligence</h1>
        <p>
          Why Aurelia thinks this — patterns, confidence and sources from your
          authorised development record, separate from people you manage.
        </p>
      </div>

      <MyDevelopmentSubnav
        active="intelligence"
        onOpenOverview={onBack}
        onOpenReflection={() => onOpenReflection?.()}
        onOpenEvidence={onOpenEvidence}
        onOpenIntelligence={() => undefined}
      />

      {error ? (
        <div className="inline-error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {loading ? (
        <IdentityProcessingState
          title={AURELIA_WORKING_TITLE}
          description={AURELIA_WORKING_DETAIL}
        />
      ) : null}

      {maturity ? (
        <section className="panel" style={{ marginBottom: "1.25rem" }}>
          <p className="card-label">Evidence before certainty</p>
          <h2 className="identity-subheading">{maturity.headline}</h2>
          <p className="muted">{maturity.supportCopy}</p>
          <p className="muted">
            Confidence: {maturity.confidenceLabel}
            {maturity.includedSourceCount > 0
              ? ` · Currently based on ${maturity.includedSourceCount} source${
                  maturity.includedSourceCount === 1 ? "" : "s"
                }.`
              : null}
          </p>
        </section>
      ) : null}

      {workspace && workspace.intelligencePatterns.length > 0 ? (
        <section className="panel" style={{ marginBottom: "1.25rem" }}>
          <p className="card-label">Recognised patterns</p>
          <h2 className="identity-subheading">Emerging and recurring themes</h2>
          <p className="muted">
            Themes are surfaced only when they appear across more than one
            reflection. A single reflection is never treated as a conclusion.
          </p>
          <ul className="development-evidence-list">
            {workspace.intelligencePatterns.map(pattern => (
              <li key={`${pattern.theme}-${pattern.patternKind}`}>
                {pattern.statement}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="button-row" style={{ marginBottom: "1.25rem" }}>
        <button type="button" className="secondary" onClick={onOpenEvidence}>
          View development evidence
        </button>
        {onOpenReflection ? (
          <button type="button" className="secondary" onClick={onOpenReflection}>
            Reflect on my development
          </button>
        ) : null}
      </div>

      <DevelopmentIntelligenceEvidencePanel
        clientId={client.id}
        profile={profile}
        onOpenEvidence={onOpenEvidence}
        voice="self"
      />
    </section>
  );
}
