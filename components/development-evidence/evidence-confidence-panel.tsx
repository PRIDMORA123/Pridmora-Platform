"use client";

import type {
  EvidenceConfidenceResult,
  EvidenceCoverageResult,
} from "@/lib/development-evidence";

export function EvidenceConfidencePanel({
  confidence,
  coverage,
}: {
  confidence: EvidenceConfidenceResult;
  coverage: EvidenceCoverageResult;
}) {
  return (
    <div className="evidence-trust-grid">
      <article className="evidence-trust-card">
        <p className="card-label">Evidence Confidence</p>
        <p className="development-section__purpose">
          How strongly does the available evidence support these interpretations?
        </p>
        <p className="evidence-trust-card__level">{confidence.label}</p>
        <p className="muted">
          <strong>Why this confidence level?</strong> {confidence.basis}
        </p>
        <p className="evidence-trust-card__meta muted">
          Confidence belongs to the evidence behind an interpretation — not a
          manager, capability, performance or personality score.
        </p>
      </article>
      <article className="evidence-trust-card">
        <p className="card-label">Evidence Coverage</p>
        <p className="development-section__purpose">
          How broad is the available evidence base?
        </p>
        <p className="evidence-trust-card__level">{coverage.label}</p>
        <p className="muted">{coverage.summary}</p>
        {coverage.representedLabels.length > 0 ? (
          <p className="evidence-trust-card__meta">
            Represented evidence: {coverage.representedLabels.join(", ")}
          </p>
        ) : null}
        {coverage.notRepresentedLabels.length > 0 ? (
          <p className="evidence-trust-card__meta">
            Not represented:{" "}
            {coverage.notRepresentedLabels.slice(0, 4).join(", ")}
            {coverage.notRepresentedLabels.length > 4 ? "…" : ""}
          </p>
        ) : null}
        <p className="evidence-trust-card__meta muted">
          Managers do not need every evidence type for useful intelligence.
        </p>
      </article>
    </div>
  );
}
