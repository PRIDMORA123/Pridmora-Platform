import type { ReactNode } from "react";
import { IdentityIntelligencePanel } from "@/components/identity-intelligence/identity-intelligence-panel";
import type {
  EvidenceStrength,
  IntelligenceReviewState,
} from "@/components/identity-intelligence/types";

export function IdentityObservation({
  title = "Observation",
  children,
  evidenceStrength = "emerging",
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
      level="observation"
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
