"use client";

import { useCallback, useEffect, useState } from "react";
import { IdentityBackLink } from "@/components/identity";
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
  const [profileStrengths, setProfileStrengths] = useState<string[]>([]);
  const [profileThemes, setProfileThemes] = useState<string[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
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

      const strengths = (profileData.profile?.strengths ?? [])
        .map(item => item.value.trim())
        .filter(Boolean);
      const themes = (profileData.profile?.emergingThemes ?? [])
        .map(item => item.value.trim())
        .filter(Boolean);
      setProfileStrengths(strengths);
      setProfileThemes(themes);
    } catch (err) {
      setError(errorMessage(err, "Unable to load development intelligence."));
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
          Synthesis from your reflections, actions and evidence in this
          workspace — separate from people you manage.
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
          <p className="card-label">From your reflections</p>
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

      {profileStrengths.length > 0 ? (
        <section className="panel" style={{ marginBottom: "1.25rem" }}>
          <p className="card-label">Strengths</p>
          <h2 className="identity-subheading">Evidenced strengths</h2>
          <ul className="development-evidence-list">
            {profileStrengths.slice(0, 6).map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {profileThemes.length > 0 ? (
        <section className="panel" style={{ marginBottom: "1.25rem" }}>
          <p className="card-label">Development themes</p>
          <h2 className="identity-subheading">Themes from your profile</h2>
          <ul className="development-evidence-list">
            {profileThemes.slice(0, 6).map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {workspace && workspace.actions.length > 0 ? (
        <section className="panel" style={{ marginBottom: "1.25rem" }}>
          <p className="card-label">Actions / progress</p>
          <h2 className="identity-subheading">Current actions</h2>
          <ul className="development-evidence-list">
            {workspace.actions.slice(0, 6).map(action => (
              <li key={action.id}>
                <strong>{action.title}</strong>
                <span className="muted"> — {action.status}</span>
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
