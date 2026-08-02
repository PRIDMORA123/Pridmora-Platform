export type IntelligenceLevel = "observation" | "insight" | "pattern";

export type EvidenceStrength = "emerging" | "supported" | "established";

export type IntelligenceReviewState =
  | "draft"
  | "reviewed"
  | "accepted"
  | "rejected";

export const EVIDENCE_STRENGTH_LABELS: Record<EvidenceStrength, string> = {
  emerging: "Emerging",
  supported: "Supported",
  established: "Established",
};

export const REVIEW_STATE_LABELS: Record<IntelligenceReviewState, string> = {
  draft: "Draft",
  reviewed: "Reviewed",
  accepted: "Accepted",
  rejected: "Rejected",
};
