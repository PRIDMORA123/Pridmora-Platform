import type { CoachingPattern } from "@/lib/patterns/types";

export const DEVELOPMENT_UPDATE_STATUSES = [
  "draft",
  "ready_for_review",
  "applied",
  "discarded",
  "failed",
] as const;

export type DevelopmentUpdateStatus = (typeof DEVELOPMENT_UPDATE_STATUSES)[number];

export const PROFILE_ENTRY_STATUSES = [
  "emerging",
  "supported",
  "well_established",
] as const;

export type ProfileEntryStatus = (typeof PROFILE_ENTRY_STATUSES)[number];

export type ProfileEntry = {
  id: string;
  value: string;
  status: ProfileEntryStatus;
  reason?: string;
};

export type CommitmentEntry = {
  id: string;
  value: string;
  dueDate: string | null;
  status: "open" | "complete";
};

export type FocusChange = {
  action: "replace";
  value: string;
  reason?: string;
};

export type ProfileItemChange = {
  id?: string;
  value: string;
  status?: ProfileEntryStatus;
  reason?: string;
};

export type CategoryChanges = {
  add?: ProfileItemChange[];
  update?: ProfileItemChange[];
  remove?: Array<{ id?: string; value?: string } | string>;
};

export type CommitmentAddChange = {
  id?: string;
  value: string;
  dueDate?: string | null;
};

export type CommitmentChanges = {
  add?: CommitmentAddChange[];
  complete?: Array<{ id?: string; value?: string } | string>;
  remove?: Array<{ id?: string; value?: string } | string>;
};

export type ProposedProfileChanges = {
  currentFocus?: FocusChange;
  strengths?: CategoryChanges;
  values?: CategoryChanges;
  motivators?: CategoryChanges;
  emergingThemes?: CategoryChanges;
  growthAreas?: CategoryChanges;
  coachingPreferences?: CategoryChanges;
  beliefs?: CategoryChanges;
  patterns?: CategoryChanges;
  commitments?: CommitmentChanges;
  coachNote?: string;
};

export type EvidenceSummaryItem = {
  changeKey: string;
  evidenceText: string;
  sourceExcerpt?: string;
  sessionId?: string | null;
};

export type DevelopmentUpdateGenerationResult = {
  conversationSummary: string;
  hasMeaningfulChanges: boolean;
  proposedChanges: ProposedProfileChanges;
  evidence: EvidenceSummaryItem[];
};

export type DevelopmentProfile = {
  id: string;
  clientId: string;
  coachId: string;
  currentFocus: string;
  strengths: ProfileEntry[];
  values: ProfileEntry[];
  motivators: ProfileEntry[];
  emergingThemes: ProfileEntry[];
  growthAreas: ProfileEntry[];
  coachingPreferences: ProfileEntry[];
  beliefs: ProfileEntry[];
  patterns: ProfileEntry[];
  commitments: CommitmentEntry[];
  /** Longitudinal evidence-grounded patterns (coach-reviewable). */
  coachingPatterns: CoachingPattern[];
  patternsEvidenceFingerprint: string | null;
  patternsGeneratedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DevelopmentUpdate = {
  id: string;
  clientId: string;
  sessionId: string;
  coachId: string;
  status: DevelopmentUpdateStatus;
  conversationSummary: string;
  proposedChanges: ProposedProfileChanges;
  editedChanges: ProposedProfileChanges | null;
  appliedChanges: ProposedProfileChanges | null;
  evidenceSummary: EvidenceSummaryItem[];
  hasMeaningfulChanges: boolean;
  coachNote: string;
  generatedAt: string | null;
  reviewedAt: string | null;
  appliedAt: string | null;
  discardedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DevelopmentUpdateReviewTask = {
  update: DevelopmentUpdate;
  clientId: string;
  clientName: string;
  sessionId: string;
  sessionDate: string;
};

export function profileEntryStatusLabel(status: ProfileEntryStatus | string | undefined): string {
  switch (status) {
    case "supported":
      return "Supported";
    case "well_established":
      return "Well established";
    case "emerging":
    default:
      return "Emerging";
  }
}

export function hasAnyProposedChanges(changes: ProposedProfileChanges | null | undefined): boolean {
  if (!changes) return false;
  if (changes.currentFocus?.value?.trim()) return true;

  const categories: Array<CategoryChanges | undefined> = [
    changes.strengths,
    changes.values,
    changes.motivators,
    changes.emergingThemes,
    changes.growthAreas,
    changes.coachingPreferences,
    changes.beliefs,
    changes.patterns,
  ];

  for (const category of categories) {
    if ((category?.add?.length ?? 0) > 0) return true;
    if ((category?.update?.length ?? 0) > 0) return true;
    if ((category?.remove?.length ?? 0) > 0) return true;
  }

  if ((changes.commitments?.add?.length ?? 0) > 0) return true;
  if ((changes.commitments?.complete?.length ?? 0) > 0) return true;
  if ((changes.commitments?.remove?.length ?? 0) > 0) return true;

  return false;
}

/**
 * Substantive pending review: ready_for_review with meaningful proposed changes.
 * Zero-change ready_for_review rows must not drive primary review CTAs.
 */
export function isSubstantivePendingDevelopmentUpdate(
  update: Pick<DevelopmentUpdate, "status" | "hasMeaningfulChanges">
): boolean {
  return update.status === "ready_for_review" && update.hasMeaningfulChanges === true;
}

export function effectiveChanges(update: DevelopmentUpdate): ProposedProfileChanges {
  return update.editedChanges ?? update.proposedChanges ?? {};
}
