import type { Client, CoachingAction, Session } from "@/lib/types";
import { recurringThemesFromSessions, type ThemeFrequency } from "@/lib/prepare-session";
import { sessionsChronological } from "@/lib/sessions";
import { prepareVisibleText } from "@/lib/visible-text";

export type JourneyEvidenceItem = {
  label: string;
  sessionNumbers: number[];
  citations: string[];
  /** Most recent supporting line from an approved session. */
  latestExample: string;
};

export type JourneyTimelineEvent = {
  sessionId: string;
  sessionNumber: number;
  date: string;
  title: string;
  detail: string;
};

export type JourneyMilestone = {
  sessionId: string;
  sessionNumber: number;
  date: string;
  title: string;
  detail: string;
};

export type JourneyCommitment = {
  id: string;
  title: string;
  source: string;
  status?: string;
  /** Originating session when known — enables click-through. */
  sessionId?: string;
  sessionNumber?: number;
};

export type JourneyInsight = {
  id: string;
  text: string;
  sessionNumber?: number;
  date?: string;
};

/**
 * Development Journey — derived at read time from approved sessions.
 * Legacy internal module name retained for compatibility.
 * Never invents progression; never duplicates session rows.
 */
export type ProfessionalIdentityJourney = {
  currentProfessionalIdentity: string | null;
  identityEvolution: JourneyTimelineEvent[];
  strengthsDeveloping: JourneyEvidenceItem[];
  valuesEmerging: JourneyEvidenceItem[];
  recurringThemes: ThemeFrequency[];
  coachingMilestones: JourneyMilestone[];
  openCommitments: JourneyCommitment[];
  coachInsights: JourneyInsight[];
  approvedSessionCount: number;
};

/** Evidence excerpt passed to the Journey AI route — approved fields only. */
export type JourneyAiEvidence = {
  sessionNumber: number;
  date: string;
  focus: string;
  professionalIdentityDevelopment: string;
  strengthsObserved: string;
  valuesBecomingVisible: string;
  emergingThemes: string;
  agreedActions: string;
  coachReflection: string;
};

export const IDENTITY_PREFIX = "Based on coaching conversations to date...";
export const POSSIBLE_OBSERVATION_PREFIX = "Possible observation:";

/** Sessions the coach has approved for the permanent coaching record. */
export function approvedSessions(sessions: Session[]): Session[] {
  return sessionsChronological(sessions).filter(session => session.aiSummaryApproved === true);
}

function splitLines(value: string): string[] {
  return value
    .split(/\n|;|,/)
    .map(part => part.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter(Boolean);
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function aggregateEvidence(
  sessions: Session[],
  field: "strengthsObserved" | "valuesBecomingVisible",
  options?: { minSessions?: number }
): JourneyEvidenceItem[] {
  const minSessions = options?.minSessions ?? 1;
  const map = new Map<
    string,
    { label: string; sessionNumbers: number[]; citations: string[]; latestExample: string; latestNumber: number }
  >();

  for (const session of sessions) {
    const items = splitLines(session[field]);
    const seen = new Set<string>();

    for (const item of items) {
      const key = normalizeKey(item);
      if (seen.has(key)) continue;
      seen.add(key);

      const existing = map.get(key);
      const citation = `Session ${session.sessionNumber}${session.date ? ` · ${session.date}` : ""}`;
      if (existing) {
        if (!existing.sessionNumbers.includes(session.sessionNumber)) {
          existing.sessionNumbers.push(session.sessionNumber);
        }
        if (!existing.citations.includes(citation)) {
          existing.citations.push(citation);
        }
        if (session.sessionNumber >= existing.latestNumber) {
          existing.latestExample = item;
          existing.latestNumber = session.sessionNumber;
          existing.label = item;
        }
      } else {
        map.set(key, {
          label: item,
          sessionNumbers: [session.sessionNumber],
          citations: [citation],
          latestExample: item,
          latestNumber: session.sessionNumber,
        });
      }
    }
  }

  return [...map.values()]
    .filter(item => item.sessionNumbers.length >= minSessions)
    .sort(
      (a, b) =>
        b.sessionNumbers.length - a.sessionNumbers.length || a.label.localeCompare(b.label)
    )
    .map(({ label, sessionNumbers, citations, latestExample }) => ({
      label,
      sessionNumbers,
      citations,
      latestExample,
    }));
}

/**
 * Vertical timeline of meaningful identity shifts only.
 * A session is included when its identity text differs from the previous included entry.
 */
function identityEvolutionTimeline(sessions: Session[]): JourneyTimelineEvent[] {
  const withIdentity = sessions.filter(session => session.professionalIdentityDevelopment.trim());
  const events: JourneyTimelineEvent[] = [];
  let previousKey = "";

  for (const session of withIdentity) {
    const detail = session.professionalIdentityDevelopment.trim();
    const key = normalizeKey(detail);
    if (key === previousKey) continue;
    previousKey = key;

    const firstSentence =
      detail.split(/(?<=[.!?])\s+/)[0]?.trim() ||
      detail.slice(0, 120).trim();

    events.push({
      sessionId: session.id,
      sessionNumber: session.sessionNumber,
      date: session.date.trim() || `Session ${session.sessionNumber}`,
      title: firstSentence,
      detail,
    });
  }

  return events;
}

/**
 * Evidence-based milestones from agreed actions and identity development lines.
 * Prefer concrete action/achievement lines over repeating full identity paragraphs.
 */
function coachingMilestones(sessions: Session[]): JourneyMilestone[] {
  const milestones: JourneyMilestone[] = [];

  for (const session of sessions) {
    const actionLines = splitLines(session.agreedActions);
    const identity = session.professionalIdentityDevelopment.trim();

    if (actionLines.length > 0) {
      for (const line of actionLines) {
        milestones.push({
          sessionId: session.id,
          sessionNumber: session.sessionNumber,
          date: session.date.trim() || `Session ${session.sessionNumber}`,
          title: line,
          detail: `Recorded in Session ${session.sessionNumber}${session.date ? ` · ${session.date}` : ""}.`,
        });
      }
      continue;
    }

    if (identity) {
      const firstSentence =
        identity.split(/(?<=[.!?])\s+/)[0]?.trim() || identity.slice(0, 140).trim();
      milestones.push({
        sessionId: session.id,
        sessionNumber: session.sessionNumber,
        date: session.date.trim() || `Session ${session.sessionNumber}`,
        title: firstSentence,
        detail: identity,
      });
    }
  }

  return milestones;
}

function openCommitmentsFromClientActions(actions: CoachingAction[]): JourneyCommitment[] {
  return actions
    .filter(action => action.status !== "Complete")
    .map(action => ({
      id: action.id,
      title: action.title,
      source: "Client action",
      status: action.status,
    }));
}

/**
 * Unresolved agreed-action lines from approved sessions that are not already
 * represented by an open/in-progress client action title.
 * Every session with agreed actions is considered (not only the latest).
 */
function openCommitmentsFromSessions(
  sessions: Session[],
  existingTitles: Set<string>
): JourneyCommitment[] {
  const commitments: JourneyCommitment[] = [];
  const seen = new Set(existingTitles);

  for (const session of sessions) {
    const lines = splitLines(session.agreedActions);
    lines.forEach((line, index) => {
      const key = normalizeKey(line);
      if (seen.has(key)) return;
      seen.add(key);
      commitments.push({
        id: `${session.id}-commitment-${index}`,
        title: line,
        source: `Session ${session.sessionNumber}`,
        sessionId: session.id,
        sessionNumber: session.sessionNumber,
      });
    });
  }

  return commitments;
}

/**
 * Up to three evidence-based insights from coach reflections.
 * Always prefixed with "Possible observation:" — never presented as facts.
 */
function coachInsightsFromSessions(sessions: Session[]): JourneyInsight[] {
  const insights: JourneyInsight[] = [];
  for (const session of [...sessions].reverse()) {
    const raw = prepareVisibleText(session.coachReflection);
    if (!raw) continue;
    const text = raw.startsWith(POSSIBLE_OBSERVATION_PREFIX)
      ? raw
      : `${POSSIBLE_OBSERVATION_PREFIX}\n${raw}`;
    insights.push({
      id: `${session.id}-insight`,
      text,
      sessionNumber: session.sessionNumber,
      date: session.date.trim() || undefined,
    });
    if (insights.length >= 3) break;
  }
  return insights;
}

/**
 * Deterministic current-identity paragraph from approved identity fields.
 * Prefixed as required; truncated toward ~150 words. AI may refine later.
 */
export function buildCurrentIdentityParagraph(sessions: Session[]): string | null {
  const withIdentity = sessions.filter(s => s.professionalIdentityDevelopment.trim());
  if (withIdentity.length === 0) return null;

  const latest = withIdentity[withIdentity.length - 1];
  const body = latest.professionalIdentityDevelopment.trim();
  const words = body.split(/\s+/).filter(Boolean);
  const clipped =
    words.length > 140 ? `${words.slice(0, 140).join(" ")}…` : words.join(" ");

  if (clipped.startsWith(IDENTITY_PREFIX)) return clipped;
  return `${IDENTITY_PREFIX} ${clipped}`;
}

/** Structured evidence for the Journey AI route (approved sessions only). */
export function journeyAiEvidence(sessions: Session[]): JourneyAiEvidence[] {
  return approvedSessions(sessions).map(session => ({
    sessionNumber: session.sessionNumber,
    date: session.date.trim(),
    focus: session.focus.trim(),
    professionalIdentityDevelopment: session.professionalIdentityDevelopment.trim(),
    strengthsObserved: session.strengthsObserved.trim(),
    valuesBecomingVisible: session.valuesBecomingVisible.trim(),
    emergingThemes: session.emergingThemes.trim(),
    agreedActions: session.agreedActions.trim(),
    coachReflection: session.coachReflection.trim(),
  }));
}

/**
 * Build the Development Journey for a client from approved sessions only.
 * Legacy function name retained for compatibility.
 * Call after each approved Save Session — the view recomputes; nothing is duplicated in storage.
 */
export function buildProfessionalIdentityJourney(client: Client): ProfessionalIdentityJourney {
  const approved = approvedSessions(client.sessions);
  const evolution = identityEvolutionTimeline(approved);

  const fromActions = openCommitmentsFromClientActions(client.actions);
  const existingTitles = new Set(fromActions.map(item => normalizeKey(item.title)));
  const fromSessions = openCommitmentsFromSessions(approved, existingTitles);

  return {
    currentProfessionalIdentity: buildCurrentIdentityParagraph(approved),
    identityEvolution: evolution,
    strengthsDeveloping: aggregateEvidence(approved, "strengthsObserved"),
    valuesEmerging: aggregateEvidence(approved, "valuesBecomingVisible", { minSessions: 2 }),
    recurringThemes: recurringThemesFromSessions(approved),
    coachingMilestones: coachingMilestones(approved),
    openCommitments: [...fromActions, ...fromSessions],
    coachInsights: coachInsightsFromSessions(approved),
    approvedSessionCount: approved.length,
  };
}
