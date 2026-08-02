export type { EvidenceStrength, IntelligenceLevel, IntelligenceReviewState } from "@/components/identity-intelligence/types";
export {
  EVIDENCE_STRENGTH_LABELS,
  REVIEW_STATE_LABELS,
} from "@/components/identity-intelligence/types";
export {
  IdentityIntelligencePanel,
  type IdentityIntelligencePanelProps,
} from "@/components/identity-intelligence/identity-intelligence-panel";
/** Alias — visible product brand: Pridmora Intelligence. Legacy name retained. */
export { IdentityIntelligencePanel as PridmoraIntelligencePanel } from "@/components/identity-intelligence/identity-intelligence-panel";
export { IdentityObservation } from "@/components/identity-intelligence/identity-observation";
export { IdentityInsight } from "@/components/identity-intelligence/identity-insight";
export { IdentityPattern } from "@/components/identity-intelligence/identity-pattern";
export { IdentityEvidenceStrength } from "@/components/identity-intelligence/identity-evidence-strength";
export {
  IdentityEvidenceList,
  evidenceTypeLabel,
  formatEvidenceDateLabel,
  dedupeEvidenceItems,
  type IdentityEvidenceItem,
} from "@/components/identity-intelligence/identity-evidence-list";
export { PatternReviewPanel } from "@/components/identity-intelligence/pattern-review-panel";
export { IdentityIntelligenceActions } from "@/components/identity-intelligence/identity-intelligence-actions";
export { IdentityReviewStateLabel } from "@/components/identity-intelligence/identity-review-state";
export {
  IdentityApprovedRecord,
  type IdentityApprovedRecordProps,
} from "@/components/identity-intelligence/identity-approved-record";
export {
  IdentityCoachContent,
  type CoachContentKind,
  type IdentityCoachContentProps,
} from "@/components/identity-intelligence/identity-coach-content";
