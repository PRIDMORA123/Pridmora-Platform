import type { Client, Session } from "@/lib/types";
import type {
  CommitmentEntry,
  DevelopmentProfile,
  DevelopmentUpdate,
  ProfileEntry,
} from "@/lib/development-updates/types";
import {
  getFutureOrOpenSession,
  hasPreparationContent,
  SESSION_STATUS_LABELS,
  unresolvedActions,
} from "@/lib/session-workflow";
import { sessionsChronological } from "@/lib/sessions";
import { coachingStageLabels } from "@/lib/identity-language";

export type JourneyStageId =
  | "relationship_established"
  | "session_review_in_progress"
  | "development_update_awaiting_review"
  | "reflecting_between_sessions"
  | "preparing_for_session"
  | "journey_completed";

export type JourneyStage = {
  id: JourneyStageId;
  label: string;
};

/** Internal timeline markers — display via timelineStatusLabel(). */
export type TimelineStatus = "Complete" | "Current" | "Pending";

export function timelineStatusLabel(status: TimelineStatus): string {
  switch (status) {
    case "Complete":
      return "Complete";
    case "Current":
      return "Current";
    case "Pending":
      return "Next";
  }
}

export type JourneyTimelineItem = {
  id: string;
  label: string;
  status: TimelineStatus;
};

export type JourneyPrimaryAction =
  | { kind: "add_coaching_purpose"; label: string }
  | { kind: "complete_session_review"; label: string; sessionId: string }
  | { kind: "review_development_update"; label: string; updateId: string }
  | { kind: "continue_preparation"; label: string; sessionId: string }
  | { kind: "view_preparation"; label: string; sessionId: string }
  | null;

export type ClientJourneySnapshot = {
  stage: JourneyStage;
  completedSessions: Session[];
  completedSessionCount: number;
  mostRecentCompleted: Session | undefined;
  mostRecentSessionDateLabel: string;
  futureSession: Session | undefined;
  journeyStatusLabel: string;
  coachingPurpose: string;
  /** Concise Journey page summary — max six rows. */
  timeline: JourneyTimelineItem[];
  /** Full chronological event log for History. */
  fullHistory: JourneyTimelineItem[];
  primaryAction: JourneyPrimaryAction;
  outstandingItems: string[];
  suggestedFutureFocus: string;
};

export const JOURNEY_SUMMARY_MAX_ITEMS = 6;

export function getCoachingPurpose(client: Pick<Client, "currentFocus">): string {
  return client.currentFocus.trim();
}

export function isSessionReviewComplete(session: Session): boolean {
  return session.summaryStatus === "approved" || session.aiSummaryApproved;
}

export function isSessionCompleted(session: Session): boolean {
  return session.status === "completed";
}

export function developmentUpdateForSession(
  updates: DevelopmentUpdate[],
  sessionId: string
): DevelopmentUpdate | undefined {
  return updates.find(update => update.sessionId === sessionId);
}

export function latestAppliedUpdate(
  updates: DevelopmentUpdate[]
): DevelopmentUpdate | undefined {
  return updates.find(update => update.status === "applied");
}

export function pendingDevelopmentUpdate(
  updates: DevelopmentUpdate[]
): DevelopmentUpdate | undefined {
  return updates.find(update => update.status === "ready_for_review");
}

function formatDisplayDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Date not recorded";
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return trimmed;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(parsed));
}

export function formatSessionDateLabel(session: Pick<Session, "date" | "completedAt">): string {
  if (session.completedAt?.trim()) return formatDisplayDate(session.completedAt);
  return formatDisplayDate(session.date);
}

function firstMeaningfulLine(value: string): string {
  return (
    value
      .split(/\n|·|;/)
      .map(line => line.trim())
      .find(Boolean) || ""
  );
}

/**
 * True for placeholder labels such as "Session 1", mistyped "Seeion 1",
 * or "Coaching Seeion 1.1" — not meaningful conversation topics.
 */
export function isTechnicalSessionLabel(value: string): boolean {
  const text = value.trim();
  return /^(coaching\s+)?(ses+ion|seeion|conversation|development\s+conversation)\s*\d+(\.\d+)?$/i.test(
    text
  );
}

/**
 * Meaningful conversation focus for Journey display.
 * Prefers human topic language over technical session labels.
 * Does not manufacture a focus from unrelated coaching purpose or profile data.
 */
export function conversationFocus(session: Session): string {
  const candidates = [
    session.focus,
    firstMeaningfulLine(session.prepTopics),
    session.title,
    firstMeaningfulLine(session.emergingThemes),
    firstMeaningfulLine(session.prepPurpose),
  ];

  for (const candidate of candidates) {
    const text = candidate.trim();
    if (!text) continue;
    if (isTechnicalSessionLabel(text)) continue;
    return text;
  }

  return "";
}

/** Concise key insight from the latest approved conversation. */
export function conversationKeyInsight(session: Session, coachInsight = ""): string {
  const fromIdentity = firstMeaningfulLine(session.professionalIdentityDevelopment);
  if (fromIdentity) return fromIdentity;

  const fromSummary = firstMeaningfulLine(session.summary);
  if (fromSummary) {
    // Keep the insight short — first sentence only.
    const sentence = fromSummary.match(/^[^.!?]+[.!?]?/)?.[0]?.trim();
    if (sentence) return sentence;
  }

  const fromThemes = firstMeaningfulLine(session.emergingThemes);
  if (fromThemes) return fromThemes;

  const insight = coachInsight.trim();
  if (insight) return insight;

  return "";
}

export function conversationDisplayTitle(session: Session): string {
  const focus = conversationFocus(session);
  if (focus) return `Development Conversation ${session.sessionNumber} — ${focus}`;
  return `Development Conversation ${session.sessionNumber}`;
}

function conciseProfileEntries(entries: ProfileEntry[], limit = 3): string[] {
  return entries
    .map(entry => entry.value.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function firstNameFrom(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first || "The client";
}

function softenPatternStatement(value: string, clientName: string): string {
  const text = value.trim();
  if (!text) return "";
  if (/^(appears|seems|evidence suggests|may|might|tends)/i.test(text)) return text;
  if (new RegExp(`^${firstNameFrom(clientName)}\\b`, "i").test(text)) return text;
  return `Evidence suggests ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/**
 * One concise evidence-based pattern for Current Development Picture.
 * Uses recorded patterns/themes first; otherwise cautious synthesis from strengths and areas.
 */
export function synthesiseEmergingPattern(input: {
  clientName: string;
  patterns: string[];
  themes: string[];
  strengths: string[];
  developmentAreas: string[];
  keyInsight: string;
}): string {
  const recorded = input.patterns[0] || input.themes[0] || "";
  if (recorded) return softenPatternStatement(recorded, input.clientName);

  const name = firstNameFrom(input.clientName);
  const strength = input.strengths[0];
  const area = input.developmentAreas[0];

  if (strength && area) {
    return `${name} shows emerging strength around ${strength.charAt(0).toLowerCase()}${strength.slice(1)}, while ${area.charAt(0).toLowerCase()}${area.slice(1)} still appears to need attention.`;
  }

  if (input.keyInsight) {
    return softenPatternStatement(input.keyInsight, input.clientName);
  }

  if (area) {
    return `${name} appears more likely to need continued attention on ${area.charAt(0).toLowerCase()}${area.slice(1)}.`;
  }

  if (strength) {
    return `${name} is beginning to show strength in ${strength.charAt(0).toLowerCase()}${strength.slice(1)}.`;
  }

  return "";
}

/**
 * One clear area that may be useful to explore next (Current Development Picture).
 * Prefers synthesised development areas; falls back to an explicit suggested focus.
 * Avoids repeating the current development focus word for word unless evidence supports it.
 */
export function recommendedCoachingFocus(input: {
  suggestedFocus: string;
  currentDevelopmentFocus: string;
  developmentAreas: string[];
  emergingPattern: string;
}): string {
  const area = input.developmentAreas[0]?.trim() || "";
  if (area) {
    return `Explore how ${area.charAt(0).toLowerCase()}${area.slice(1)} shows up in day-to-day leadership choices.`;
  }

  const suggested = input.suggestedFocus.trim();
  if (suggested) return suggested;

  const current = input.currentDevelopmentFocus.trim();
  if (
    current &&
    input.emergingPattern &&
    input.emergingPattern.toLowerCase().includes(current.toLowerCase().slice(0, 24))
  ) {
    return current;
  }

  return "";
}

export function openCommitmentsToRevisit(
  profile: DevelopmentProfile | null | undefined,
  client: Pick<Client, "actions">
): string[] {
  const fromProfile = (profile?.commitments ?? [])
    .filter((item: CommitmentEntry) => item.status === "open")
    .map(item => item.value.trim())
    .filter(Boolean);

  const fromActions = unresolvedActions(client.actions)
    .map(action => action.title.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const combined: string[] = [];
  for (const value of [...fromProfile, ...fromActions]) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(value);
  }
  return combined.slice(0, 5);
}

export function preparationStatusLabel(session: Session | undefined): string {
  if (!session) return "";
  if (session.status === "prepared" || hasPreparationContent(session)) {
    return "Preparation brief available";
  }
  if (session.status === "planned") {
    return "Preparation not yet started";
  }
  if (session.status === "in_progress" || session.status === "paused") {
    return "Development conversation in progress";
  }
  if (session.status === "awaiting_completion") {
    return "Reflection awaiting completion";
  }
  return SESSION_STATUS_LABELS[session.status] || "";
}

export type DevelopmentMilestone = {
  id: string;
  dateLabel: string;
  title: string;
  summary: string;
  type: "purpose" | "conversation" | "reflection" | "commitment" | "development";
};

export type CurrentDevelopmentPositionModel = {
  dateLabel: string;
  headline: string;
  narrative: string;
  fullNarrative: string;
  evidence: string;
  commitment: string;
  emergingDirection: string;
  hasApprovedEvidence: boolean;
  sessionId: string | null;
  showFullNote: boolean;
};

export type LookingAheadModel = {
  nextFocus: string;
  commitments: string[];
  nextAction: string;
  canPrepare: boolean;
  prepareSessionId: string | null;
};

export type JourneyPageViewModel = {
  coachingPurpose: string;
  journeyStage: string;
  /** Distinct from coaching purpose when a development focus has been set. */
  currentDevelopmentFocus: string;
  latestMeaningfulConversationDate: string;
  currentPosition: CurrentDevelopmentPositionModel;
  lookingAhead: LookingAheadModel;
  milestones: DevelopmentMilestone[];
  primaryAction: JourneyPrimaryAction;
  /** Retained for tests and deeper drill-down. */
  latestConversation: {
    title: string;
    dateLabel: string;
    focus: string;
    approvedSummary: string;
    keyLearning: string;
    agreedCommitments: string;
    appliedDevelopmentChange: string;
    reviewComplete: boolean;
    sessionId: string;
  } | null;
  emergingPattern: string;
  recommendedCoachingFocus: string;
  suggestedNextFocus: string;
  commitmentsToRevisit: string[];
};

const JOURNEY_NARRATIVE_MAX_WORDS = 100;
const JOURNEY_NARRATIVE_TARGET_MIN = 70;

export function countWords(value: string): number {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function limitWords(value: string, maxWords: number): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const words = trimmed.split(/\s+/);
  if (words.length <= maxWords) return trimmed;
  return `${words.slice(0, maxWords).join(" ").replace(/[.,;:!?]+$/, "")}…`;
}

function latestAppliedUpdateForSession(
  session: Session | undefined,
  updates: DevelopmentUpdate[]
): DevelopmentUpdate | undefined {
  if (!session) return undefined;
  return updates
    .filter(
      update => update.sessionId === session.id && update.status === "applied"
    )
    .sort((a, b) => {
      const aTime = Date.parse(a.appliedAt || a.updatedAt || a.createdAt) || 0;
      const bTime = Date.parse(b.appliedAt || b.updatedAt || b.createdAt) || 0;
      return bTime - aTime;
    })[0];
}

function evidenceFromUpdate(update: DevelopmentUpdate | undefined): string {
  const text = update?.evidenceSummary?.[0]?.evidenceText?.trim() || "";
  return text;
}

/**
 * Build one provisional development narrative (~70–100 words).
 * Avoids repeating the evidence row and keeps language provisional.
 */
export function buildDevelopmentNarrative(input: {
  clientName: string;
  focus: string;
  keyLearning: string;
  emergingPattern: string;
  developmentAreas: string[];
  emergingStrengths: string[];
  approvedSummary: string;
  appliedChange: string;
  evidence?: string;
}): { narrative: string; fullNarrative: string; showFullNote: boolean } {
  const name = firstNameFrom(input.clientName);
  const focus = input.focus.trim();
  const pattern = input.emergingPattern.trim();
  const area = input.developmentAreas[0]?.trim() || "";
  const strength = input.emergingStrengths[0]?.trim() || "";
  const learning = input.keyLearning.trim();
  const change = input.appliedChange.trim();
  const summary = input.approvedSummary.trim();
  const evidence = input.evidence?.trim() || "";

  const overlapsEvidence = (value: string) => {
    if (!evidence || !value) return false;
    const a = evidence.toLowerCase();
    const b = value.toLowerCase();
    return a === b || a.includes(b.slice(0, 40)) || b.includes(a.slice(0, 40));
  };

  const fullParts: string[] = [];

  if (pattern && !overlapsEvidence(pattern)) {
    fullParts.push(softenPatternStatement(pattern, input.clientName));
  } else if (learning && !overlapsEvidence(learning)) {
    fullParts.push(softenPatternStatement(learning, input.clientName));
  } else if (focus) {
    fullParts.push(
      `${name} is becoming more aware of how ${focus.charAt(0).toLowerCase()}${focus.slice(1)} shapes day-to-day leadership choices.`
    );
  } else {
    fullParts.push(
      `${name}'s development story is beginning to take shape through the coaching relationship.`
    );
  }

  if (strength && area) {
    fullParts.push(
      `Current evidence suggests movement towards ${strength.charAt(0).toLowerCase()}${strength.slice(1)}, although ${area.charAt(0).toLowerCase()}${area.slice(1)} is not yet consistently established.`
    );
  } else if (area) {
    fullParts.push(
      `Current evidence suggests ${area.charAt(0).toLowerCase()}${area.slice(1)} still needs careful attention before a consistent behavioural shift can be claimed.`
    );
  } else if (strength) {
    fullParts.push(
      `Current evidence suggests growing capacity around ${strength.charAt(0).toLowerCase()}${strength.slice(1)}, although the shift is still emerging.`
    );
  }

  if (change && !fullParts.some(part => part.toLowerCase().includes(change.toLowerCase().slice(0, 28)))) {
    fullParts.push(
      `The next stage is to test this awareness through ${change.charAt(0).toLowerCase()}${change.slice(1).replace(/\.$/, "")}.`
    );
  } else if (area) {
    fullParts.push(
      `The next stage is to test this awareness through clearer practice, appropriate challenge and greater confidence in new ways of working.`
    );
  } else if (focus) {
    fullParts.push(
      `The next stage is to test this awareness in live situations where ${focus.charAt(0).toLowerCase()}${focus.slice(1)} is under pressure.`
    );
  }

  let fullNarrative = fullParts.join(" ").replace(/\s+/g, " ").trim();

  // Prefer a coherent approved summary when it already reads as a narrative.
  if (summary && countWords(summary) >= JOURNEY_NARRATIVE_TARGET_MIN) {
    fullNarrative = summary;
  } else if (summary && countWords(fullNarrative) < JOURNEY_NARRATIVE_TARGET_MIN) {
    const bridge = softenPatternStatement(summary, input.clientName);
    if (!fullNarrative.toLowerCase().includes(bridge.toLowerCase().slice(0, 40))) {
      fullNarrative = `${fullNarrative} ${bridge}`.trim();
    }
  }

  const narrative = limitWords(fullNarrative, JOURNEY_NARRATIVE_MAX_WORDS);
  const showFullNote = countWords(fullNarrative) > JOURNEY_NARRATIVE_MAX_WORDS;

  return { narrative, fullNarrative, showFullNote };
}

export function buildDevelopmentHeadline(input: {
  focus: string;
  keyLearning: string;
  emergingPattern: string;
  currentDevelopmentFocus: string;
}): string {
  const focus = input.focus.trim();
  if (focus) return focus;

  const developmentFocus = input.currentDevelopmentFocus.trim();
  if (developmentFocus) return developmentFocus;

  const learning = firstMeaningfulLine(input.keyLearning);
  if (learning) {
    return learning.length > 90 ? `${learning.slice(0, 87).trim()}…` : learning;
  }

  const pattern = firstMeaningfulLine(input.emergingPattern);
  if (pattern) {
    return pattern.length > 90 ? `${pattern.slice(0, 87).trim()}…` : pattern;
  }

  return "Development underway";
}

function emergingDirectionText(input: {
  appliedChange: string;
  recommendedFocus: string;
  suggestedFocus: string;
  pattern: string;
}): string {
  const change = input.appliedChange.trim();
  if (change) return change;

  const pattern = input.pattern.trim();
  if (pattern) {
    return `Current evidence suggests continued movement around ${pattern.charAt(0).toLowerCase()}${pattern.slice(1).replace(/\.$/, "")}.`;
  }

  const recommended = input.recommendedFocus.trim();
  if (recommended) return recommended;

  return input.suggestedFocus.trim();
}

function nextMeaningfulActionText(input: {
  primaryAction: JourneyPrimaryAction;
  hasFutureSession: boolean;
  archived: boolean;
  nextFocus: string;
}): string {
  if (input.primaryAction) {
    switch (input.primaryAction.kind) {
      case "add_coaching_purpose":
        return "Agree the coaching purpose that will guide this relationship.";
      case "complete_session_review":
        return "Complete the reflection so the latest development can be captured.";
      case "review_development_update":
        return "Review the development update and decide what should enter the record.";
      case "continue_preparation":
        return "Prepare the next conversation with a clear focus and useful questions.";
      case "view_preparation":
        return "Review the preparation brief before the next conversation.";
    }
  }

  if (input.hasFutureSession) {
    return input.nextFocus
      ? `Carry the next coaching focus into the planned conversation.`
      : "Continue with the planned development conversation.";
  }

  if (input.archived) {
    return "No immediate coaching action is required.";
  }

  return "Schedule the next development conversation when the timing is right.";
}

export function buildJourneyPageViewModel(
  client: Client,
  profile: DevelopmentProfile | null | undefined,
  updates: DevelopmentUpdate[],
  journeyStageLabel: string
): JourneyPageViewModel {
  const snapshot = buildClientJourneySnapshot(client, updates);
  const mostRecent = snapshot.mostRecentCompleted;
  const coachingPurpose = snapshot.coachingPurpose;
  const profileFocus = profile?.currentFocus?.trim() || "";
  const currentDevelopmentFocus =
    profileFocus && profileFocus !== coachingPurpose ? profileFocus : "";

  const emergingStrengths = profile ? conciseProfileEntries(profile.strengths) : [];
  const developmentAreas = profile ? conciseProfileEntries(profile.growthAreas) : [];
  const themes = profile ? conciseProfileEntries(profile.emergingThemes) : [];
  const patterns = profile ? conciseProfileEntries(profile.patterns) : [];

  const rawKeyLearning = mostRecent
    ? conversationKeyInsight(mostRecent, client.coachInsight)
    : "";
  const approvedSummary = mostRecent?.summary.trim() || "";
  const summaryStem = approvedSummary.replace(/[.!?]$/, "");
  const keyLearning =
    rawKeyLearning &&
    approvedSummary &&
    (approvedSummary === rawKeyLearning ||
      summaryStem.startsWith(rawKeyLearning.replace(/[.!?]$/, "")))
      ? ""
      : rawKeyLearning;
  const focus = mostRecent ? conversationFocus(mostRecent) : "";
  const emergingPattern = synthesiseEmergingPattern({
    clientName: client.name,
    patterns,
    themes,
    strengths: emergingStrengths,
    developmentAreas,
    keyInsight: keyLearning || rawKeyLearning,
  });
  const recommended = recommendedCoachingFocus({
    suggestedFocus: snapshot.suggestedFutureFocus,
    currentDevelopmentFocus: profileFocus || coachingPurpose,
    developmentAreas,
    emergingPattern,
  });
  const explicitNextFocus = snapshot.suggestedFutureFocus.trim();
  const suggestedNextFocus =
    explicitNextFocus && explicitNextFocus !== recommended
      ? explicitNextFocus
      : explicitNextFocus && !recommended
        ? explicitNextFocus
        : "";

  const future = snapshot.futureSession;
  const dateLabel = mostRecent ? formatSessionDateLabel(mostRecent) : "";
  const applied = latestAppliedUpdateForSession(mostRecent, updates);
  const appliedDevelopmentChange = latestAppliedDevelopmentChange(mostRecent, updates);
  const insightForNarrative = keyLearning || rawKeyLearning;
  const evidence =
    evidenceFromUpdate(applied) ||
    firstMeaningfulLine(mostRecent?.strengthsObserved || "") ||
    firstMeaningfulLine(mostRecent?.valuesBecomingVisible || "") ||
    firstMeaningfulLine(mostRecent?.coachReflection || "") ||
    insightForNarrative;

  const reviewComplete = mostRecent ? isSessionReviewComplete(mostRecent) : false;
  const hasApprovedEvidence = Boolean(
    mostRecent &&
      reviewComplete &&
      (approvedSummary || keyLearning || rawKeyLearning || evidence || emergingPattern)
  );

  const headline = buildDevelopmentHeadline({
    focus,
    keyLearning: keyLearning || rawKeyLearning,
    emergingPattern,
    currentDevelopmentFocus: currentDevelopmentFocus || profileFocus || coachingPurpose,
  });

  const { narrative, fullNarrative, showFullNote } = hasApprovedEvidence
    ? buildDevelopmentNarrative({
        clientName: client.name,
        focus,
        keyLearning: keyLearning || rawKeyLearning,
        emergingPattern,
        developmentAreas,
        emergingStrengths,
        approvedSummary,
        appliedChange: appliedDevelopmentChange,
        evidence,
      })
    : mostRecent && !reviewComplete
      ? {
          narrative:
            "A development conversation has taken place. Reflection is still needed before a clear development position can be drawn from the available evidence.",
          fullNarrative: "",
          showFullNote: false,
        }
      : {
          narrative: "",
          fullNarrative: "",
          showFullNote: false,
        };

  const commitment =
    mostRecent?.commitments.trim() || mostRecent?.agreedActions.trim() || "";
  const emergingDirection = emergingDirectionText({
    appliedChange: appliedDevelopmentChange,
    recommendedFocus: recommended,
    suggestedFocus: suggestedNextFocus,
    pattern: emergingPattern,
  });

  // Keep Looking Ahead distinct from the emerging-direction row.
  const nextFocus =
    recommended &&
    emergingDirection &&
    recommended.toLowerCase() !== emergingDirection.toLowerCase()
      ? recommended
      : suggestedNextFocus || recommended || currentDevelopmentFocus || coachingPurpose;

  const commitments = openCommitmentsToRevisit(profile, client).slice(0, 3);
  const canPrepare = Boolean(
    future &&
      (future.status === "planned" || future.status === "prepared") &&
      client.status !== "Archived"
  );

  const lookingAheadNextAction = nextMeaningfulActionText({
    primaryAction: snapshot.primaryAction,
    hasFutureSession: Boolean(future),
    archived: client.status === "Archived",
    nextFocus,
  });

  const milestones = buildDevelopmentPathMilestones(client, updates, {
    coachingPurpose,
    createdAt: client.createdAt,
  });

  return {
    coachingPurpose,
    journeyStage: journeyStageLabel,
    currentDevelopmentFocus,
    latestMeaningfulConversationDate: dateLabel,
    currentPosition: {
      dateLabel,
      headline: hasApprovedEvidence
        ? headline
        : mostRecent && !reviewComplete
          ? focus || conversationDisplayTitle(mostRecent)
          : "The development story is still forming",
      narrative,
      fullNarrative,
      evidence: hasApprovedEvidence ? limitWords(evidence, 40) : "",
      commitment: hasApprovedEvidence ? limitWords(commitment, 36) : "",
      emergingDirection: hasApprovedEvidence
        ? limitWords(emergingDirection, 40)
        : "",
      hasApprovedEvidence,
      sessionId: mostRecent?.id ?? null,
      showFullNote: hasApprovedEvidence && showFullNote,
    },
    lookingAhead: {
      nextFocus,
      commitments,
      nextAction: lookingAheadNextAction,
      canPrepare,
      prepareSessionId: future?.id ?? null,
    },
    milestones,
    primaryAction: snapshot.primaryAction,
    latestConversation: mostRecent
      ? {
          title: conversationDisplayTitle(mostRecent),
          dateLabel,
          focus,
          approvedSummary,
          keyLearning,
          agreedCommitments: commitment,
          appliedDevelopmentChange,
          reviewComplete,
          sessionId: mostRecent.id,
        }
      : null,
    emergingPattern,
    recommendedCoachingFocus: recommended,
    suggestedNextFocus,
    commitmentsToRevisit: commitments,
  };
}

function latestAppliedDevelopmentChange(
  session: Session | undefined,
  updates: DevelopmentUpdate[]
): string {
  if (!session) return "";
  const applied = latestAppliedUpdateForSession(session, updates);
  if (!applied) {
    return (
      session.professionalIdentityDevelopment.trim() ||
      session.suggestedFocus.trim() ||
      ""
    );
  }
  const focusChange = applied.appliedChanges?.currentFocus?.value?.trim() || "";
  return (
    focusChange ||
    applied.coachNote.trim() ||
    applied.conversationSummary.trim() ||
    ""
  );
}

/**
 * Editorial development milestones in reverse chronological order.
 */
export function buildDevelopmentPathMilestones(
  client: Pick<Client, "currentFocus" | "sessions" | "status" | "createdAt">,
  updates: DevelopmentUpdate[] = [],
  context: { coachingPurpose: string; createdAt?: string } = {
    coachingPurpose: "",
  }
): DevelopmentMilestone[] {
  const milestones: DevelopmentMilestone[] = [];
  const completed = sessionsChronological(client.sessions).filter(isSessionCompleted);
  const purpose = context.coachingPurpose || getCoachingPurpose(client);

  if (completed.length === 0 && !purpose) {
    return [];
  }

  for (let index = completed.length - 1; index >= 0; index -= 1) {
    const session = completed[index];
    const focus = conversationFocus(session);
    const insight = conversationKeyInsight(session);
    const applied = latestAppliedUpdateForSession(session, updates);

    if (applied) {
      const change =
        applied.appliedChanges?.currentFocus?.value?.trim() ||
        applied.coachNote.trim() ||
        applied.conversationSummary.trim() ||
        insight;
      milestones.push({
        id: `development-${session.id}`,
        dateLabel: formatSessionDateLabel({
          date: applied.appliedAt || session.date,
          completedAt: applied.appliedAt || session.completedAt,
        }),
        title: focus
          ? `Development shift — ${focus}`
          : `Development update — Conversation ${session.sessionNumber}`,
        summary: limitWords(
          change ||
            "A meaningful development update was applied to the coaching record.",
          36
        ),
        type: "development",
      });
    }

    if (isSessionReviewComplete(session)) {
      milestones.push({
        id: `reflection-${session.id}`,
        dateLabel: formatSessionDateLabel(session),
        title: focus
          ? `Reflection — ${focus}`
          : `Reflection completed — Conversation ${session.sessionNumber}`,
        summary: limitWords(
          insight ||
            session.summary.trim() ||
            "Reflection captured what shifted in this conversation.",
          36
        ),
        type: "reflection",
      });
    }

    milestones.push({
      id: `conversation-${session.id}`,
      dateLabel: formatSessionDateLabel(session),
      title: focus
        ? `Development conversation — ${focus}`
        : `Development conversation ${session.sessionNumber}`,
      summary: limitWords(
        insight ||
          session.summary.trim() ||
          (focus
            ? `Conversation explored ${focus.charAt(0).toLowerCase()}${focus.slice(1)}.`
            : "A development conversation took place in this coaching relationship."),
        36
      ),
      type: "conversation",
    });
  }

  if (purpose) {
    milestones.push({
      id: "purpose",
      dateLabel: formatCreatedDate(context.createdAt || client.createdAt),
      title: "Coaching purpose agreed",
      summary: limitWords(purpose, 36),
      type: "purpose",
    });
  }

  milestones.push({
    id: "relationship",
    dateLabel: formatCreatedDate(context.createdAt || client.createdAt),
    title: "Coaching relationship established",
    summary: "The coaching relationship began and the development journey opened.",
    type: "commitment",
  });

  // Deduplicate near-identical titles while preserving reverse-chronological order.
  const seen = new Set<string>();
  return milestones.filter(item => {
    const key = `${item.type}:${item.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sessionReviewOutstanding(session: Session | undefined): boolean {
  if (!session) return false;
  if (!isSessionCompleted(session)) return false;
  return !isSessionReviewComplete(session);
}

function developmentUpdatePendingForSession(
  updates: DevelopmentUpdate[],
  session: Session | undefined
): DevelopmentUpdate | undefined {
  if (!session || !isSessionReviewComplete(session)) return undefined;
  const update = developmentUpdateForSession(updates, session.id);
  if (!update) return undefined;
  if (update.status === "ready_for_review" || update.status === "draft") return update;
  return undefined;
}

function isFutureOpenSession(session: Session | undefined): session is Session {
  if (!session) return false;
  return (
    session.status === "planned" ||
    session.status === "prepared" ||
    session.status === "in_progress" ||
    session.status === "paused" ||
    session.status === "awaiting_completion"
  );
}

/**
 * Derive the client's current coaching journey stage from real workflow data.
 *
 * Priority (most urgent unfinished work first):
 * 1. Coaching relationship completed (Archived)
 * 2. Completed session with review not complete
 * 3. Review complete but development update still pending
 * 4. Future conversation exists → Ready for preparation / in progress
 * 5. Development update applied / no future conversation → Reflecting between conversations
 * 6. No completed conversations → Coaching relationship established
 */
export function deriveJourneyStage(
  client: Pick<Client, "status" | "sessions">,
  updates: DevelopmentUpdate[] = []
): JourneyStage {
  if (client.status === "Archived") {
    return { id: "journey_completed", label: coachingStageLabels.relationshipComplete };
  }

  const completed = sessionsChronological(client.sessions).filter(isSessionCompleted);
  const mostRecent = completed.length > 0 ? completed[completed.length - 1] : undefined;
  const future = getFutureOrOpenSession(client.sessions);

  if (sessionReviewOutstanding(mostRecent)) {
    return {
      id: "session_review_in_progress",
      label: coachingStageLabels.reflectionInProgress,
    };
  }

  const pendingUpdate = developmentUpdatePendingForSession(updates, mostRecent);
  if (pendingUpdate && mostRecent) {
    return {
      id: "development_update_awaiting_review",
      label: coachingStageLabels.developmentUpdateAvailable,
    };
  }

  // Also surface a ready_for_review update even if not tied to most-recent mapping edge cases.
  const anyPending = pendingDevelopmentUpdate(updates);
  if (anyPending && mostRecent && isSessionReviewComplete(mostRecent)) {
    return {
      id: "development_update_awaiting_review",
      label: coachingStageLabels.developmentUpdateAvailable,
    };
  }

  if (isFutureOpenSession(future)) {
    const prepLabel =
      future.status === "prepared" ||
      future.status === "in_progress" ||
      future.status === "paused"
        ? future.status === "in_progress" || future.status === "paused"
          ? coachingStageLabels.conversationInProgress
          : coachingStageLabels.readyForConversation
        : hasPreparationContent(future)
          ? coachingStageLabels.preparationInProgress
          : coachingStageLabels.readyForPreparation;
    return {
      id: "preparing_for_session",
      label: prepLabel,
    };
  }

  if (mostRecent && isSessionReviewComplete(mostRecent)) {
    const update = developmentUpdateForSession(updates, mostRecent.id);
    const appliedOrNone =
      !update || update.status === "applied" || update.status === "discarded";
    if (appliedOrNone) {
      return {
        id: "reflecting_between_sessions",
        label: coachingStageLabels.betweenConversations,
      };
    }
  }

  if (completed.length === 0) {
    return {
      id: "relationship_established",
      label: coachingStageLabels.relationshipCreated,
    };
  }

  return {
    id: "reflecting_between_sessions",
    label: coachingStageLabels.betweenConversations,
  };
}

/**
 * Concise Journey page summary.
 * Aggregates repeatable events and returns at most six meaningful rows.
 * Items that have not occurred are omitted unless they are the current required stage.
 */
export function buildJourneyTimeline(
  client: Pick<Client, "currentFocus" | "sessions" | "status">,
  updates: DevelopmentUpdate[] = []
): JourneyTimelineItem[] {
  const stage = deriveJourneyStage(client, updates);
  const purpose = getCoachingPurpose(client);
  const completed = sessionsChronological(client.sessions).filter(isSessionCompleted);
  const mostRecent = completed.length > 0 ? completed[completed.length - 1] : undefined;
  const reviewed = completed.filter(isSessionReviewComplete);
  const latestReviewed = reviewed.length > 0 ? reviewed[reviewed.length - 1] : undefined;
  const appliedUpdates = updates
    .filter(update => update.status === "applied")
    .sort((a, b) => {
      const aTime = Date.parse(a.appliedAt || a.updatedAt || a.createdAt) || 0;
      const bTime = Date.parse(b.appliedAt || b.updatedAt || b.createdAt) || 0;
      return bTime - aTime;
    });
  const latestApplied = appliedUpdates[0];

  const items: JourneyTimelineItem[] = [
    {
      id: "relationship",
      label: "Coaching relationship established",
      status: "Complete",
    },
  ];

  if (purpose) {
    items.push({
      id: "purpose",
      label: "Coaching purpose agreed",
      status: "Complete",
    });
  } else if (!purpose && stage.id === "relationship_established") {
    items.push({
      id: "purpose",
      label: "Coaching purpose agreed",
      status: "Current",
    });
  }

  if (completed.length > 0) {
    items.push({
      id: "conversations",
      label:
        completed.length === 1
          ? "1 development conversation completed"
          : `${completed.length} development conversations completed`,
      status: "Complete",
    });
  }

  if (latestReviewed) {
    items.push({
      id: "latest-reflection",
      label: `Latest reflection completed — Session ${latestReviewed.sessionNumber}`,
      status: "Complete",
    });
  } else if (mostRecent && stage.id === "session_review_in_progress") {
    items.push({
      id: "latest-reflection",
      label: `Session ${mostRecent.sessionNumber} reflection`,
      status: "Current",
    });
  }

  if (latestApplied) {
    const session = client.sessions.find(item => item.id === latestApplied.sessionId);
    items.push({
      id: "latest-development-update",
      label: session
        ? `Latest development update applied — Session ${session.sessionNumber}`
        : "Latest development update applied",
      status: "Complete",
    });
  } else if (stage.id === "development_update_awaiting_review" && mostRecent) {
    items.push({
      id: "latest-development-update",
      label: `Development update from Session ${mostRecent.sessionNumber}`,
      status: "Current",
    });
  }

  // Current stage as the final summary row (unless already represented above as Current).
  const alreadyShowsCurrent = items.some(item => item.status === "Current");
  if (!alreadyShowsCurrent) {
    items.push({
      id: "current-stage",
      label: stage.label,
      status: "Current",
    });
  }

  return items.slice(0, JOURNEY_SUMMARY_MAX_ITEMS);
}

/**
 * Full chronological event log for the History area.
 * Lists individual sessions, reviews and development updates in order.
 */
export function buildFullJourneyHistory(
  client: Pick<Client, "currentFocus" | "sessions" | "status">,
  updates: DevelopmentUpdate[] = []
): JourneyTimelineItem[] {
  const stage = deriveJourneyStage(client, updates);
  const purpose = getCoachingPurpose(client);
  const completed = sessionsChronological(client.sessions).filter(isSessionCompleted);
  const mostRecent = completed.length > 0 ? completed[completed.length - 1] : undefined;
  const future = getFutureOrOpenSession(client.sessions);
  const items: JourneyTimelineItem[] = [
    { id: "relationship", label: "Coaching relationship established", status: "Complete" },
  ];

  if (purpose) {
    items.push({ id: "purpose", label: "Coaching purpose agreed", status: "Complete" });
  } else if (stage.id === "relationship_established") {
    items.push({ id: "purpose", label: "Coaching purpose agreed", status: "Current" });
  }

  for (const session of completed) {
    items.push({
      id: `session-${session.id}`,
      label: `Session ${session.sessionNumber}`,
      status: "Complete",
    });

    const reviewComplete = isSessionReviewComplete(session);
    const isLatest = mostRecent?.id === session.id;
    items.push({
      id: `review-${session.id}`,
      label: `Session ${session.sessionNumber} review`,
      status: reviewComplete ? "Complete" : isLatest ? "Current" : "Pending",
    });

    if (reviewComplete) {
      const update = developmentUpdateForSession(updates, session.id);
      if (update?.status === "applied") {
        items.push({
          id: `dev-${session.id}`,
          label: `Development update — Session ${session.sessionNumber}`,
          status: "Complete",
        });
      } else if (update?.status === "ready_for_review" || update?.status === "draft") {
        items.push({
          id: `dev-${session.id}`,
          label: `Development update — Session ${session.sessionNumber}`,
          status: isLatest ? "Current" : "Pending",
        });
      } else if (isLatest && stage.id === "development_update_awaiting_review") {
        items.push({
          id: `dev-${session.id}`,
          label: `Development update — Session ${session.sessionNumber}`,
          status: "Current",
        });
      }
    }
  }

  if (stage.id === "reflecting_between_sessions") {
    items.push({ id: "reflection", label: "Reflection", status: "Current" });
  } else if (stage.id === "preparing_for_session" && future) {
    items.push({
      id: `prep-${future.id}`,
      label: `Preparation for Development Conversation ${future.sessionNumber}`,
      status: "Current",
    });
  } else if (stage.id === "journey_completed") {
    items.push({
      id: "completed",
      label: coachingStageLabels.relationshipComplete,
      status: "Complete",
    });
  }

  const currentCount = items.filter(item => item.status === "Current").length;
  if (currentCount > 1) {
    let seen = false;
    for (let i = items.length - 1; i >= 0; i -= 1) {
      if (items[i].status !== "Current") continue;
      if (!seen) {
        seen = true;
        continue;
      }
      items[i] = { ...items[i], status: "Pending" };
    }
  }

  return items;
}

export function derivePrimaryAction(
  client: Pick<Client, "currentFocus" | "sessions" | "status">,
  updates: DevelopmentUpdate[] = []
): JourneyPrimaryAction {
  if (client.status === "Archived") return null;

  if (!getCoachingPurpose(client)) {
    return { kind: "add_coaching_purpose", label: "Add coaching purpose" };
  }

  const completed = sessionsChronological(client.sessions).filter(isSessionCompleted);
  const mostRecent = completed.length > 0 ? completed[completed.length - 1] : undefined;

  if (mostRecent && sessionReviewOutstanding(mostRecent)) {
    return {
      kind: "complete_session_review",
      label: "Complete Reflection",
      sessionId: mostRecent.id,
    };
  }

  const pending =
    developmentUpdatePendingForSession(updates, mostRecent) ??
    pendingDevelopmentUpdate(updates);
  if (pending) {
    return {
      kind: "review_development_update",
      label: "Review Development Update",
      updateId: pending.id,
    };
  }

  const future = getFutureOrOpenSession(client.sessions);
  if (isFutureOpenSession(future)) {
    if (future.status === "planned" || future.status === "prepared") {
      if (hasPreparationContent(future) || future.status === "prepared") {
        return {
          kind: "view_preparation",
          label: "Review Preparation Brief",
          sessionId: future.id,
        };
      }
      return {
        kind: "continue_preparation",
        label: "Begin Preparation",
        sessionId: future.id,
      };
    }
  }

  return null;
}

export function buildOutstandingItems(
  client: Pick<Client, "currentFocus" | "sessions" | "status">,
  updates: DevelopmentUpdate[] = []
): string[] {
  const items: string[] = [];
  if (!getCoachingPurpose(client)) {
    items.push("Add a coaching purpose.");
  }

  const completed = sessionsChronological(client.sessions).filter(isSessionCompleted);
  const mostRecent = completed.length > 0 ? completed[completed.length - 1] : undefined;

  if (mostRecent && sessionReviewOutstanding(mostRecent)) {
    items.push(
      `Complete the reflection for Development Conversation ${mostRecent.sessionNumber}.`
    );
  }

  const pending =
    developmentUpdatePendingForSession(updates, mostRecent) ??
    pendingDevelopmentUpdate(updates);
  if (pending && mostRecent) {
    items.push(
      `Review and apply the Development Update from Session ${mostRecent.sessionNumber}.`
    );
  } else if (pending) {
    items.push("Review and apply the pending Development Update.");
  }

  const future = getFutureOrOpenSession(client.sessions);
  if (future?.status === "planned" && !hasPreparationContent(future)) {
    items.push(
      `Preparation for Development Conversation ${future.sessionNumber} has not been started.`
    );
  }

  return items;
}

export function buildClientJourneySnapshot(
  client: Client,
  updates: DevelopmentUpdate[] = []
): ClientJourneySnapshot {
  const completedSessions = sessionsChronological(client.sessions).filter(isSessionCompleted);
  const mostRecentCompleted =
    completedSessions.length > 0
      ? completedSessions[completedSessions.length - 1]
      : undefined;
  const futureSession = getFutureOrOpenSession(client.sessions);
  const stage = deriveJourneyStage(client, updates);

  return {
    stage,
    completedSessions,
    completedSessionCount: completedSessions.length,
    mostRecentCompleted,
    mostRecentSessionDateLabel: mostRecentCompleted
      ? formatSessionDateLabel(mostRecentCompleted)
      : "—",
    futureSession: isFutureOpenSession(futureSession) ? futureSession : undefined,
    journeyStatusLabel: client.status,
    coachingPurpose: getCoachingPurpose(client),
    timeline: buildJourneyTimeline(client, updates),
    fullHistory: buildFullJourneyHistory(client, updates),
    primaryAction: derivePrimaryAction(client, updates),
    outstandingItems: buildOutstandingItems(client, updates),
    suggestedFutureFocus: mostRecentCompleted?.suggestedFocus.trim() || "",
  };
}

export function sessionReviewStatusLabel(session: Session): string {
  if (isSessionReviewComplete(session)) return "Complete";
  if (session.summaryStatus === "draft" || session.summary.trim()) return "In progress";
  return "Awaiting completion";
}

export function developmentUpdateStatusLabel(
  update: DevelopmentUpdate | undefined
): string {
  if (!update) return "Not started";
  switch (update.status) {
    case "applied":
      return "Applied";
    case "ready_for_review":
      return "Ready for review";
    case "draft":
      return "Draft";
    case "discarded":
      return "Discarded";
    case "failed":
      return "Failed";
    default:
      return update.status;
  }
}

export function formatCreatedDate(iso: string | undefined | null): string {
  if (!iso?.trim()) return "Not recorded";
  return formatDisplayDate(iso);
}
