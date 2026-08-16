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
  /** Optional maturity label override (e.g. Emerging / Strengthening / Established). */
  strengthLabel?: string;
  evidenceLabel?: string;
  reviewState?: IntelligenceReviewState;
  /** Optional review-state label override (e.g. Awaiting review). */
  reviewLabel?: string;
  /** When false, hide the level word (Observation / Insight / Pattern). */
  showLevelLabel?: boolean;
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
  strengthLabel,
  evidenceLabel,
  reviewState,
  reviewLabel,
  showLevelLabel = true,
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
            {showLevelLabel ? <span>{levelLabel}</span> : null}
            {evidenceStrength ? (
              <IdentityEvidenceStrength
                strength={evidenceStrength}
                label={strengthLabel}
              />
            ) : strengthLabel ? (
              <span className="identity-evidence-strength">{strengthLabel}</span>
            ) : null}
          </div>
        </div>

        {reviewState ? (
          <IdentityReviewStateLabel state={reviewState} label={reviewLabel} />
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
