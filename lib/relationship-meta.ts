/**
 * Optional relationship-level metadata for Agreement, Initial conversation,
 * and Supporting context. Programme-neutral; never required for manager-led coaching.
 */

export type AgreementStatus = "not_recorded" | "draft" | "agreed";

export type RelationshipAgreement = {
  status: AgreementStatus;
  purpose: string;
  confidentiality: string;
  sponsorInvolvement: string;
  sessionExpectation: string;
  reviewDate: string;
  notes: string;
  /** Optional document reference when file support exists. */
  documentUrl?: string | null;
  documentName?: string | null;
  updatedAt?: string | null;
};

export type InitialConversationOutcome =
  | "proceed"
  | "further_discussion"
  | "not_proceeding"
  | "not_recorded";

export type InitialConversation = {
  recorded: boolean;
  occurredOn: string;
  outcome: InitialConversationOutcome;
  notes: string;
  /**
   * When true, this activity was explicitly converted to a normal coaching session.
   * Initial conversations do not count as Session 1 by default.
   */
  convertedToSessionId?: string | null;
  updatedAt?: string | null;
};

export type SupportingContextSourceType =
  | "elevate_baseline"
  | "self_assessment"
  | "feedback_360"
  | "line_manager_feedback"
  | "development_plan"
  | "personal_objectives"
  | "previous_coaching"
  | "other";

export type SupportingContextItem = {
  id: string;
  title: string;
  sourceType: SupportingContextSourceType;
  sourceDate: string;
  summary: string;
  documentUrl?: string | null;
  documentName?: string | null;
  /** Coach must explicitly opt in — upload alone does not personalise AI. */
  useForAiPreparation: boolean;
};

export const EMPTY_AGREEMENT: RelationshipAgreement = {
  status: "not_recorded",
  purpose: "",
  confidentiality: "",
  sponsorInvolvement: "",
  sessionExpectation: "",
  reviewDate: "",
  notes: "",
  documentUrl: null,
  documentName: null,
  updatedAt: null,
};

export const EMPTY_INITIAL_CONVERSATION: InitialConversation = {
  recorded: false,
  occurredOn: "",
  outcome: "not_recorded",
  notes: "",
  convertedToSessionId: null,
  updatedAt: null,
};

export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = {
  not_recorded: "Not recorded",
  draft: "Draft",
  agreed: "Agreed",
};

export const INITIAL_OUTCOME_LABELS: Record<InitialConversationOutcome, string> = {
  proceed: "Proceed with coaching",
  further_discussion: "Further discussion required",
  not_proceeding: "Relationship not proceeding",
  not_recorded: "No outcome recorded",
};

export const SUPPORTING_CONTEXT_SOURCE_LABELS: Record<
  SupportingContextSourceType,
  string
> = {
  elevate_baseline: "Elevate baseline assessment",
  self_assessment: "Self-assessment",
  feedback_360: "360 feedback",
  line_manager_feedback: "Line manager feedback",
  development_plan: "Development plan",
  personal_objectives: "Personal objectives",
  previous_coaching: "Previous coaching information",
  other: "Other relevant evidence",
};

export function agreementStatusLabel(status: AgreementStatus): string {
  if (status === "agreed") return "Agreement recorded";
  return AGREEMENT_STATUS_LABELS[status];
}

export function parseAgreement(value: unknown): RelationshipAgreement {
  if (!value || typeof value !== "object") return { ...EMPTY_AGREEMENT };
  const raw = value as Record<string, unknown>;
  const status =
    raw.status === "draft" || raw.status === "agreed" || raw.status === "not_recorded"
      ? raw.status
      : "not_recorded";
  return {
    status,
    purpose: typeof raw.purpose === "string" ? raw.purpose : "",
    confidentiality:
      typeof raw.confidentiality === "string" ? raw.confidentiality : "",
    sponsorInvolvement:
      typeof raw.sponsorInvolvement === "string" ? raw.sponsorInvolvement : "",
    sessionExpectation:
      typeof raw.sessionExpectation === "string" ? raw.sessionExpectation : "",
    reviewDate: typeof raw.reviewDate === "string" ? raw.reviewDate : "",
    notes: typeof raw.notes === "string" ? raw.notes : "",
    documentUrl:
      typeof raw.documentUrl === "string" ? raw.documentUrl : null,
    documentName:
      typeof raw.documentName === "string" ? raw.documentName : null,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

export function parseInitialConversation(value: unknown): InitialConversation {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_INITIAL_CONVERSATION };
  }
  const raw = value as Record<string, unknown>;
  const outcome =
    raw.outcome === "proceed" ||
    raw.outcome === "further_discussion" ||
    raw.outcome === "not_proceeding" ||
    raw.outcome === "not_recorded"
      ? raw.outcome
      : "not_recorded";
  return {
    recorded: Boolean(raw.recorded),
    occurredOn: typeof raw.occurredOn === "string" ? raw.occurredOn : "",
    outcome,
    notes: typeof raw.notes === "string" ? raw.notes : "",
    convertedToSessionId:
      typeof raw.convertedToSessionId === "string"
        ? raw.convertedToSessionId
        : null,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

export function parseSupportingContext(value: unknown): SupportingContextItem[] {
  if (!Array.isArray(value)) return [];
  const items: SupportingContextItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id : "";
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!id || !title) continue;
    const sourceType = (
      Object.keys(SUPPORTING_CONTEXT_SOURCE_LABELS) as SupportingContextSourceType[]
    ).includes(raw.sourceType as SupportingContextSourceType)
      ? (raw.sourceType as SupportingContextSourceType)
      : "other";
    items.push({
      id,
      title,
      sourceType,
      sourceDate: typeof raw.sourceDate === "string" ? raw.sourceDate : "",
      summary: typeof raw.summary === "string" ? raw.summary : "",
      documentUrl:
        typeof raw.documentUrl === "string" ? raw.documentUrl : null,
      documentName:
        typeof raw.documentName === "string" ? raw.documentName : null,
      useForAiPreparation: Boolean(raw.useForAiPreparation),
    });
  }
  return items;
}

/** Context items the coach has opted in for AI preparation. */
export function supportingContextForAi(
  items: SupportingContextItem[] | undefined | null
): SupportingContextItem[] {
  return (items ?? []).filter(item => item.useForAiPreparation);
}
