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
  const libraryEmpty = confidence.independentSourceCount === 0;

  return (
    <div className="evidence-trust-grid">
      <article className="evidence-trust-card">
        <p className="card-label">Evidence Confidence</p>
        <p className="development-section__purpose">
          How strongly do included Development Evidence items support these
          interpretations?
        </p>
        <p className="evidence-trust-card__level">{confidence.label}</p>
        <p className="muted">
          <strong>Why this confidence level?</strong> {confidence.basis}
        </p>
        <p className="evidence-trust-card__meta muted">
          Confidence belongs to reviewed Development Evidence items included in
          intelligence — not a manager, capability, performance or personality
          score, and not the living coaching record on its own.
        </p>
      </article>
      <article className="evidence-trust-card">
        <p className="card-label">Evidence Coverage</p>
        <p className="development-section__purpose">
          How broad is the included Development Evidence base?
        </p>
        <p className="evidence-trust-card__level">{coverage.label}</p>
        <p className="muted">{coverage.summary}</p>
        {coverage.representedLabels.length > 0 ? (
          <p className="evidence-trust-card__meta">
            Represented Development Evidence types:{" "}
            {coverage.representedLabels.join(", ")}
          </p>
        ) : null}
        {coverage.notRepresentedLabels.length > 0 ? (
          <p className="evidence-trust-card__meta">
            {libraryEmpty
              ? "No Development Evidence types are represented yet"
              : "Not represented in Development Evidence"}
            : {coverage.notRepresentedLabels.slice(0, 4).join(", ")}
            {coverage.notRepresentedLabels.length > 4 ? "…" : ""}
          </p>
        ) : null}
        <p className="evidence-trust-card__meta muted">
          These categories refer to added Development Evidence items, not
          coaching conversations or the living development profile on their own.
          Managers do not need every evidence type for useful intelligence.
        </p>
      </article>
    </div>
  );
}
