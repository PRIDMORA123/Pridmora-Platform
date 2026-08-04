import type { Client, Session } from "@/lib/types";
import {
  approvedSessions,
  buildProfessionalIdentityJourney,
  type ProfessionalIdentityJourney,
} from "@/lib/journey";
import { formatSessionHistoryDate } from "@/lib/sessions";
import { relationshipPublicIdentity } from "@/lib/relationship-identity";

export type ReportType = "progress" | "final";

export type ReportPeriodMode = "all" | "date-range" | "selected";

export type ReportPeriodSelection = {
  mode: ReportPeriodMode;
  dateFrom?: string;
  dateTo?: string;
  sessionIds?: string[];
};

export type ReportPrivacyOptions = {
  includeClientName: boolean;
  includeCoachName: boolean;
  includeSessionDates: boolean;
  includeOutstandingCommitments: boolean;
  includeCoachCommentary: boolean;
  /**
   * When true and the coach has direct access, include the private real name
   * on a named export. Defaults false — confidential identity is preferred.
   */
  includePrivateName?: boolean;
};

export const DEFAULT_REPORT_PRIVACY: ReportPrivacyOptions = {
  includeClientName: true,
  includeCoachName: true,
  includeSessionDates: true,
  includeOutstandingCommitments: true,
  includeCoachCommentary: true,
  includePrivateName: false,
};

/** Default privacy for confidential relationships — public label/reference only. */
export function defaultReportPrivacyForClient(client: {
  identityMode?: string | null;
}): ReportPrivacyOptions {
  if (client.identityMode === "confidential") {
    return {
      ...DEFAULT_REPORT_PRIVACY,
      includeClientName: true, // uses display label / reference via report identity helper
      includePrivateName: false,
    };
  }
  return { ...DEFAULT_REPORT_PRIVACY, includePrivateName: false };
}

export const DEMO_COACH_DISPLAY_NAME = "Coach";

export type ReportThemeItem = {
  theme: string;
  frequency: number;
  description: string;
  sessionRefs: string[];
};

export type ReportStrengthItem = {
  label: string;
  sessionsObserved: number;
  example: string;
  sessionRef: string;
};

export type ReportValueItem = {
  label: string;
  sessionsObserved: number;
  example: string;
  sessionRefs: string[];
};

export type ReportMilestoneItem = {
  title: string;
  sessionNumber: number;
  date: string;
  detail: string;
};

/**
 * Editable coaching report draft — every section is coach-controlled before export.
 * Coach commentary is never AI-generated.
 */
export type CoachingReportDraft = {
  reportType: ReportType;
  clientName: string;
  coachName: string;
  reportPeriodLabel: string;
  sessionCount: number;
  dateGenerated: string;
  selectedSessionIds: string[];
  coachingContext: string;
  professionalIdentityDevelopment: string;
  keyThemes: ReportThemeItem[];
  strengthsDeveloped: ReportStrengthItem[];
  valuesEmerging: ReportValueItem[];
  /** Coach-edited Values Emerging narrative (overrides structured list when set). */
  valuesSectionText: string;
  progressAndMilestones: ReportMilestoneItem[];
  outstandingDevelopmentAreas: string;
  suggestedNextFocus: string[];
  coachCommentary: string;
};

export type CoachingReportAiEvidence = {
  sessionNumber: number;
  date: string;
  focus: string;
  summary: string;
  professionalIdentityDevelopment: string;
  strengthsObserved: string;
  valuesBecomingVisible: string;
  emergingThemes: string;
  agreedActions: string;
  suggestedFocus: string;
  coachReflection: string;
};

const VALUES_INTRO =
  "The coaching record suggests that the following values have been important across the selected sessions:";

const NEXT_FOCUS_PREFIX = "Possible next focus:";

/** Parse display dates such as "15 Jul 2026" or ISO dates for range filtering. */
export function parseSessionDateValue(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed || /schedule|not scheduled|today/i.test(trimmed)) return null;

  const iso = Date.parse(trimmed);
  if (!Number.isNaN(iso)) {
    const date = new Date(iso);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  const match = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;

  const parsed = Date.parse(`${match[2]} ${match[1]}, ${match[3]}`);
  if (Number.isNaN(parsed)) return null;
  const date = new Date(parsed);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseInputDate(value: string | undefined): Date | null {
  if (!value?.trim()) return null;
  const date = new Date(`${value.trim()}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Select approved sessions only for the chosen report period.
 * Unapproved sessions are never included.
 */
export function selectApprovedSessionsForReport(
  sessions: Session[],
  period: ReportPeriodSelection
): Session[] {
  const approved = approvedSessions(sessions);

  if (period.mode === "all") return approved;

  if (period.mode === "selected") {
    const ids = new Set(period.sessionIds ?? []);
    return approved.filter(session => ids.has(session.id));
  }

  const from = parseInputDate(period.dateFrom);
  const to = parseInputDate(period.dateTo);

  return approved.filter(session => {
    const sessionDate = parseSessionDateValue(session.date);
    if (!sessionDate) {
      // Sessions without a parseable date are excluded from date-range reports.
      return false;
    }
    if (from && sessionDate < from) return false;
    if (to && sessionDate > to) return false;
    return true;
  });
}

export function formatReportPeriodLabel(
  sessions: Session[],
  period: ReportPeriodSelection
): string {
  if (sessions.length === 0) {
    if (period.mode === "date-range" && period.dateFrom && period.dateTo) {
      return `${period.dateFrom} to ${period.dateTo}`;
    }
    return "No approved sessions selected";
  }

  const first = sessions[0];
  const last = sessions[sessions.length - 1];
  const firstDate = first.date.trim() || `Session ${first.sessionNumber}`;
  const lastDate = last.date.trim() || `Session ${last.sessionNumber}`;

  if (period.mode === "selected") {
    return `Selected sessions ${sessions.map(s => s.sessionNumber).join(", ")} (${firstDate} – ${lastDate})`;
  }

  if (period.mode === "date-range" && period.dateFrom && period.dateTo) {
    return `${period.dateFrom} to ${period.dateTo}`;
  }

  if (firstDate === lastDate) return firstDate;
  return `${firstDate} – ${lastDate}`;
}

export function reportTypeLabel(type: ReportType): string {
  return type === "final" ? "Final Coaching Report" : "Progress Report";
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

function sessionRef(session: Session, includeDate = true): string {
  const datePart = includeDate && session.date.trim() ? ` · ${session.date.trim()}` : "";
  return `Session ${session.sessionNumber}${datePart}`;
}

/** Recurring themes with frequency and supporting session references. */
export function buildReportThemes(sessions: Session[]): ReportThemeItem[] {
  const map = new Map<
    string,
    { theme: string; frequency: number; sessionRefs: string[]; examples: string[] }
  >();

  for (const session of sessions) {
    const themes = splitLines(session.emergingThemes);
    const seen = new Set<string>();

    for (const theme of themes) {
      const key = normalizeKey(theme);
      if (seen.has(key)) continue;
      seen.add(key);

      const existing = map.get(key);
      const ref = sessionRef(session);
      if (existing) {
        existing.frequency += 1;
        if (!existing.sessionRefs.includes(ref)) existing.sessionRefs.push(ref);
        if (!existing.examples.includes(theme)) existing.examples.push(theme);
      } else {
        map.set(key, {
          theme,
          frequency: 1,
          sessionRefs: [ref],
          examples: [theme],
        });
      }
    }
  }

  return [...map.values()]
    .filter(item => item.frequency >= 2)
    .sort((a, b) => b.frequency - a.frequency || a.theme.localeCompare(b.theme))
    .map(item => ({
      theme: item.theme,
      frequency: item.frequency,
      description: `Recorded across ${item.frequency} approved sessions.`,
      sessionRefs: item.sessionRefs,
    }));
}

function buildStrengths(journey: ProfessionalIdentityJourney): ReportStrengthItem[] {
  return journey.strengthsDeveloping.map(item => {
    const latestCitation = item.citations[item.citations.length - 1] || "";
    return {
      label: item.label,
      sessionsObserved: item.sessionNumbers.length,
      example: item.latestExample,
      sessionRef: latestCitation || `Session ${item.sessionNumbers[item.sessionNumbers.length - 1]}`,
    };
  });
}

function buildValues(journey: ProfessionalIdentityJourney): ReportValueItem[] {
  return journey.valuesEmerging.map(item => ({
    label: item.label,
    sessionsObserved: item.sessionNumbers.length,
    example: item.latestExample,
    sessionRefs: item.citations,
  }));
}

function buildMilestones(journey: ProfessionalIdentityJourney): ReportMilestoneItem[] {
  return journey.coachingMilestones.map(item => ({
    title: item.title,
    sessionNumber: item.sessionNumber,
    date: item.date,
    detail: item.detail,
  }));
}

/**
 * Evidence-based identity development narrative from Journey data.
 * Clearly separates client-reported identity, completed actions, and possible patterns.
 */
export function buildIdentityDevelopmentSection(
  journey: ProfessionalIdentityJourney,
  sessions: Session[]
): string {
  const parts: string[] = [];

  if (journey.currentProfessionalIdentity) {
    parts.push(`Current professional identity (from the coaching record):\n${journey.currentProfessionalIdentity}`);
  } else {
    parts.push(
      "Current professional identity: not enough approved session evidence was available to summarise identity for this period."
    );
  }

  if (journey.identityEvolution.length > 0) {
    const evolutionLines = journey.identityEvolution.map(
      event =>
        `• Session ${event.sessionNumber}${event.date ? ` (${event.date})` : ""}: ${event.title}`
    );
    parts.push(
      `Development evolution evidenced across approved sessions:\n${evolutionLines.join("\n")}`
    );
  } else {
    parts.push(
      "Development evolution: no meaningful development shifts were recorded across the selected approved sessions."
    );
  }

  const completedActions = sessions
    .flatMap(session =>
      splitLines(session.agreedActions).map(
        line => `${line} (Session ${session.sessionNumber}${session.date ? ` · ${session.date}` : ""})`
      )
    )
    .slice(0, 8);

  if (completedActions.length > 0) {
    parts.push(
      `Actions recorded as completed or agreed in selected sessions:\n${completedActions.map(line => `• ${line}`).join("\n")}`
    );
  }

  if (journey.coachInsights.length > 0) {
    const insightLines = journey.coachInsights.map(insight => {
      const body = insight.text.replace(/^Possible observation:\s*/i, "").trim();
      const ref =
        insight.sessionNumber != null
          ? ` (Session ${insight.sessionNumber}${insight.date ? ` · ${insight.date}` : ""})`
          : "";
      return `• Possible pattern identified by AI: ${body}${ref}`;
    });
    parts.push(
      `Possible patterns identified from the coaching record (not clinical conclusions):\n${insightLines.join("\n")}`
    );
  }

  return parts.join("\n\n");
}

function buildOutstandingAreas(
  journey: ProfessionalIdentityJourney,
  sessions: Session[]
): string {
  const parts: string[] = [];

  if (journey.openCommitments.length > 0) {
    parts.push(
      "Unresolved commitments recorded in the coaching record:\n" +
        journey.openCommitments.map(item => {
          const ref =
            item.sessionNumber != null
              ? ` (Session ${item.sessionNumber})`
              : item.source
                ? ` (${item.source})`
                : "";
          return `• ${item.title}${ref}`;
        }).join("\n")
    );
  } else {
    parts.push("Unresolved commitments: none recorded for the selected period.");
  }

  const themes = buildReportThemes(sessions);
  if (themes.length > 0) {
    parts.push(
      "Recurring themes the client may wish to continue exploring:\n" +
        themes
          .slice(0, 5)
          .map(theme => `• ${theme.theme} (noted in ${theme.frequency} sessions)`)
          .join("\n")
    );
  }

  const suggested = sessions
    .flatMap(session => splitLines(session.suggestedFocus))
    .filter(Boolean);
  const uniqueSuggested = [...new Map(suggested.map(item => [normalizeKey(item), item])).values()];

  if (uniqueSuggested.length > 0) {
    parts.push(
      "Areas noted for further exploration in session records:\n" +
        uniqueSuggested.slice(0, 5).map(item => `• ${item}`).join("\n")
    );
  }

  parts.push(
    "These points are drawn from the coaching record to support a review conversation. They are not diagnoses, weakness assessments, or mandatory recommendations."
  );

  return parts.join("\n\n");
}

/** Fallback coaching context when AI is unavailable — still factual and period-based. */
export function buildFallbackCoachingContext(sessions: Session[], periodLabel: string): string {
  if (sessions.length === 0) {
    return `This report summarises the coaching journey recorded between ${periodLabel}. No approved sessions were available for this period.`;
  }

  const focuses = sessions
    .map(session => session.focus.trim())
    .filter(Boolean)
    .slice(0, 6);

  const focusText =
    focuses.length > 0
      ? ` Session focus areas recorded include: ${focuses.join("; ")}.`
      : " Session focus areas were not consistently recorded.";

  return (
    `This report summarises the coaching journey recorded between ${periodLabel}. ` +
    `It is based on ${sessions.length} approved coaching session${sessions.length === 1 ? "" : "s"} only.${focusText} ` +
    `No organisational context or coaching objectives have been invented beyond the approved session record.`
  );
}

export function normalizeSuggestedNextFocus(items: string[]): string[] {
  return items
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map(item =>
      item.toLowerCase().startsWith(NEXT_FOCUS_PREFIX.toLowerCase())
        ? item.replace(/^possible next focus:\s*/i, `${NEXT_FOCUS_PREFIX} `).trim()
        : `${NEXT_FOCUS_PREFIX} ${item}`
    );
}

export function buildFallbackNextFocus(sessions: Session[]): string[] {
  const fromSuggested = sessions
    .flatMap(session => splitLines(session.suggestedFocus))
    .filter(Boolean);

  const unique = [...new Map(fromSuggested.map(item => [normalizeKey(item), item])).values()];
  if (unique.length > 0) return normalizeSuggestedNextFocus(unique.slice(0, 3));

  const themes = buildReportThemes(sessions);
  if (themes.length > 0) {
    return normalizeSuggestedNextFocus(
      themes.slice(0, 3).map(theme => `Continue exploring the recurring theme of ${theme.theme}.`)
    );
  }

  return normalizeSuggestedNextFocus([
    "Review progress against agreed actions recorded in the selected sessions.",
  ]);
}

export function coachingReportAiEvidence(sessions: Session[]): CoachingReportAiEvidence[] {
  return sessions.map(session => ({
    sessionNumber: session.sessionNumber,
    date: session.date.trim(),
    focus: session.focus.trim(),
    summary: session.summary.trim(),
    professionalIdentityDevelopment: session.professionalIdentityDevelopment.trim(),
    strengthsObserved: session.strengthsObserved.trim(),
    valuesBecomingVisible: session.valuesBecomingVisible.trim(),
    emergingThemes: session.emergingThemes.trim(),
    agreedActions: session.agreedActions.trim(),
    suggestedFocus: session.suggestedFocus.trim(),
    coachReflection: session.coachReflection.trim(),
  }));
}

/**
 * Build the deterministic report draft from approved selected sessions + Journey data.
 * AI fields (context / next focus) can be overlaid after generation.
 */
export function buildCoachingReportDraft(input: {
  client: Client;
  reportType: ReportType;
  period: ReportPeriodSelection;
  coachName?: string;
  coachingContext?: string;
  suggestedNextFocus?: string[];
  /** Explicit named export — private real name when coach has approved. */
  privateRealName?: string | null;
  includePrivateName?: boolean;
}): CoachingReportDraft {
  const selected = selectApprovedSessionsForReport(input.client.sessions, input.period);
  const scopedClient: Client = { ...input.client, sessions: selected };
  const journey = buildProfessionalIdentityJourney(scopedClient);
  const periodLabel = formatReportPeriodLabel(selected, input.period);
  const dateGenerated = formatSessionHistoryDate();

  const valuesEmerging = buildValues(journey);
  const publicIdentity = relationshipPublicIdentity(input.client);

  let clientName = publicIdentity.displayName;
  if (publicIdentity.identityMode === "confidential") {
    const parts = [
      publicIdentity.confidentialReference,
      publicIdentity.displayLabel,
    ].filter(Boolean);
    clientName = parts.join(" · ") || publicIdentity.displayName;
    if (
      input.includePrivateName &&
      input.privateRealName?.trim()
    ) {
      clientName = input.privateRealName.trim();
    }
  } else if (
    input.includePrivateName &&
    input.privateRealName?.trim()
  ) {
    clientName = input.privateRealName.trim();
  }

  return {
    reportType: input.reportType,
    clientName,
    coachName: input.coachName?.trim() || DEMO_COACH_DISPLAY_NAME,
    reportPeriodLabel: periodLabel,
    sessionCount: selected.length,
    dateGenerated,
    selectedSessionIds: selected.map(session => session.id),
    coachingContext:
      input.coachingContext?.trim() || buildFallbackCoachingContext(selected, periodLabel),
    professionalIdentityDevelopment: buildIdentityDevelopmentSection(journey, selected),
    keyThemes: buildReportThemes(selected),
    strengthsDeveloped: buildStrengths(journey),
    valuesEmerging,
    valuesSectionText: formatValuesSectionText(valuesEmerging),
    progressAndMilestones: buildMilestones(journey),
    outstandingDevelopmentAreas: buildOutstandingAreas(journey, selected),
    suggestedNextFocus:
      input.suggestedNextFocus && input.suggestedNextFocus.length > 0
        ? normalizeSuggestedNextFocus(input.suggestedNextFocus)
        : buildFallbackNextFocus(selected),
    coachCommentary: "",
  };
}

export function formatValuesSectionText(values: ReportValueItem[]): string {
  if (values.length === 0) {
    return `${VALUES_INTRO}\n\nNo values were supported by repeated evidence across the selected approved sessions.`;
  }

  const lines = values.map(
    item =>
      `• ${item.label} — observed in ${item.sessionsObserved} session${item.sessionsObserved === 1 ? "" : "s"} (${item.sessionRefs.join("; ")}). Example: ${item.example}`
  );

  return `${VALUES_INTRO}\n\n${lines.join("\n")}`;
}

export { VALUES_INTRO, NEXT_FOCUS_PREFIX };
