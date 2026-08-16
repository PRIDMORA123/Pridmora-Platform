import type { ReactNode } from "react";
import { IdentityIntelligencePanel } from "@/components/identity-intelligence/identity-intelligence-panel";
import type {
  EvidenceStrength,
  IntelligenceReviewState,
} from "@/components/identity-intelligence/types";

export function IdentityPattern({
  title = "Pattern",
  children,
  evidenceStrength = "established",
  strengthLabel,
  evidenceLabel,
  reviewState = "draft",
  reviewLabel,
  showLevelLabel = true,
  onViewEvidence,
  actions,
  compact,
}: {
  title?: string;
  children: ReactNode;
  evidenceStrength?: EvidenceStrength;
  strengthLabel?: string;
  evidenceLabel?: string;
  reviewState?: IntelligenceReviewState;
  reviewLabel?: string;
  showLevelLabel?: boolean;
  onViewEvidence?: () => void;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <IdentityIntelligencePanel
      level="pattern"
      title={title}
      evidenceStrength={evidenceStrength}
      strengthLabel={strengthLabel}
      evidenceLabel={evidenceLabel}
      reviewState={reviewState}
      reviewLabel={reviewLabel}
      showLevelLabel={showLevelLabel}
      onViewEvidence={onViewEvidence}
      actions={actions}
      compact={compact}
    >
      {children}
    </IdentityIntelligencePanel>
  );
}
