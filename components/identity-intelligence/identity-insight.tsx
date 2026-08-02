import type { ReactNode } from "react";
import { IdentityIntelligencePanel } from "@/components/identity-intelligence/identity-intelligence-panel";
import type {
  EvidenceStrength,
  IntelligenceReviewState,
} from "@/components/identity-intelligence/types";

export function IdentityInsight({
  title = "Insight",
  children,
  evidenceStrength = "supported",
  evidenceLabel,
  reviewState = "draft",
  onViewEvidence,
  actions,
  compact,
}: {
  title?: string;
  children: ReactNode;
  evidenceStrength?: EvidenceStrength;
  evidenceLabel?: string;
  reviewState?: IntelligenceReviewState;
  onViewEvidence?: () => void;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <IdentityIntelligencePanel
      level="insight"
      title={title}
      evidenceStrength={evidenceStrength}
      evidenceLabel={evidenceLabel}
      reviewState={reviewState}
      onViewEvidence={onViewEvidence}
      actions={actions}
      compact={compact}
    >
      {children}
    </IdentityIntelligencePanel>
  );
}
