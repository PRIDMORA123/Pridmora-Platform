/**
 * Coaching Moments — lightweight relationship interactions.
 * Distinct from formal coaching sessions (interaction_type = "coaching_moment").
 */

export type CoachingMomentStage =
  | "prepare"
  | "conversation"
  | "capture"
  | "complete";

export type CoachingMomentStatus =
  | "draft"
  | "prepared"
  | "in_progress"
  | "captured"
  | "complete"
  | "discarded";

export type CoachingMomentInsightStatus =
  | "not_requested"
  | "draft"
  | "accepted"
  | "edited"
  | "discarded";

export type CoachingMomentType =
  | "feedback"
  | "delegation"
  | "accountability"
  | "difficult_conversation"
  | "recognition"
  | "performance"
  | "conflict"
  | "wellbeing"
  | "career"
  | "change"
  | "stakeholder"
  | "check_in"
  | "general";

export type CoachingMomentRelevantContext = {
  title: string;
  description: string;
  evidenceIds: string[];
};

export type CoachingMomentGuidance = {
  intention: string;
  opening?: string | null;
  questions: string[];
  consideration?: string | null;
  relevantContext?: CoachingMomentRelevantContext | null;
};

export type CoachingMomentInsight = {
  summary: string;
  commitment?: string | null;
  patternConnection?: string | null;
  followUpQuestion?: string | null;
};

export type CoachingMoment = {
  id: string;
  /** Same as clientId — relationship scope. */
  relationshipId: string;
  clientId: string;
  coachId: string;
  createdBy: string;
  occurredAt: string | null;
  status: CoachingMomentStatus;
  situation: string;
  desiredOutcome: string | null;
  inferredType: CoachingMomentType | null;
  generatedIntention: string | null;
  generatedOpening: string | null;
  generatedQuestions: string[];
  generatedConsideration: string | null;
  relevantContext: CoachingMomentRelevantContext | null;
  /** Private coach note — never sent to AI or reports. */
  privateNote: string;
  outcomeNotes: string | null;
  agreedCommitment: string | null;
  noCommitmentAgreed: boolean;
  followUp: string | null;
  generatedInsight: CoachingMomentInsight | null;
  insightStatus: CoachingMomentInsightStatus;
  guidanceFingerprint: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const COACHING_MOMENT_TYPES: CoachingMomentType[] = [
  "feedback",
  "delegation",
  "accountability",
  "difficult_conversation",
  "recognition",
  "performance",
  "conflict",
  "wellbeing",
  "career",
  "change",
  "stakeholder",
  "check_in",
  "general",
];

export const COACHING_MOMENT_TYPE_LABELS: Record<CoachingMomentType, string> = {
  feedback: "Feedback",
  delegation: "Delegation",
  accountability: "Accountability",
  difficult_conversation: "Difficult conversation",
  recognition: "Recognition",
  performance: "Performance",
  conflict: "Conflict",
  wellbeing: "Wellbeing",
  career: "Career development",
  change: "Change",
  stakeholder: "Stakeholder conversation",
  check_in: "Check-in",
  general: "General coaching conversation",
};

export const INTERACTION_TYPE_COACHING_MOMENT = "coaching_moment" as const;

/** Allowed status transitions. */
export const COACHING_MOMENT_TRANSITIONS: Record<
  CoachingMomentStatus,
  CoachingMomentStatus[]
> = {
  draft: ["prepared", "in_progress", "discarded"],
  prepared: ["in_progress", "discarded"],
  in_progress: ["captured", "discarded"],
  captured: ["complete", "discarded"],
  complete: [],
  discarded: [],
};

export function canTransitionCoachingMoment(
  from: CoachingMomentStatus,
  to: CoachingMomentStatus
): boolean {
  if (from === to) return true;
  return COACHING_MOMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function coachingMomentStage(
  status: CoachingMomentStatus
): CoachingMomentStage {
  switch (status) {
    case "draft":
    case "prepared":
      return "prepare";
    case "in_progress":
      return "conversation";
    case "captured":
      return "capture";
    case "complete":
    case "discarded":
      return "complete";
  }
}

export function parseCoachingMomentType(
  value: unknown
): CoachingMomentType | null {
  if (typeof value !== "string") return null;
  return COACHING_MOMENT_TYPES.includes(value as CoachingMomentType)
    ? (value as CoachingMomentType)
    : null;
}

export function parseCoachingMomentStatus(
  value: unknown
): CoachingMomentStatus {
  const allowed: CoachingMomentStatus[] = [
    "draft",
    "prepared",
    "in_progress",
    "captured",
    "complete",
    "discarded",
  ];
  if (typeof value === "string" && allowed.includes(value as CoachingMomentStatus)) {
    return value as CoachingMomentStatus;
  }
  return "draft";
}

export function parseInsightStatus(
  value: unknown
): CoachingMomentInsightStatus {
  const allowed: CoachingMomentInsightStatus[] = [
    "not_requested",
    "draft",
    "accepted",
    "edited",
    "discarded",
  ];
  if (
    typeof value === "string" &&
    allowed.includes(value as CoachingMomentInsightStatus)
  ) {
    return value as CoachingMomentInsightStatus;
  }
  return "not_requested";
}

export function parseQuestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function parseRelevantContext(
  value: unknown
): CoachingMomentRelevantContext | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const description =
    typeof record.description === "string" ? record.description.trim() : "";
  if (!title || !description) return null;
  const evidenceIds = Array.isArray(record.evidenceIds)
    ? record.evidenceIds.filter((id): id is string => typeof id === "string")
    : [];
  return { title, description, evidenceIds };
}

export function parseInsight(value: unknown): CoachingMomentInsight | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  if (!summary) return null;
  return {
    summary,
    commitment:
      typeof record.commitment === "string" ? record.commitment.trim() || null : null,
    patternConnection:
      typeof record.patternConnection === "string"
        ? record.patternConnection.trim() || null
        : null,
    followUpQuestion:
      typeof record.followUpQuestion === "string"
        ? record.followUpQuestion.trim() || null
        : null,
  };
}

export function guidanceFromMoment(
  moment: Pick<
    CoachingMoment,
    | "generatedIntention"
    | "generatedOpening"
    | "generatedQuestions"
    | "generatedConsideration"
    | "relevantContext"
  >
): CoachingMomentGuidance | null {
  if (!moment.generatedIntention?.trim()) return null;
  return {
    intention: moment.generatedIntention.trim(),
    opening: moment.generatedOpening,
    questions: moment.generatedQuestions.slice(0, 3),
    consideration: moment.generatedConsideration,
    relevantContext: moment.relevantContext,
  };
}

export function conciseMomentTitle(moment: Pick<
  CoachingMoment,
  "situation" | "inferredType" | "generatedIntention"
>): string {
  const fromIntention = moment.generatedIntention?.trim();
  if (fromIntention) {
    return fromIntention.length > 72
      ? `${fromIntention.slice(0, 69).trimEnd()}…`
      : fromIntention;
  }
  const fromSituation = moment.situation.trim();
  if (fromSituation) {
    return fromSituation.length > 72
      ? `${fromSituation.slice(0, 69).trimEnd()}…`
      : fromSituation;
  }
  if (moment.inferredType) {
    return COACHING_MOMENT_TYPE_LABELS[moment.inferredType];
  }
  return "Coaching moment";
}

/**
 * Canonical evidence key so raw moment + AI insight + accepted insight
 * count as one underlying interaction.
 */
export function coachingMomentEvidenceCanonicalKey(momentId: string): string {
  return `coaching_moment:${momentId}`;
}

export function isSavedCoachingMoment(
  status: CoachingMomentStatus
): boolean {
  return status === "captured" || status === "complete";
}

export function isActiveCoachingMoment(
  status: CoachingMomentStatus
): boolean {
  return (
    status === "draft" ||
    status === "prepared" ||
    status === "in_progress" ||
    status === "captured"
  );
}
