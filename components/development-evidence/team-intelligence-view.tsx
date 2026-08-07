"use client";

import { useCallback, useEffect, useState } from "react";
import { IdentityBackLink } from "@/components/identity";
import { EvidenceConfidencePanel } from "@/components/development-evidence/evidence-confidence-panel";
import { apiJson, errorMessage } from "@/lib/api-client";
import type { TeamIntelligenceView as TeamView } from "@/lib/development-evidence";

export function TeamIntelligenceView({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<TeamView | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiJson<{ view: TeamView }>(`/api/team-intelligence`);
      setView(data.view);
    } catch (err) {
      setError(errorMessage(err, "Unable to load team intelligence."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="page identity-reveal">
      <IdentityBackLink onClick={onBack}>Back to My Development</IdentityBackLink>
      <div className="page-heading">
        <p className="eyebrow">Team Intelligence</p>
        <h1>Team Intelligence</h1>
        <p>
          What is strengthening across your team, where challenges recur, and
          where evidence is strong or limited. People are not ranked and
          confidential content is never shown.
        </p>
      </div>

      {loading ? <p className="muted">Loading team intelligence…</p> : null}
      {error ? (
        <div className="inline-error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {view ? (
        <>
          <EvidenceConfidencePanel
            confidence={view.aggregatedConfidence}
            coverage={{
              level: "developing",
              label: "Developing",
              represented: [],
              representedLabels: [],
              notRepresented: [],
              notRepresentedLabels: view.limitedEvidenceAreas,
              summary: `${view.contributingRelationshipCount} contributing relationships`,
            }}
          />

          <section className="panel" style={{ marginTop: "1.5rem" }}>
            <h2 className="identity-subheading">What is strengthening across my team?</h2>
            {view.strengtheningCapabilities.length === 0 ? (
              <p className="muted">Not enough evidence yet.</p>
            ) : (
              <ul className="development-evidence-list">
                {view.strengtheningCapabilities.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2 className="identity-subheading">What challenges recur?</h2>
            {view.recurringThemes.length === 0 ? (
              <p className="muted">No recurring themes identified yet.</p>
            ) : (
              <ul className="development-evidence-list">
                {view.recurringThemes.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2 className="identity-subheading">
              What management capabilities appear to need development?
            </h2>
            {view.improvingBehaviours.length === 0 ? (
              <p className="muted">No aggregated behaviour signals yet.</p>
            ) : (
              <ul className="development-evidence-list">
                {view.improvingBehaviours.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2 className="identity-subheading">Where is evidence limited?</h2>
            <ul className="development-evidence-list">
              {view.limitedEvidenceAreas.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h2 className="identity-subheading">What should I pay attention to?</h2>
            <ul className="development-evidence-list">
              {view.conversationsNeedingAttention.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h2 className="identity-subheading">Strengths that could be shared</h2>
            {view.shareableStrengths.length === 0 ? (
              <p className="muted">No shareable strengths identified yet.</p>
            ) : (
              <ul className="development-evidence-list">
                {view.shareableStrengths.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>

          <p className="muted">{view.privacyNote}</p>
        </>
      ) : null}
    </section>
  );
}
