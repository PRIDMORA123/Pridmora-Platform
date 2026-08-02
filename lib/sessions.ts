import type { Session, SessionStatus, SummaryStatus } from "./types";

/**
 * Legacy single-user demo coach UUID (pre ID-019).
 * Retained only for migration / claim_legacy_demo_data — never trust as the current coach.
 */
export const LEGACY_DEMO_COACH_ID = "a0000000-0000-4000-8000-000000000001";

/** @deprecated Use the authenticated coach id from the session. */
export const DEMO_COACH_ID = LEGACY_DEMO_COACH_ID;

export type StructuredDraftSections = {
  aiDraftSummary: string;
  emergingThemes: string;
  strengthsObserved: string;
  valuesBecomingVisible: string;
  professionalIdentityDevelopment: string;
  agreedActions: string;
  suggestedFocus: string;
  coachReflection: string;
  coachingBoundaryAlert?: string;
};

/** Session fields that store the eight AI coaching-record sections. */
export type AiReviewSectionKey =
  | "summary"
  | "emergingThemes"
  | "strengthsObserved"
  | "valuesBecomingVisible"
  | "professionalIdentityDevelopment"
  | "agreedActions"
  | "suggestedFocus"
  | "coachReflection";

export type AiReviewSnapshot = Record<AiReviewSectionKey, string>;

export const AI_REVIEW_SECTION_KEYS: AiReviewSectionKey[] = [
  "summary",
  "emergingThemes",
  "strengthsObserved",
  "valuesBecomingVisible",
  "professionalIdentityDevelopment",
  "agreedActions",
  "suggestedFocus",
  "coachReflection",
];

export function snapshotAiReviewSections(session: Pick<Session, AiReviewSectionKey>): AiReviewSnapshot {
  return {
    summary: session.summary ?? "",
    emergingThemes: session.emergingThemes ?? "",
    strengthsObserved: session.strengthsObserved ?? "",
    valuesBecomingVisible: session.valuesBecomingVisible ?? "",
    professionalIdentityDevelopment: session.professionalIdentityDevelopment ?? "",
    agreedActions: session.agreedActions ?? "",
    suggestedFocus: session.suggestedFocus ?? "",
    coachReflection: session.coachReflection ?? "",
  };
}

export function hasAiReviewContent(snapshot: AiReviewSnapshot): boolean {
  return AI_REVIEW_SECTION_KEYS.some(key => snapshot[key].trim().length > 0);
}

export function hasManualAiReviewEdits(
  baseline: AiReviewSnapshot | null,
  current: AiReviewSnapshot
): boolean {
  // No AI draft baseline means any filled section is coach-authored.
  if (!baseline) return hasAiReviewContent(current);
  return AI_REVIEW_SECTION_KEYS.some(key => current[key] !== baseline[key]);
}

const EMPTY_SECTIONS: StructuredDraftSections = {
  aiDraftSummary: "",
  emergingThemes: "",
  strengthsObserved: "",
  valuesBecomingVisible: "",
  professionalIdentityDevelopment: "",
  agreedActions: "",
  suggestedFocus: "",
  coachReflection: "",
};

const SECTION_MATCHERS: Array<{
  key: keyof Omit<StructuredDraftSections, "coachingBoundaryAlert">;
  patterns: RegExp[];
}> = [
  {
    key: "aiDraftSummary",
    patterns: [
      /^\d+\s*[.)]?\s*Session Summary\b/i,
      /^Session Summary\b/i,
    ],
  },
  {
    key: "emergingThemes",
    patterns: [
      /^\d+\s*[.)]?\s*Emerging Themes\b/i,
      /^Emerging Themes\b/i,
      /^\d+\s*[.)]?\s*Key Insights?\b/i,
      /^Key Insights?\b/i,
    ],
  },
  {
    key: "strengthsObserved",
    patterns: [
      /^\d+\s*[.)]?\s*Strengths Observed\b/i,
      /^Strengths Observed\b/i,
      /^\d+\s*[.)]?\s*Relevant Strengths and Capabilities\b/i,
      /^Relevant Strengths and Capabilities\b/i,
    ],
  },
  {
    key: "valuesBecomingVisible",
    patterns: [
      /^\d+\s*[.)]?\s*Values Becoming Visible\b/i,
      /^Values Becoming Visible\b/i,
      /^\d+\s*[.)]?\s*Relevant Coaching Context\b/i,
      /^Relevant Coaching Context\b/i,
      /^\d+\s*[.)]?\s*Coaching Context\b/i,
      /^Coaching Context\b/i,
    ],
  },
  {
    key: "professionalIdentityDevelopment",
    patterns: [
      /^\d+\s*[.)]?\s*Professional Identity Development\b/i,
      /^Professional Identity Development\b/i,
      /^\d+\s*[.)]?\s*Development Evidence\b/i,
      /^Development Evidence\b/i,
    ],
  },
  {
    key: "agreedActions",
    patterns: [
      /^\d+\s*[.)]?\s*Agreed Actions\b/i,
      /^Agreed Actions\b/i,
      /^\d+\s*[.)]?\s*Agreed Commitments\b/i,
      /^Agreed Commitments\b/i,
      /^\d+\s*[.)]?\s*Commitments\b/i,
      /^Commitments\b/i,
    ],
  },
  {
    key: "suggestedFocus",
    patterns: [
      /^\d+\s*[.)]?\s*Suggested Focus(?: for the Next Session)?\b/i,
      /^Suggested Focus(?: for the Next Session)?\b/i,
      /^\d+\s*[.)]?\s*Possible Next Focus\b/i,
      /^Possible Next Focus\b/i,
      /^\d+\s*[.)]?\s*Suggested Future Focus\b/i,
      /^Suggested Future Focus\b/i,
    ],
  },
  {
    key: "coachReflection",
    patterns: [
      /^\d+\s*[.)]?\s*Coach Reflection\b/i,
      /^Coach Reflection\b/i,
    ],
  },
];

function matchSectionHeader(line: string): keyof Omit<StructuredDraftSections, "coachingBoundaryAlert"> | null {
  const trimmed = line.trim();
  for (const matcher of SECTION_MATCHERS) {
    if (matcher.patterns.some(pattern => pattern.test(trimmed))) {
      return matcher.key;
    }
  }
  return null;
}

/**
 * Parse the numbered draft-summary document into structured fields
 * that can be edited independently before Save Session.
 */
export function parseDraftSummary(text: string): StructuredDraftSections {
  const trimmed = text.trim();
  if (!trimmed) return { ...EMPTY_SECTIONS };

  const lines = trimmed.split(/\r?\n/);
  const sections: StructuredDraftSections = { ...EMPTY_SECTIONS };
  const buckets: Partial<Record<keyof StructuredDraftSections, string[]>> = {};
  let current: keyof StructuredDraftSections | null = null;
  const preamble: string[] = [];

  for (const line of lines) {
    if (/^Coaching Boundary Alert\b/i.test(line.trim())) {
      current = "coachingBoundaryAlert";
      buckets.coachingBoundaryAlert = [];
      continue;
    }

    const header = matchSectionHeader(line);
    if (header) {
      current = header;
      buckets[header] = [];
      continue;
    }

    if (current) {
      buckets[current] = buckets[current] ?? [];
      buckets[current]!.push(line);
    } else {
      preamble.push(line);
    }
  }

  for (const key of Object.keys(EMPTY_SECTIONS) as Array<keyof typeof EMPTY_SECTIONS>) {
    sections[key] = (buckets[key] ?? []).join("\n").trim();
  }

  const alert = (buckets.coachingBoundaryAlert ?? []).join("\n").trim();
  if (alert) {
    sections.coachingBoundaryAlert = alert;
    sections.aiDraftSummary = sections.aiDraftSummary
      ? `Coaching Boundary Alert\n\n${alert}\n\n${sections.aiDraftSummary}`
      : `Coaching Boundary Alert\n\n${alert}`;
  }

  const recognised = Object.values(sections).some(value => value.trim().length > 0);
  if (!recognised) {
    sections.aiDraftSummary = trimmed;
  } else if (!sections.aiDraftSummary && preamble.some(line => line.trim())) {
    sections.aiDraftSummary = preamble.join("\n").trim();
  }

  return sections;
}

export function emptyStructuredFields(): StructuredDraftSections {
  return { ...EMPTY_SECTIONS };
}

export function deriveSessionNumber(session: Partial<Session>, indexInClient: number, totalSessions: number): number {
  if (typeof session.sessionNumber === "number" && Number.isFinite(session.sessionNumber) && session.sessionNumber > 0) {
    return session.sessionNumber;
  }

  const fromId = session.id?.match(/(\d+)\s*$/)?.[1];
  if (fromId) return Number(fromId);

  return Math.max(1, totalSessions - indexInClient);
}

function asSessionStatus(value: unknown): SessionStatus {
  if (
    value === "planned" ||
    value === "prepared" ||
    value === "in_progress" ||
    value === "paused" ||
    value === "awaiting_completion" ||
    value === "completed"
  ) {
    return value;
  }
  return "planned";
}

function asSummaryStatus(value: unknown): SummaryStatus {
  if (value === "not_generated" || value === "draft" || value === "approved") {
    return value;
  }
  return "not_generated";
}

function inferStatus(session: Partial<Session>): SessionStatus {
  if (session.status) return asSessionStatus(session.status);
  if (session.aiSummaryApproved || session.summaryStatus === "approved") return "completed";
  if (session.notes?.trim()) return "awaiting_completion";
  if (
    session.preparation?.trim() ||
    session.prepPurpose?.trim() ||
    session.prepTopics?.trim()
  ) {
    return "prepared";
  }
  return "planned";
}

function inferSummaryStatus(session: Partial<Session>): SummaryStatus {
  if (session.summaryStatus) return asSummaryStatus(session.summaryStatus);
  if (session.aiSummaryApproved) return "approved";
  const hasContent = [
    session.summary,
    session.emergingThemes,
    session.agreedActions,
    session.professionalIdentityDevelopment,
  ].some(value => Boolean(value?.trim()));
  return hasContent ? "draft" : "not_generated";
}

export function normalizeSession(
  session: Partial<Session> & Pick<Session, "id">,
  context: { clientId: string; coachId: string; index: number; total: number }
): Session {
  const structured = emptyStructuredFields();
  const summaryStatus = inferSummaryStatus(session);
  const status = inferStatus(session);
  const reflectionPrivate =
    session.reflectPrivate ?? session.reflection ?? "";

  return {
    id: session.id,
    clientId: session.clientId ?? context.clientId,
    coachId: session.coachId ?? context.coachId,
    sessionNumber: deriveSessionNumber(session, context.index, context.total),
    title: session.title ?? "",
    date: session.date ?? "",
    time: session.time ?? "",
    durationMinutes:
      typeof session.durationMinutes === "number" && session.durationMinutes > 0
        ? session.durationMinutes
        : 60,
    location: session.location ?? "",
    status,
    focus: session.focus ?? "",
    preparation: session.preparation ?? "",
    prepPurpose: session.prepPurpose ?? "",
    prepTopics: session.prepTopics ?? "",
    prepQuestions: session.prepQuestions ?? "",
    prepCommitmentsReview: session.prepCommitmentsReview ?? "",
    prepRisks: session.prepRisks ?? "",
    prepPrivateNotes: session.prepPrivateNotes ?? "",
    prepAiBrief: session.prepAiBrief ?? null,
    prepAiBriefGeneratedAt: session.prepAiBriefGeneratedAt ?? "",
    prepAiBriefStyle: session.prepAiBriefStyle ?? "",
    prepAiBriefConfirmedAt: session.prepAiBriefConfirmedAt ?? "",
    prepAiBriefSourceFingerprint: session.prepAiBriefSourceFingerprint ?? "",
    intelligenceMode: session.intelligenceMode ?? "",
    intelligenceStatus: session.intelligenceStatus ?? "idle",
    intelligenceSources: session.intelligenceSources ?? [],
    intelligenceLastRefreshedAt: session.intelligenceLastRefreshedAt ?? "",
    intelligenceErrorCode: session.intelligenceErrorCode ?? "",
    notes: session.notes ?? "",
    commitments: session.commitments ?? "",
    parkingLot: session.parkingLot ?? "",
    notesSavedAt: session.notesSavedAt ?? "",
    timerElapsedSeconds:
      typeof session.timerElapsedSeconds === "number" &&
      Number.isFinite(session.timerElapsedSeconds)
        ? Math.max(0, Math.floor(session.timerElapsedSeconds))
        : 0,
    timerStartedAt: session.timerStartedAt ?? null,
    sessionStartedAt: session.sessionStartedAt ?? null,
    reflection: reflectionPrivate,
    reflectWhatShifted: session.reflectWhatShifted ?? "",
    reflectWhatSurprised: session.reflectWhatSurprised ?? "",
    reflectWhatWorked: session.reflectWhatWorked ?? "",
    reflectDifferently: session.reflectDifferently ?? "",
    reflectProfessionalLearning: session.reflectProfessionalLearning ?? "",
    reflectPrivate: reflectionPrivate,
    summary: session.summary ?? structured.aiDraftSummary,
    emergingThemes: session.emergingThemes ?? structured.emergingThemes,
    strengthsObserved: session.strengthsObserved ?? structured.strengthsObserved,
    valuesBecomingVisible: session.valuesBecomingVisible ?? structured.valuesBecomingVisible,
    professionalIdentityDevelopment:
      session.professionalIdentityDevelopment ?? structured.professionalIdentityDevelopment,
    agreedActions: session.agreedActions ?? structured.agreedActions,
    outcomes: session.outcomes ?? "",
    suggestedFocus: session.suggestedFocus ?? structured.suggestedFocus,
    coachReflection: session.coachReflection ?? structured.coachReflection,
    summaryStatus,
    aiSummaryApproved: summaryStatus === "approved" || session.aiSummaryApproved === true,
    coachingQuestions: session.coachingQuestions ?? [],
    completedAt: session.completedAt ?? "",
    lastUpdated: session.lastUpdated ?? "",
  };
}

/**
 * Build the structured coaching record persisted on save.
 * Draft AI content may be stored; approval is an explicit coach action.
 */
export function buildStructuredSessionRecord(
  session: Session,
  context: { clientId: string; coachId: string; sessionNumber?: number }
): Session {
  const now = new Date().toISOString();
  const summaryStatus =
    session.summaryStatus === "approved" || session.aiSummaryApproved
      ? "approved"
      : hasAiReviewContent(snapshotAiReviewSections(session))
        ? session.summaryStatus === "not_generated"
          ? "draft"
          : session.summaryStatus
        : "not_generated";

  return {
    ...session,
    clientId: context.clientId,
    coachId: context.coachId,
    sessionNumber: context.sessionNumber ?? session.sessionNumber,
    summaryStatus,
    aiSummaryApproved: summaryStatus === "approved",
    reflection: session.reflectPrivate || session.reflection,
    lastUpdated: now,
  };
}

/** Display date for session history, e.g. "15 Jul 2026". */
export function formatSessionHistoryDate(date: Date = new Date()): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Format a yyyy-mm-dd value for display. */
export function formatDisplayDateFromIso(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return formatSessionHistoryDate(date);
}

/** Next chronological session number for a client (max existing + 1). */
export function nextSessionNumber(sessions: Array<Pick<Session, "sessionNumber">>): number {
  if (sessions.length === 0) return 1;
  return Math.max(...sessions.map(session => session.sessionNumber || 0)) + 1;
}

/** Sessions ordered oldest → newest for the Session History panel. */
export function sessionsChronological(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => a.sessionNumber - b.sessionNumber);
}

/** Newest session for a client (highest session number). */
export function newestSession(sessions: Session[]): Session | undefined {
  if (sessions.length === 0) return undefined;
  return [...sessions].sort((a, b) => b.sessionNumber - a.sessionNumber)[0];
}

export function createBlankSession(input: {
  id: string;
  clientId: string;
  coachId: string;
  sessionNumber: number;
  date?: string;
  time?: string;
  title?: string;
  focus?: string;
  preparation?: string;
  durationMinutes?: number;
  location?: string;
  status?: SessionStatus;
}): Session {
  return normalizeSession(
    {
      id: input.id,
      clientId: input.clientId,
      coachId: input.coachId,
      sessionNumber: input.sessionNumber,
      title: input.title ?? "",
      date: input.date ?? "",
      time: input.time ?? "",
      durationMinutes: input.durationMinutes ?? 60,
      location: input.location ?? "",
      status: input.status ?? "planned",
      focus: input.focus ?? input.title ?? "",
      preparation: input.preparation ?? "",
      prepPurpose: "",
      prepTopics: "",
      prepQuestions: "",
      prepCommitmentsReview: "",
      prepRisks: "",
      prepPrivateNotes: "",
      prepAiBrief: null,
      prepAiBriefGeneratedAt: "",
      prepAiBriefStyle: "",
      prepAiBriefConfirmedAt: "",
      prepAiBriefSourceFingerprint: "",
      notes: "",
      commitments: "",
      parkingLot: "",
      notesSavedAt: "",
      timerElapsedSeconds: 0,
      timerStartedAt: null,
      sessionStartedAt: null,
      reflection: "",
      reflectWhatShifted: "",
      reflectWhatSurprised: "",
      reflectWhatWorked: "",
      reflectDifferently: "",
      reflectProfessionalLearning: "",
      reflectPrivate: "",
      summary: "",
      emergingThemes: "",
      strengthsObserved: "",
      valuesBecomingVisible: "",
      professionalIdentityDevelopment: "",
      agreedActions: "",
      outcomes: "",
      suggestedFocus: "",
      coachReflection: "",
      summaryStatus: "not_generated",
      aiSummaryApproved: false,
      coachingQuestions: [],
      completedAt: "",
      lastUpdated: "",
    },
    {
      clientId: input.clientId,
      coachId: input.coachId,
      index: 0,
      total: input.sessionNumber,
    }
  );
}
