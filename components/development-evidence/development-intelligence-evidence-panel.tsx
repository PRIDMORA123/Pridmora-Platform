"use client";

import { useCallback, useEffect, useState } from "react";
import { EvidenceConfidencePanel } from "@/components/development-evidence/evidence-confidence-panel";
import { EvidenceGraphPanel } from "@/components/development-evidence/evidence-graph-panel";
import { EvidenceWhyDrawer } from "@/components/development-evidence/evidence-why-drawer";
import { apiJson, errorMessage } from "@/lib/api-client";
import type {
  DevelopmentIntelligenceEvidenceView,
  EvidenceWhyThisPayload,
} from "@/lib/development-evidence";

export function DevelopmentIntelligenceEvidencePanel({
  clientId,
  onOpenEvidence,
}: {
  clientId: string;
  onOpenEvidence?: () => void;
}) {
  const [view, setView] = useState<DevelopmentIntelligenceEvidenceView | null>(
    null
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [whyThis, setWhyThis] = useState<EvidenceWhyThisPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiJson<{ view: DevelopmentIntelligenceEvidenceView }>(
        `/api/development-evidence/${clientId}/intelligence`
      );
      setView(data.view);
    } catch (err) {
      setError(
        errorMessage(err, "Unable to load evidence-informed intelligence.")
      );
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openWhyThis(insight: string, evidenceIds: string[]) {
    try {
      const params = new URLSearchParams({
        insight,
        evidenceIds: evidenceIds.join(","),
      });
      const data = await apiJson<{ whyThis: EvidenceWhyThisPayload }>(
        `/api/development-evidence/${clientId}/intelligence?${params}`
      );
      setWhyThis(data.whyThis);
    } catch (err) {
      setError(errorMessage(err, "Unable to open evidence explanation."));
    }
  }

  if (loading) {
    return <p className="muted">Loading evidence intelligence…</p>;
  }

  if (error) {
    return (
      <div className="inline-error" role="alert">
        <p>{error}</p>
      </div>
    );
  }

  if (!view) return null;

  return (
    <div className="development-intelligence-evidence">
      <section className="development-section">
        <h2>Current Position</h2>
        <p className="development-section__purpose">Where is this person now?</p>
        <p>{view.currentPosition}</p>
        <button
          type="button"
          className="identity-text-action"
          onClick={() =>
            void openWhyThis(
              "Current position",
              view.recentEvidence.map(item => item.id)
            )
          }
        >
          Why this?
        </button>
      </section>

      <section className="development-section">
        <h2>Development Trajectory</h2>
        <p className="development-section__purpose">
          How have they changed over time?
        </p>
        <p>{view.developmentTrajectory}</p>
      </section>

      <section className="development-section">
        <h2>Capabilities &amp; Behavioural Patterns</h2>
        <p className="development-section__purpose">
          What management behaviours are emerging or strengthening?
        </p>
        {view.capabilities.length === 0 ? (
          <p className="muted">
            Limited evidence is available for capability insights.
          </p>
        ) : (
          <ul className="capability-insight-list">
            {view.capabilities.map(capability => (
              <li key={capability.capabilityKey} className="capability-insight-card">
                <div className="capability-insight-card__header">
                  <h3>{capability.capabilityLabel}</h3>
                  <span className="muted">
                    {capability.confidence.label} · {capability.trend.replaceAll("_", " ")}
                  </span>
                </div>
                <p>{capability.currentEvidence}</p>
                {capability.organisationFrameworkLabels.length > 0 ? (
                  <p className="muted">
                    Organisation framework alignment:{" "}
                    {capability.organisationFrameworkLabels.join(", ")}
                  </p>
                ) : null}
                {capability.developmentOpportunity ? (
                  <p className="muted">
                    Development opportunity: {capability.developmentOpportunity}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="identity-text-action"
                  onClick={() =>
                    void openWhyThis(
                      capability.capabilityLabel,
                      capability.supportingEvidenceIds
                    )
                  }
                >
                  Why this?
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="development-section">
        <h2>Strengths Being Demonstrated</h2>
        <p className="development-section__purpose">
          What evidence supports them?
        </p>
        {view.strengthsBeingDemonstrated.length === 0 ? (
          <p className="muted">No reviewed strength signals yet.</p>
        ) : (
          <ul className="development-evidence-list">
            {view.strengthsBeingDemonstrated.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="development-section">
        <h2>Development Priorities</h2>
        <p className="development-section__purpose">
          Where would further development help?
        </p>
        {view.developmentPriorities.length === 0 ? (
          <p className="muted">No reviewed development priorities yet.</p>
        ) : (
          <ul className="development-evidence-list">
            {view.developmentPriorities.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>

      <EvidenceConfidencePanel
        confidence={view.evidenceConfidence}
        coverage={view.evidenceCoverage}
      />

      <section className="development-section">
        <h2>Recent Development Evidence</h2>
        <p className="development-section__purpose">
          What has contributed recently?
        </p>
        {view.recentEvidence.length === 0 ? (
          <p className="muted">Not enough evidence yet.</p>
        ) : (
          <ul className="development-evidence-list">
            {view.recentEvidence.map(item => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <span className="muted">
                  {" "}
                  — {item.evidenceTypeLabel} · {item.freshnessLabel}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="development-section">
        <h2>Contradictory / Limited Evidence</h2>
        <p className="development-section__purpose">
          What should not yet be over-interpreted?
        </p>
        {view.missingOrConflicting.length === 0 ? (
          <p className="muted">No major gaps or conflicts identified.</p>
        ) : (
          <ul className="development-evidence-list">
            {view.missingOrConflicting.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="development-section">
        <h2>Next Development Focus</h2>
        <p className="development-section__purpose">
          What would be valuable to explore next?
        </p>
        <p>{view.nextDevelopmentFocus}</p>
      </section>

      <EvidenceGraphPanel nodes={view.graph} />

      {onOpenEvidence ? (
        <div className="button-row">
          <button type="button" className="secondary" onClick={onOpenEvidence}>
            Open Development Evidence
          </button>
        </div>
      ) : null}

      <EvidenceWhyDrawer
        open={Boolean(whyThis)}
        payload={whyThis}
        onClose={() => setWhyThis(null)}
      />
    </div>
  );
}
