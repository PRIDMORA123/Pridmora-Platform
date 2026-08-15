"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EvidenceConfidencePanel } from "@/components/development-evidence/evidence-confidence-panel";
import { EvidenceGraphPanel } from "@/components/development-evidence/evidence-graph-panel";
import { EvidenceWhyDrawer } from "@/components/development-evidence/evidence-why-drawer";
import { apiJson, errorMessage } from "@/lib/api-client";
import {
  composeDevelopmentHeadlineIntelligence,
  limitSentences,
  limitToOneSentence,
} from "@/lib/development-evidence";
import type {
  DevelopmentHeadlineIntelligence,
  DevelopmentIntelligenceEvidenceView,
  EvidenceWhyThisPayload,
} from "@/lib/development-evidence";
import type { DevelopmentProfile } from "@/lib/development-updates/types";

export function DevelopmentIntelligenceEvidencePanel({
  clientId,
  profile = null,
  onOpenEvidence,
  voice = "person",
}: {
  clientId: string;
  /** Living development profile — authoritative after Apply when evidence library is empty. */
  profile?: DevelopmentProfile | null;
  onOpenEvidence?: () => void;
  /** Self voice softens copy for Manager My Development. */
  voice?: "person" | "self";
}) {
  const [evidenceView, setEvidenceView] =
    useState<DevelopmentIntelligenceEvidenceView | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [whyThis, setWhyThis] = useState<EvidenceWhyThisPayload | null>(null);
  const [supportingOpen, setSupportingOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiJson<{ view: DevelopmentIntelligenceEvidenceView }>(
        `/api/development-evidence/${clientId}/intelligence`
      );
      setEvidenceView(data.view);
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

  const view: DevelopmentHeadlineIntelligence | null = useMemo(() => {
    if (!evidenceView) return null;
    return composeDevelopmentHeadlineIntelligence({
      evidenceView,
      profile,
    });
  }, [evidenceView, profile]);

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
    return <p className="muted">Loading development intelligence…</p>;
  }

  if (error) {
    return (
      <div className="inline-error" role="alert">
        <p>{error}</p>
      </div>
    );
  }

  if (!view) return null;

  const isSelf = voice === "self";
  const fromProfile = view.headlineSource === "development_profile";
  const sourceNote = fromProfile
    ? isSelf
      ? "From your coaching conversations."
      : "From coaching conversations."
    : null;
  const hasCapabilityInsights = view.capabilities.length > 0;
  const hasProfilePatterns =
    !hasCapabilityInsights && view.profileBehaviouralPatterns.length > 0;
  const patternsHeading = hasCapabilityInsights
    ? "Capabilities & Behavioural Patterns"
    : hasProfilePatterns
      ? "Behavioural Patterns"
      : "Capabilities & Behavioural Patterns";
  const patternsPurpose = hasCapabilityInsights
    ? isSelf
      ? "What behaviours appear to be emerging or strengthening?"
      : "What management behaviours are emerging or strengthening?"
    : isSelf
      ? "What behavioural patterns are emerging or strengthening?"
      : "What behavioural patterns are emerging or strengthening?";

  return (
    <div className="development-intelligence-evidence">
      <p className="development-intelligence-evidence__question">
        {isSelf
          ? "What do we currently understand about your development?"
          : "What do we now understand about this person?"}
      </p>
      {sourceNote ? <p className="muted">{sourceNote}</p> : null}

      <section className="development-section development-section--story">
        <h2>Current Position</h2>
        <p className="development-section__purpose">
          {isSelf ? "Where are you now?" : "Where is this person now?"}
        </p>
        <p>{limitSentences(view.currentPosition, 3)}</p>
        {view.headlineSource === "evidence_library" ? (
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
        ) : null}
      </section>

      <section className="development-section development-section--story">
        <h2>Development Trajectory</h2>
        <p className="development-section__purpose">
          {isSelf
            ? "What appears to be changing over time?"
            : "How have they changed over time?"}
        </p>
        <p>{limitSentences(view.developmentTrajectory, 3)}</p>
      </section>

      <section className="development-section development-section--story">
        <h2>Current Priorities</h2>
        <p className="development-section__purpose">
          {isSelf
            ? "Where would further development help?"
            : "Where would further development help?"}
        </p>
        {view.developmentPriorities.length === 0 ? (
          <p className="muted">No reviewed development priorities yet.</p>
        ) : (
          <ul className="development-evidence-list">
            {view.developmentPriorities.slice(0, 3).map(item => (
              <li key={item}>{limitToOneSentence(item)}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="development-section development-section--story">
        <h2>{patternsHeading}</h2>
        <p className="development-section__purpose">{patternsPurpose}</p>
        {hasCapabilityInsights ? (
          <ul className="capability-insight-list">
            {view.capabilities.map(capability => (
              <li key={capability.capabilityKey} className="capability-insight-card">
                <div className="capability-insight-card__header">
                  <h3>{capability.capabilityLabel}</h3>
                </div>
                <dl className="capability-insight-card__labels">
                  <div>
                    <dt>Evidence Confidence</dt>
                    <dd>{capability.confidence.label}</dd>
                  </div>
                  <div>
                    <dt>Direction</dt>
                    <dd>{capability.trend.replaceAll("_", " ")}</dd>
                  </div>
                </dl>
                <p>{limitSentences(capability.currentEvidence, 2)}</p>
                {capability.developmentOpportunity ? (
                  <p className="muted">
                    {limitToOneSentence(capability.developmentOpportunity)}
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
        ) : hasProfilePatterns ? (
          <ul className="development-evidence-list">
            {view.profileBehaviouralPatterns.map(item => (
              <li key={item}>{limitToOneSentence(item)}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            {isSelf
              ? "Limited evidence is available for behavioural patterns yet."
              : "Limited evidence is available for capability insights."}
          </p>
        )}
      </section>

      <section className="development-section development-section--story">
        <h2>
          {isSelf ? "Emerging strengths" : "Strengths Being Demonstrated"}
        </h2>
        <p className="development-section__purpose">
          {isSelf
            ? "What positive behaviours are evidenced so far?"
            : "What positive behaviours are evidenced?"}
        </p>
        {view.strengthsBeingDemonstrated.length === 0 ? (
          <p className="muted">
            {isSelf
              ? "No reviewed strength signals yet — add reflections or evidence to build this picture."
              : "No reviewed strength signals yet."}
          </p>
        ) : (
          <ul className="development-evidence-list">
            {view.strengthsBeingDemonstrated.map(item => (
              <li key={item}>{limitToOneSentence(item)}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="development-section development-section--story">
        <h2>
          {isSelf ? "Areas worth exploring" : "Next Development Focus"}
        </h2>
        <p className="development-section__purpose">
          What would be valuable to explore next?
        </p>
        <p>{limitSentences(view.nextDevelopmentFocus, 2)}</p>
      </section>

      <details
        className="supporting-evidence-disclosure"
        open={supportingOpen}
        onToggle={event =>
          setSupportingOpen((event.target as HTMLDetailsElement).open)
        }
      >
        <summary className="supporting-evidence-disclosure__summary">
          <span aria-hidden="true">{supportingOpen ? "▼" : "▶"}</span>
          Supporting Evidence
        </summary>
        <div className="supporting-evidence-disclosure__body">
          <EvidenceConfidencePanel
            confidence={view.evidenceConfidence}
            coverage={view.evidenceCoverage}
          />

          <section className="development-section">
            <h3>Recent Development Evidence</h3>
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
            <h3>Contradictory / Limited Evidence</h3>
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

          <EvidenceGraphPanel nodes={view.graph} />

          {onOpenEvidence ? (
            <div className="button-row">
              <button
                type="button"
                className="secondary"
                onClick={onOpenEvidence}
              >
                + Add Development Evidence
              </button>
            </div>
          ) : null}
        </div>
      </details>

      <EvidenceWhyDrawer
        open={Boolean(whyThis)}
        payload={whyThis}
        onClose={() => setWhyThis(null)}
      />
    </div>
  );
}
