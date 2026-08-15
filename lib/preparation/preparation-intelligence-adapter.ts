/**
 * Preparation Intelligence adapter.
 *
 * Translates trusted developmental signals into conversation-ready preparation
 * inputs. Does not render Development Intelligence cards or invent a third
 * intelligence model.
 *
 * Temporal rule: Session N may only consume approved-session summaries,
 * commitments and pattern evidence originating before Session N.
 */

import {
  buildProfileCurrentPosition,
  buildProfileDevelopmentTrajectory,
} from "@/lib/development-evidence/compose-headline-intelligence";
import { formatProfileForPrompt } from "@/lib/ai/development-update-prompt";
import type {
  CommitmentEntry,
  DevelopmentProfile,
  ProfileEntry,
  ProfileEntryStatus,
} from "@/lib/development-updates/types";
import type { CoachingPattern } from "@/lib/patterns/types";
import { distinctSessionIds } from "@/lib/patterns/evidence";
import type { Client, CoachingAction, Session } from "@/lib/types";

const DEMONSTRATED: ReadonlySet<ProfileEntryStatus> = new Set([
  "supported",
  "well_established",
]);

export type PreparationAdapterPattern = {
  title: string;
  description: string;
};

export type PreparationAdapterContext = {
  /** Genuine first conversation for the relationship (not sessionNumber alone). */
  isFirstSession: boolean;
  /**
   * Preparing a historical session while later approved sessions already exist.
   * Living profile must not be treated as as-of-Session-N truth.
   */
  isHistoricalPreparation: boolean;
  primaryFocusSuggestion: string;
  areasToExplore: string[];
  questions: string[];
  previousCommitment: string | null;
  relevantPatterns: PreparationAdapterPattern[];
  presentPositionSupport: string | null;
  nextFocus: string | null;
  movementSummary: string | null;
  /** Bounded text blocks for the existing AI preparation prompt. */
  prompt: {
    coachingPurpose: string;
    currentFocus: string;
    developmentProfile: string;
    previousSessions: string;
    latestConversation: string;
    commitments: string;
    preparationContext: string;
  };
};

function entryValues(entries: ProfileEntry[] | undefined): string[] {
  return (entries ?? [])
    .map(entry => entry.value.trim())
    .filter(Boolean);
}

function entriesWithStatus(
  entries: ProfileEntry[] | undefined,
  statuses: ReadonlySet<ProfileEntryStatus>
): string[] {
  return (entries ?? [])
    .filter(entry => statuses.has(entry.status))
    .map(entry => entry.value.trim())
    .filter(Boolean);
}

export function isApprovedSession(session: Session): boolean {
  return (
    session.summaryStatus === "approved" ||
    session.aiSummaryApproved === true
  );
}

/** Approved sessions strictly before the preparation session number. */
export function approvedSessionsBefore(
  sessions: Session[],
  beforeSessionNumber: number
): Session[] {
  return [...sessions]
    .filter(
      session =>
        isApprovedSession(session) &&
        session.sessionNumber > 0 &&
        session.sessionNumber < beforeSessionNumber
    )
    .sort((a, b) => b.sessionNumber - a.sessionNumber);
}

export function buildSessionNumberMap(
  sessions: Array<Pick<Session, "id" | "sessionNumber">>
): Map<string, number> {
  const map = new Map<string, number>();
  for (const session of sessions) {
    if (session.id && session.sessionNumber > 0) {
      map.set(session.id, session.sessionNumber);
    }
  }
  return map;
}

/**
 * True when later approved coaching already exists at or after this session
 * number (e.g. regenerating Session 1 after Session 2 was approved).
 */
export function isHistoricalSessionPreparation(
  sessions: Session[],
  current: Pick<Session, "id" | "sessionNumber">
): boolean {
  return sessions.some(
    session =>
      session.id !== current.id &&
      isApprovedSession(session) &&
      session.sessionNumber >= current.sessionNumber
  );
}

export function profileHasMeaningfulIntelligence(
  profile: DevelopmentProfile | null | undefined
): boolean {
  if (!profile) return false;
  return (
    Boolean(profile.currentFocus?.trim()) ||
    entryValues(profile.strengths).length > 0 ||
    entryValues(profile.emergingThemes).length > 0 ||
    entryValues(profile.growthAreas).length > 0 ||
    entryValues(profile.patterns).length > 0 ||
    (profile.commitments ?? []).some(
      (item: CommitmentEntry) =>
        item.status === "open" && Boolean(item.value.trim())
    ) ||
    (profile.coachingPatterns ?? []).some(
      pattern =>
        !pattern.suppressed &&
        pattern.coachAccepted === true &&
        (pattern.strength === "emerging" || pattern.strength === "established")
    )
  );
}

/**
 * Meaningful prior approved coaching evidence for the relationship.
 * Used instead of sessionNumber <= 1.
 */
export function hasMeaningfulPriorCoachingEvidence(input: {
  sessions: Session[];
  profile?: DevelopmentProfile | null;
}): boolean {
  if (input.sessions.some(isApprovedSession)) return true;
  return profileHasMeaningfulIntelligence(input.profile);
}

/**
 * Genuine first-session / contracting preparation.
 * False when the relationship already has approved coaching evidence or
 * meaningful applied profile intelligence — even if Session 1 is reopened.
 */
export function isGenuineFirstSessionPreparation(input: {
  sessions: Session[];
  profile?: DevelopmentProfile | null;
}): boolean {
  return !hasMeaningfulPriorCoachingEvidence(input);
}

/**
 * Pattern evidence is usable for Session N only when every session-linked
 * evidence point is strictly before N. Patterns with no session ids are
 * excluded from preparation (cannot prove temporal safety).
 */
export function patternEvidenceIsBeforeSession(
  pattern: CoachingPattern,
  sessionNumbers: Map<string, number>,
  beforeSessionNumber: number
): boolean {
  const ids = distinctSessionIds(pattern.evidence);
  if (ids.length === 0) return false;
  return ids.every(id => {
    const number = sessionNumbers.get(id);
    return typeof number === "number" && number < beforeSessionNumber;
  });
}

export function isReviewedPatternForPrepare(pattern: CoachingPattern): boolean {
  if (pattern.suppressed) return false;
  if (pattern.coachAccepted === false) return false;
  if (pattern.status === "resolved") return false;
  if (pattern.strength !== "emerging" && pattern.strength !== "established") {
    return false;
  }
  // Require explicit coach acceptance — unreviewed hypotheses stay out of Prepare.
  return pattern.coachAccepted === true && pattern.coachReviewed === true;
}

/**
 * Open commitments originating before Session N.
 * Session-linked actions must map to sessionNumber < N.
 * Undated actions are only allowed when this is not a historical regenerate
 * (no later approved sessions), to avoid leaking later work backwards.
 */
export function selectCommitmentsForPrepare(input: {
  actions: CoachingAction[];
  sessions: Session[];
  currentSessionId: string;
  beforeSessionNumber: number;
  allowUndatedOpenActions?: boolean;
}): string[] {
  const sessionNumbers = buildSessionNumberMap(input.sessions);
  const allowUndated = input.allowUndatedOpenActions !== false;
  const result: string[] = [];
  const seen = new Set<string>();

  const openActions = input.actions.filter(
    action => action.status !== "Complete" && action.title.trim()
  );

  for (const action of openActions) {
    if (action.sessionId === input.currentSessionId) continue;
    const sessionId = action.sessionId?.trim() || "";
    if (sessionId) {
      const number = sessionNumbers.get(sessionId);
      if (typeof number !== "number" || number >= input.beforeSessionNumber) {
        continue;
      }
    } else if (!allowUndated) {
      continue;
    }

    const key = action.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(action.title.trim());
  }

  return result.slice(0, 5);
}

function formatSessionBlock(session: Session): string {
  return [
    `Conversation ${session.sessionNumber}`,
    `Date: ${session.date || session.completedAt || "unknown"}`,
    session.focus ? `Focus: ${session.focus}` : "",
    session.summary ? `Approved summary: ${session.summary}` : "",
    session.professionalIdentityDevelopment
      ? `Key learning: ${session.professionalIdentityDevelopment}`
      : "",
    session.emergingThemes ? `Themes: ${session.emergingThemes}` : "",
    session.commitments || session.agreedActions
      ? `Commitments: ${session.commitments || session.agreedActions}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function conciseFocusFromSignals(input: {
  commitment: string | null;
  nextFocus: string | null;
  priority: string | null;
  movement: string | null;
}): string {
  if (input.commitment) {
    return `Revisit the open commitment: ${input.commitment.replace(/\.$/, "")}.`;
  }
  if (input.priority) {
    const text = input.priority.trim();
    if (text.length <= 120 && !/[.!?]$/.test(text)) {
      return `Explore ${text.charAt(0).toLowerCase()}${text.slice(1)}.`;
    }
    return text.length > 140 ? `${text.slice(0, 137).trim()}…` : text;
  }
  if (input.nextFocus) {
    const focus = input.nextFocus.trim();
    // Prefer a shorter framing than copying a long Next Focus sentence wholesale.
    const sentence = focus.match(/^(.+?[.!?])(?:\s|$)/);
    const first = (sentence?.[1] ?? focus).trim();
    if (first.length <= 140) return first;
    return `${first.slice(0, 137).trim()}…`;
  }
  if (input.movement) {
    const sentence = input.movement.match(/^(.+?[.!?])(?:\s|$)/);
    return (sentence?.[1] ?? input.movement).trim();
  }
  return "Attend to the most useful developmental edge supported by reviewed evidence before this conversation.";
}

function continuingQuestions(input: {
  commitment: string | null;
  priority: string | null;
  nextFocus: string | null;
}): string[] {
  const questions: string[] = [];
  if (input.commitment) {
    questions.push(
      "What progress has been possible on the open commitment since it was agreed?"
    );
  }
  if (input.priority) {
    questions.push(
      "What would be most useful to clarify about the current development priority?"
    );
  }
  if (input.nextFocus) {
    questions.push(
      "Where does the next development focus feel most alive in day-to-day work?"
    );
  }
  questions.push(
    "What would make this conversation useful given where development currently stands?"
  );
  return Array.from(new Set(questions)).slice(0, 4);
}

function firstSessionQuestions(): string[] {
  return [
    "What would you most like this coaching space to help you with?",
    "What is currently most important in your role?",
    "How would you like us to work together, including pace and level of challenge?",
    "If this coaching relationship were valuable for you, what would be different by the end of it?",
  ];
}

function firstSessionAreas(role: string): string[] {
  const areas = [
    "Current responsibilities and priorities",
    "Immediate opportunities, challenges or decisions to think through",
    "Preferred ways of working, including confidentiality, pace and level of challenge",
  ];
  if (role.trim()) {
    areas[0] = `Current responsibilities and priorities in the ${role.trim()} role`;
  }
  return areas;
}

/**
 * Build bounded preparation context for UI + AI generation.
 */
export function buildPreparationAdapterContext(input: {
  client: Pick<
    Client,
    "name" | "role" | "currentFocus" | "actions" | "sessions"
  >;
  currentSession: Pick<Session, "id" | "sessionNumber">;
  profile?: DevelopmentProfile | null;
  patterns?: CoachingPattern[];
}): PreparationAdapterContext {
  const sessions = input.client.sessions ?? [];
  const before = input.currentSession.sessionNumber;
  const priorSessions = approvedSessionsBefore(sessions, before);
  const isHistorical = isHistoricalSessionPreparation(
    sessions,
    input.currentSession
  );
  const isFirstSession = isGenuineFirstSessionPreparation({
    sessions,
    profile: input.profile,
  });
  const sessionNumbers = buildSessionNumberMap(sessions);
  const allowUndated = !isHistorical;

  const commitmentsFromActions = selectCommitmentsForPrepare({
    actions: input.client.actions ?? [],
    sessions,
    currentSessionId: input.currentSession.id,
    beforeSessionNumber: before,
    allowUndatedOpenActions: allowUndated,
  });

  // When actions are not loaded (e.g. API generate path), fall back to
  // commitment text recorded on approved sessions before N.
  const commitmentsFromSessions =
    commitmentsFromActions.length > 0
      ? []
      : priorSessions
          .map(session =>
            (session.commitments || session.agreedActions || "").trim()
          )
          .filter(Boolean);

  const commitments =
    commitmentsFromActions.length > 0
      ? commitmentsFromActions
      : commitmentsFromSessions;
  const previousCommitment = commitments[0] ?? null;

  const reviewedPatterns = (input.patterns ?? input.profile?.coachingPatterns ?? [])
    .filter(isReviewedPatternForPrepare)
    .filter(pattern =>
      patternEvidenceIsBeforeSession(pattern, sessionNumbers, before)
    )
    .slice(0, 2)
    .map(pattern => ({
      title: pattern.title.trim(),
      description: pattern.description.trim(),
    }))
    .filter(item => item.title);

  const includeLivingProfile = !isFirstSession && !isHistorical;
  const profile = includeLivingProfile ? input.profile : null;

  const themes = entryValues(profile?.emergingThemes).slice(0, 4);
  const growthAreas = entryValues(profile?.growthAreas).slice(0, 4);
  const demonstrated = entriesWithStatus(profile?.strengths, DEMONSTRATED).slice(
    0,
    4
  );
  const emergingStrengths = entriesWithStatus(
    profile?.strengths,
    new Set<ProfileEntryStatus>(["emerging"])
  ).slice(0, 4);
  const behaviouralPatterns = entryValues(profile?.patterns).slice(0, 4);
  const nextFocus =
    (includeLivingProfile ? profile?.currentFocus?.trim() : "") ||
    (!isHistorical ? input.client.currentFocus?.trim() : "") ||
    null;

  const presentPositionSupport =
    includeLivingProfile && profile
      ? buildProfileCurrentPosition({
          demonstratedStrengths: demonstrated,
          themes,
          behaviouralPatterns,
          growthAreas,
        })
      : null;

  const movementSummary =
    includeLivingProfile && profile
      ? buildProfileDevelopmentTrajectory({
          demonstratedStrengths: demonstrated,
          emergingStrengths,
          themes,
          growthAreas,
          establishedPatterns: reviewedPatterns.length > 0 ? 1 : 0,
          emergingPatterns: 0,
        })
      : priorSessions[0]?.professionalIdentityDevelopment?.trim() ||
        priorSessions[0]?.emergingThemes?.trim() ||
        null;

  const priority = growthAreas[0] || themes[0] || null;

  let primaryFocusSuggestion: string;
  let areasToExplore: string[];
  let questions: string[];

  if (isFirstSession) {
    const purpose =
      input.client.currentFocus?.trim() ||
      profile?.currentFocus?.trim() ||
      "";
    primaryFocusSuggestion = purpose
      ? purpose
      : `Support ${input.client.name.split(/\s+/)[0] || "the person"} to define a clear coaching purpose, identify current priorities, and agree how progress will be recognised.`;
    areasToExplore = firstSessionAreas(input.client.role || "");
    questions = firstSessionQuestions();
  } else if (isHistorical && priorSessions.length === 0) {
    primaryFocusSuggestion =
      "Prepare using only evidence that was available before this conversation. Later conversations have since advanced the living development record.";
    areasToExplore = [
      "What was known and agreed at the time of this conversation",
      "What remains useful to notice without importing later evidence",
    ];
    questions = [
      "What mattered most for this conversation at the time?",
      "What should remain bounded to evidence available before this session?",
    ];
  } else {
    primaryFocusSuggestion = conciseFocusFromSignals({
      commitment: previousCommitment,
      nextFocus,
      priority,
      movement: movementSummary,
    });
    areasToExplore = [
      previousCommitment
        ? `Progress on: ${previousCommitment}`
        : "",
      movementSummary
        ? "Recent developmental movement"
        : "",
      priority || "",
      reviewedPatterns[0]?.title
        ? `Pattern in view: ${reviewedPatterns[0].title}`
        : "",
    ]
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (areasToExplore.length === 0 && nextFocus) {
      areasToExplore = [nextFocus];
    }
    questions = continuingQuestions({
      commitment: previousCommitment,
      priority,
      nextFocus,
    });
  }

  const latest = priorSessions[0] ?? null;
  const previousSessionsText = priorSessions
    .slice(0, 6)
    .map(formatSessionBlock)
    .join("\n\n");

  const latestConversation = latest ? formatSessionBlock(latest) : "";

  const coachingPurpose = isFirstSession
    ? input.client.currentFocus?.trim() || ""
    : includeLivingProfile
      ? profile?.currentFocus?.trim() ||
        input.client.currentFocus?.trim() ||
        ""
      : "";

  const developmentProfile =
    includeLivingProfile && profile
      ? formatProfileForPrompt(profile)
      : "No as-of-session development profile is supplied for this preparation (temporal boundary).";

  const preparationContext = [
    `Preparation mode: ${
      isFirstSession
        ? "genuine first session"
        : isHistorical
          ? "historical session (later evidence excluded)"
          : "continuing relationship"
    }`,
    previousCommitment
      ? `Open commitment to revisit: ${previousCommitment}`
      : "Open commitment to revisit: none before this session.",
    movementSummary ? `Recent movement: ${movementSummary}` : "",
    priority ? `Current priority/edge: ${priority}` : "",
    nextFocus ? `Next development focus: ${nextFocus}` : "",
    presentPositionSupport
      ? `Present position (supporting context): ${presentPositionSupport}`
      : "",
    reviewedPatterns.length > 0
      ? `Reviewed patterns:\n${reviewedPatterns
          .map(item => `- ${item.title}: ${item.description}`)
          .join("\n")}`
      : "Reviewed patterns: none eligible before this session.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    isFirstSession,
    isHistoricalPreparation: isHistorical,
    primaryFocusSuggestion,
    areasToExplore,
    questions,
    previousCommitment,
    relevantPatterns: reviewedPatterns,
    presentPositionSupport,
    nextFocus,
    movementSummary,
    prompt: {
      coachingPurpose,
      currentFocus: includeLivingProfile
        ? nextFocus || coachingPurpose
        : coachingPurpose,
      developmentProfile,
      previousSessions: previousSessionsText,
      latestConversation,
      commitments: commitments.join("\n") || previousCommitment || "",
      preparationContext,
    },
  };
}
