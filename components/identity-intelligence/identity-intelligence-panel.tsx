"use client";

import { useId, type ReactNode } from "react";
import { IdentityEvidenceStrength } from "@/components/identity-intelligence/identity-evidence-strength";
import { IdentityReviewStateLabel } from "@/components/identity-intelligence/identity-review-state";
import type {
  EvidenceStrength,
  IntelligenceLevel,
  IntelligenceReviewState,
} from "@/components/identity-intelligence/types";
import { BRAND } from "@/lib/brand";

const LEVEL_LABELS: Record<IntelligenceLevel, string> = {
  observation: "Observation",
  insight: "Insight",
  pattern: "Pattern",
};

export type IdentityIntelligencePanelProps = {
  level: IntelligenceLevel;
  title?: string;
  children: ReactNode;
  evidenceStrength?: EvidenceStrength;
  evidenceLabel?: string;
  reviewState?: IntelligenceReviewState;
  onViewEvidence?: () => void;
  actions?: ReactNode;
  compact?: boolean;
  className?: string;
};

export function IdentityIntelligencePanel({
  level,
  title,
  children,
  evidenceStrength,
  evidenceLabel,
  reviewState,
  onViewEvidence,
  actions,
  compact = false,
  className = "",
}: IdentityIntelligencePanelProps) {
  const headingId = useId();
  const levelLabel = LEVEL_LABELS[level];

  return (
    <section
      className={`identity-intelligence${compact ? " is-compact" : ""} ${className}`.trim()}
      data-level={level}
      data-review-state={reviewState}
      aria-labelledby={title ? headingId : undefined}
      aria-label={
        title ? undefined : `${BRAND.intelligenceName} ${levelLabel}`
      }
    >
      <header className="identity-intelligence__header">
        <div>
          <p className="identity-intelligence__signature">
            {BRAND.intelligenceName}
          </p>

          <div className="identity-intelligence__classification">
            <span>{levelLabel}</span>
            {evidenceStrength ? (
              <IdentityEvidenceStrength strength={evidenceStrength} />
            ) : null}
          </div>
        </div>

        {reviewState ? (
          <IdentityReviewStateLabel state={reviewState} />
        ) : null}
      </header>

      <div className="identity-intelligence__content">
        {title ? <h3 id={headingId}>{title}</h3> : null}
        {children}
      </div>

      {evidenceLabel || onViewEvidence || actions ? (
        <footer className="identity-intelligence__footer">
          <div>
            {evidenceLabel ? (
              <p className="identity-intelligence__evidence">{evidenceLabel}</p>
            ) : null}
            {onViewEvidence ? (
              <button
                type="button"
                className="identity-text-action"
                onClick={onViewEvidence}
              >
                View evidence
              </button>
            ) : null}
          </div>
          {actions ? (
            <div className="identity-intelligence__actions">{actions}</div>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}
