import type { Client, CoachingAction, Session } from "@/lib/types";
import { newestSession, sessionsChronological } from "@/lib/sessions";

export type ThemeFrequency = {
  theme: string;
  count: number;
};

export type ProgressSinceLastSession = {
  completedActions: CoachingAction[];
  unresolvedActions: CoachingAction[];
  notableChanges: string[];
};

/** A session counts as completed when it holds coach-edited summary content. */
export function isCompletedSession(session: Session): boolean {
  return Boolean(
    session.summary.trim() ||
      session.professionalIdentityDevelopment.trim() ||
      session.agreedActions.trim() ||
      session.emergingThemes.trim()
  );
}

/** Newest chronological session — treated as the upcoming / draft session. */
export function currentDraftSession(sessions: Session[]): Session | undefined {
  return newestSession(sessions);
}

/** Most recent completed session before the current draft (evidence only). */
export function previousCompletedSession(sessions: Session[]): Session | undefined {
  const ordered = sessionsChronological(sessions);
  if (ordered.length === 0) return undefined;

  const draft = currentDraftSession(sessions);
  const candidates = [...ordered].reverse().filter(session => {
    if (draft && session.id === draft.id) return false;
    return isCompletedSession(session);
  });

  return candidates[0];
}

function splitThemeLines(value: string): string[] {
  return value
    .split(/\n|;|,/)
    .map(part => part.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter(Boolean);
}

/**
 * Themes that appear in emergingThemes across more than one session.
 * Ordered by frequency (highest first). Supported by stored session data only.
 */
export function recurringThemesFromSessions(sessions: Session[]): ThemeFrequency[] {
  const counts = new Map<string, { label: string; count: number }>();

  for (const session of sessions) {
    const themes = splitThemeLines(session.emergingThemes);
    const seenInSession = new Set<string>();

    for (const theme of themes) {
      const key = theme.toLowerCase();
      if (seenInSession.has(key)) continue;
      seenInSession.add(key);

      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { label: theme, count: 1 });
      }
    }
  }

  return [...counts.values()]
    .filter(item => item.count >= 2)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map(item => ({ theme: item.label, count: item.count }));
}

function fieldChanged(previous: string, draft: string, label: string): string | undefined {
  const prior = previous.trim();
  const next = draft.trim();
  if (!prior || !next || prior === next) return undefined;
  return `${label} changed from “${prior}” to “${next}”.`;
}

/**
 * Compare previous completed session with current draft using stored fields only.
 * Actions come from client_items status; notable changes require explicit field differences.
 */
export function progressSinceLastSession(
  client: Client,
  previous: Session | undefined,
  draft: Session | undefined
): ProgressSinceLastSession {
  const completedActions = client.actions.filter(action => action.status === "Complete");
  const unresolvedActions = client.actions.filter(action => action.status !== "Complete");
  const notableChanges: string[] = [];

  if (previous && draft) {
    const focusChange = fieldChanged(previous.focus, draft.focus, "Session focus");
    if (focusChange) notableChanges.push(focusChange);

    if (previous.professionalIdentityDevelopment.trim()) {
      notableChanges.push(previous.professionalIdentityDevelopment.trim());
    }

    if (previous.agreedActions.trim() && draft.preparation.trim()) {
      notableChanges.push(
        `Previous agreed actions: ${previous.agreedActions.trim()}. Draft preparation notes are recorded.`
      );
    } else if (previous.agreedActions.trim()) {
      notableChanges.push(`Previous agreed actions: ${previous.agreedActions.trim()}`);
    }

    if (
      draft.notes.trim() &&
      draft.notes.trim() !== previous.notes.trim()
    ) {
      notableChanges.push("Draft session notes differ from the previous session notes.");
    }
  } else if (previous?.professionalIdentityDevelopment.trim()) {
    notableChanges.push(previous.professionalIdentityDevelopment.trim());
  }

  return { completedActions, unresolvedActions, notableChanges };
}

function toReminderPhrase(prefix: "revisit" | "explore", value: string): string {
  const cleaned = value.replace(/^[-•*\d.)\s]+/, "").replace(/\.$/, "").trim();
  if (!cleaned) return "";
  const rest = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  return `${prefix} ${rest}`;
}

/**
 * Concise coach reminders derived only from stored previous-session evidence.
 * Never diagnoses or speculates.
 */
export function coachRemindersFromEvidence(
  previous: Session | undefined,
  outstandingActions: CoachingAction[],
  recurringThemes: ThemeFrequency[]
): string[] {
  const reminders: string[] = [];
  const seen = new Set<string>();

  function add(reminder: string) {
    const key = reminder.toLowerCase();
    if (!reminder.trim() || seen.has(key)) return;
    seen.add(key);
    reminders.push(reminder.trim());
  }

  if (previous?.suggestedFocus.trim()) {
    for (const line of previous.suggestedFocus.split(/\n/).map(part => part.trim()).filter(Boolean)) {
      add(toReminderPhrase("explore", line));
    }
  }

  if (previous?.agreedActions.trim()) {
    add("review previous commitment");
  }

  for (const action of outstandingActions.slice(0, 2)) {
    add(toReminderPhrase("revisit", action.title));
  }

  for (const { theme } of recurringThemes.slice(0, 3)) {
    add(toReminderPhrase("revisit", theme));
  }

  if (previous?.coachReflection.trim()) {
    const firstLine = previous.coachReflection
      .split(/\n/)
      .map(line => line.trim())
      .find(Boolean);
    if (firstLine) {
      const cleaned = firstLine.replace(/\.$/, "");
      if (/^(revisit|explore|review)\b/i.test(cleaned)) {
        add(cleaned);
      } else {
        add(toReminderPhrase("revisit", cleaned));
      }
    }
  }

  return reminders.slice(0, 6);
}

/** Evidence payload for the existing coaching-questions AI route. */
export function openingQuestionNotes(
  previous: Session | undefined,
  outstandingActions: CoachingAction[],
  recurringThemes: ThemeFrequency[]
): string {
  if (!previous) {
    return "";
  }

  const parts: string[] = [
    "Use only the evidence below from previous coaching sessions.",
    "Generate questions that reference previous progress and encourage reflection.",
    "Do not make assumptions beyond this evidence.",
    "",
    `Previous session number: ${previous.sessionNumber}`,
  ];

  if (previous.date.trim()) parts.push(`Previous session date: ${previous.date}`);
  if (previous.focus.trim()) parts.push(`Previous session focus: ${previous.focus}`);
  if (previous.summary.trim()) parts.push(`Edited session summary:\n${previous.summary.trim()}`);
  if (previous.professionalIdentityDevelopment.trim()) {
    parts.push(
      `Professional identity development:\n${previous.professionalIdentityDevelopment.trim()}`
    );
  }
  if (previous.agreedActions.trim()) {
    parts.push(`Agreed actions:\n${previous.agreedActions.trim()}`);
  }
  if (previous.suggestedFocus.trim()) {
    parts.push(`Suggested focus for next session:\n${previous.suggestedFocus.trim()}`);
  }
  if (previous.emergingThemes.trim()) {
    parts.push(`Emerging themes:\n${previous.emergingThemes.trim()}`);
  }

  if (outstandingActions.length > 0) {
    parts.push(
      `Outstanding actions:\n${outstandingActions.map(action => `- ${action.title} (${action.status})`).join("\n")}`
    );
  }

  if (recurringThemes.length > 0) {
    parts.push(
      `Recurring themes across sessions:\n${recurringThemes
        .map(item => `- ${item.theme} (${item.count} sessions)`)
        .join("\n")}`
    );
  }

  return parts.join("\n");
}

export function parseCoachingQuestions(text: string): string[] {
  return text
    .split("\n")
    .map(line => line.match(/^\d+\.\s*(.+)$/)?.[1]?.trim())
    .filter((question): question is string => Boolean(question));
}

export function clientSnapshot(client: Client, draft: Session | undefined, previous: Session | undefined) {
  return {
    name: client.name,
    currentSessionNumber: draft?.sessionNumber,
    previousSessionDate: previous?.date?.trim() || undefined,
    upcomingSessionDate: client.nextSession.trim() || draft?.date?.trim() || undefined,
    currentCoachingFocus:
      client.currentFocus.trim() || draft?.focus.trim() || previous?.suggestedFocus.trim() || undefined,
  };
}
