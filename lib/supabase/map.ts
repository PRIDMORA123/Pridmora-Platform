import type {
  ActionStatus,
  Client,
  ClientStatus,
  CoachingAction,
  JourneyEvent,
  Session,
  Strength,
  StrengthStage,
  ValueItem,
} from "@/lib/types";
import {
  extractVisibleCoachNotes,
  parseLegacyWorkflowPayload,
  type LegacyWorkflowPayload,
} from "@/lib/coach-notes";
import { normalizeSession } from "@/lib/sessions";
import {
  parsePreparationAiBrief,
  type PreparationAiBrief,
} from "@/lib/preparation-brief";
import {
  parseCoachingIntelligenceMode,
  parseCoachingIntelligenceStatus,
  parseIntelligenceSources,
} from "@/lib/coaching-intelligence/mode";
import {
  isPreparationStyle,
  parsePreparationStyleOverride,
  type PreparationStyle,
} from "@/lib/preparation-style";
import {
  parseAgreement,
  parseInitialConversation,
  parseSupportingContext,
} from "@/lib/relationship-meta";
import { parseIdentityMode } from "@/lib/relationship-identity";

export type ClientRow = {
  id: string;
  coach_id: string;
  organisation_id?: string | null;
  name: string;
  organisation: string | null;
  role: string | null;
  email: string | null;
  identity_mode?: string | null;
  confidential_reference?: string | null;
  display_label?: string | null;
  ai_name_allowed?: boolean | null;
  status: string;
  archived_at?: string | null;
  archived_by?: string | null;
  next_session: string | null;
  next_session_label: string | null;
  current_focus: string | null;
  identity_summary: string | null;
  coach_insight: string | null;
  preparation_style_override?: string | null;
  relationship_agreement?: unknown;
  initial_conversation?: unknown;
  supporting_context?: unknown;
  is_self_development?: boolean | null;
  initials: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SessionRow = {
  id: string;
  client_id: string;
  coach_id: string;
  organisation_id?: string | null;
  session_number: number;
  session_date: string | null;
  display_date: string | null;
  display_time: string | null;
  starts_at: string | null;
  status?: string | null;
  title?: string | null;
  duration_minutes?: number | null;
  location?: string | null;
  completed_at?: string | null;
  notes_saved_at?: string | null;
  summary_status?: string | null;
  focus: string | null;
  preparation: string | null;
  prep_purpose?: string | null;
  prep_topics?: string | null;
  prep_questions?: string | null;
  prep_commitments_review?: string | null;
  prep_risks?: string | null;
  prep_private_notes?: string | null;
  prep_ai_brief?: PreparationAiBrief | Record<string, unknown> | null;
  prep_ai_brief_generated_at?: string | null;
  prep_ai_brief_style?: string | null;
  prep_ai_brief_confirmed_at?: string | null;
  prep_ai_brief_source_fingerprint?: string | null;
  intelligence_mode?: string | null;
  intelligence_status?: string | null;
  intelligence_sources?: unknown;
  intelligence_last_refreshed_at?: string | null;
  intelligence_error_code?: string | null;
  notes: string | null;
  commitments?: string | null;
  parking_lot?: string | null;
  timer_elapsed_seconds?: number | null;
  timer_started_at?: string | null;
  session_started_at?: string | null;
  private_notes: string | null;
  reflect_what_shifted?: string | null;
  reflect_what_surprised?: string | null;
  reflect_what_worked?: string | null;
  reflect_differently?: string | null;
  reflect_professional_learning?: string | null;
  reflect_private?: string | null;
  ai_draft_summary: string | null;
  emerging_themes: string | null;
  strengths_observed: string | null;
  values_becoming_visible: string | null;
  professional_identity_development: string | null;
  agreed_actions: string | null;
  outcomes?: string | null;
  suggested_focus: string | null;
  coach_reflection: string | null;
  coaching_questions: string | null;
  ai_summary_approved: boolean | null;
  reflection: string | null;
  summary: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ClientItemRow = {
  id: string;
  client_id: string;
  coach_id: string;
  session_id?: string | null;
  item_type: "strength" | "value" | "theme" | "goal" | "action" | "quote" | "journey";
  title: string;
  detail: string | null;
  owner?: string | null;
  status: string | null;
  evidence: string | null;
  event_date: string | null;
  created_at?: string;
};

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "NC";
  return parts
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? "")
    .join("");
}

function asClientStatus(
  value: string | null | undefined,
  archivedAt?: string | null
): ClientStatus {
  if (archivedAt) return "Archived";
  if (value === "Paused" || value === "Archived" || value === "Active") return value;
  return "Active";
}

function asStrengthStage(value: string | null | undefined): StrengthStage {
  if (value === "Emerging" || value === "Developing" || value === "Established") return value;
  return "Emerging";
}

function asActionStatus(value: string | null | undefined): ActionStatus {
  if (value === "Open" || value === "In progress" || value === "Complete") return value;
  return "Open";
}

function encodeActionDetail(owner?: string, notes?: string): string | null {
  const ownerText = owner?.trim() ?? "";
  const notesText = notes?.trim() ?? "";
  if (!ownerText && !notesText) return null;
  if (!ownerText) return notesText;
  return `OWNER:${ownerText}\n${notesText}`.trim();
}

function decodeActionDetail(detail: string | null | undefined): {
  owner?: string;
  notes?: string;
} {
  if (!detail?.trim()) return {};
  const match = detail.match(/^OWNER:([^\n]*)\n?([\s\S]*)$/);
  if (!match) return { notes: detail };
  return {
    owner: match[1]?.trim() || undefined,
    notes: match[2]?.trim() || undefined,
  };
}

function parseCoachingQuestions(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map(item => String(item).trim()).filter(Boolean);
    }
  } catch {
    // Fall through to newline parsing for plain-text storage.
  }
  return value
    .split("\n")
    .map(line => line.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
}

export function serializeCoachingQuestions(questions: string[] | undefined): string | null {
  if (!questions || questions.length === 0) return null;
  return JSON.stringify(questions);
}

function formatSessionDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatSessionTime(startsAt: string | null): string | null {
  if (!startsAt) return null;
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function toDateColumn(displayDate: string): string | null {
  const trimmed = displayDate.trim();
  if (!trimmed || /schedule|not scheduled|today/i.test(trimmed)) return null;

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }

  const match = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;

  const trial = Date.parse(`${match[2]} ${match[1]}, ${match[3]}`);
  if (Number.isNaN(trial)) return null;
  return new Date(trial).toISOString().slice(0, 10);
}

function toStartsAt(displayDate: string, displayTime: string): string | null {
  const datePart = toDateColumn(displayDate);
  const timeMatch = displayTime.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!datePart || !timeMatch) return null;

  const hours = timeMatch[1].padStart(2, "0");
  const minutes = timeMatch[2];
  const iso = `${datePart}T${hours}:${minutes}:00`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/** Build a client next-session label from a scheduled session. */
export function toNextSessionLabel(session: Pick<Session, "date" | "time">): string {
  const date = session.date.trim();
  const time = session.time.trim();
  if (date && time) return `${date}, ${time}`;
  if (date) return date;
  return "Not scheduled";
}

function stripWorkflowEnvelope(value: string | null | undefined): {
  text: string;
  envelope: LegacyWorkflowPayload | null;
} {
  return {
    text: extractVisibleCoachNotes(value),
    envelope: parseLegacyWorkflowPayload(value),
  };
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string {
  for (const value of values) {
    const cleaned = extractVisibleCoachNotes(value);
    if (cleaned) return cleaned;
  }
  return "";
}

function toNextSessionTimestamp(label: string): string | null {
  const trimmed = label.trim();
  if (!trimmed || /not scheduled/i.test(trimmed)) return null;

  const todayMatch = trimmed.match(/^Today,\s*(\d{1,2}):(\d{2})$/i);
  if (todayMatch) {
    const now = new Date();
    now.setHours(Number(todayMatch[1]), Number(todayMatch[2]), 0, 0);
    return now.toISOString();
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return null;
}

export function sessionToRow(
  session: Session,
  coachId: string,
  organisationId?: string | null
): Omit<SessionRow, "created_at"> {
  // Persist human text and workflow fields separately.
  // Never append IDENTITY_WORKFLOW envelopes into coach-facing text columns.
  const preparationText = extractVisibleCoachNotes(
    session.preparation || buildPreparationFallback(session)
  );
  const privateNotesText = extractVisibleCoachNotes(
    session.reflectPrivate || session.reflection || ""
  );
  const prepPrivateNotes = extractVisibleCoachNotes(session.prepPrivateNotes);
  const aiSummary = extractVisibleCoachNotes(session.summary) || null;
  const summaryStatus =
    session.summaryStatus === "approved" || session.aiSummaryApproved
      ? "approved"
      : session.summaryStatus;

  return {
    id: session.id,
    client_id: session.clientId,
    coach_id: coachId,
    ...(organisationId ? { organisation_id: organisationId } : {}),
    session_number: session.sessionNumber,
    session_date: toDateColumn(session.date),
    display_date: session.date || null,
    display_time: session.time || null,
    starts_at: toStartsAt(session.date, session.time),
    status: session.status || "planned",
    title: extractVisibleCoachNotes(session.title) || null,
    duration_minutes: session.durationMinutes || 60,
    location: extractVisibleCoachNotes(session.location) || null,
    completed_at: session.completedAt || null,
    notes_saved_at: session.notesSavedAt || null,
    summary_status: summaryStatus,
    focus: extractVisibleCoachNotes(session.focus || session.title) || null,
    preparation: preparationText || null,
    prep_purpose: extractVisibleCoachNotes(session.prepPurpose) || null,
    prep_topics: extractVisibleCoachNotes(session.prepTopics) || null,
    prep_questions: extractVisibleCoachNotes(session.prepQuestions) || null,
    prep_commitments_review:
      extractVisibleCoachNotes(session.prepCommitmentsReview) || null,
    prep_risks: extractVisibleCoachNotes(session.prepRisks) || null,
    prep_private_notes: prepPrivateNotes || null,
    prep_ai_brief: session.prepAiBrief || null,
    prep_ai_brief_generated_at: session.prepAiBriefGeneratedAt || null,
    prep_ai_brief_style: session.prepAiBriefStyle || null,
    prep_ai_brief_confirmed_at: session.prepAiBriefConfirmedAt || null,
    prep_ai_brief_source_fingerprint: session.prepAiBriefSourceFingerprint || null,
    intelligence_mode: session.intelligenceMode || null,
    intelligence_status: session.intelligenceStatus || "idle",
    intelligence_sources: session.intelligenceSources ?? [],
    intelligence_last_refreshed_at: session.intelligenceLastRefreshedAt || null,
    intelligence_error_code: session.intelligenceErrorCode || null,
    notes: extractVisibleCoachNotes(session.notes) || null,
    commitments: extractVisibleCoachNotes(session.commitments) || null,
    parking_lot: extractVisibleCoachNotes(session.parkingLot) || null,
    timer_elapsed_seconds: Math.max(0, Math.floor(session.timerElapsedSeconds || 0)),
    timer_started_at: session.timerStartedAt || null,
    session_started_at: session.sessionStartedAt || null,
    private_notes: privateNotesText || null,
    reflect_what_shifted:
      extractVisibleCoachNotes(session.reflectWhatShifted) || null,
    reflect_what_surprised:
      extractVisibleCoachNotes(session.reflectWhatSurprised) || null,
    reflect_what_worked:
      extractVisibleCoachNotes(session.reflectWhatWorked) || null,
    reflect_differently:
      extractVisibleCoachNotes(session.reflectDifferently) || null,
    reflect_professional_learning:
      extractVisibleCoachNotes(session.reflectProfessionalLearning) || null,
    reflect_private: privateNotesText || null,
    ai_draft_summary: aiSummary,
    emerging_themes: extractVisibleCoachNotes(session.emergingThemes) || null,
    strengths_observed:
      extractVisibleCoachNotes(session.strengthsObserved) || null,
    values_becoming_visible:
      extractVisibleCoachNotes(session.valuesBecomingVisible) || null,
    professional_identity_development:
      extractVisibleCoachNotes(session.professionalIdentityDevelopment) || null,
    agreed_actions: extractVisibleCoachNotes(session.agreedActions) || null,
    outcomes: extractVisibleCoachNotes(session.outcomes) || null,
    suggested_focus: extractVisibleCoachNotes(session.suggestedFocus) || null,
    coach_reflection: extractVisibleCoachNotes(session.coachReflection) || null,
    coaching_questions: serializeCoachingQuestions(session.coachingQuestions),
    ai_summary_approved: summaryStatus === "approved",
    reflection: privateNotesText || null,
    summary: aiSummary,
    updated_at: session.lastUpdated || new Date().toISOString(),
  };
}

function buildPreparationFallback(session: Session): string {
  const purpose = extractVisibleCoachNotes(session.prepPurpose);
  const topics = extractVisibleCoachNotes(session.prepTopics);
  const questions = extractVisibleCoachNotes(session.prepQuestions);
  const commitments = extractVisibleCoachNotes(session.prepCommitmentsReview);
  const outcome = extractVisibleCoachNotes(session.prepRisks);
  const notes = extractVisibleCoachNotes(session.prepPrivateNotes);

  const blocks: string[] = [];
  if (purpose) blocks.push(`Purpose\n${purpose}`);
  if (topics) blocks.push(`Topics\n${topics}`);
  if (questions) blocks.push(`Questions\n${questions}`);
  if (commitments) blocks.push(`Previous commitments\n${commitments}`);
  if (outcome) blocks.push(`Desired outcome\n${outcome}`);
  if (notes) blocks.push(`Private notes\n${notes}`);
  return blocks.join("\n\n");
}

export function rowToSession(row: SessionRow, index: number, total: number): Session {
  const preparationParsed = stripWorkflowEnvelope(row.preparation);
  const privateParsed = stripWorkflowEnvelope(row.private_notes ?? row.reflection);
  const prepPrivateParsed = stripWorkflowEnvelope(row.prep_private_notes);
  const envelope = {
    ...(privateParsed.envelope ?? {}),
    ...(preparationParsed.envelope ?? {}),
    ...(prepPrivateParsed.envelope ?? {}),
  };

  // Prefer dedicated columns. Use legacy envelope only to fill empty structured fields.
  const reflectPrivate = firstNonEmpty(
    row.reflect_private,
    envelope.reflectPrivate,
    privateParsed.text
  );

  return normalizeSession(
    {
      id: row.id,
      clientId: row.client_id,
      coachId: row.coach_id,
      sessionNumber: row.session_number,
      title: firstNonEmpty(row.title, envelope.title),
      date: row.display_date || formatSessionDate(row.session_date) || "",
      time: row.display_time || formatSessionTime(row.starts_at) || "",
      durationMinutes: row.duration_minutes ?? envelope.durationMinutes ?? 60,
      location: firstNonEmpty(row.location, envelope.location),
      status: (row.status as Session["status"]) || envelope.status || undefined,
      focus: extractVisibleCoachNotes(row.focus),
      preparation: preparationParsed.text,
      prepPurpose: firstNonEmpty(row.prep_purpose, envelope.prepPurpose),
      prepTopics: firstNonEmpty(row.prep_topics, envelope.prepTopics),
      prepQuestions: firstNonEmpty(row.prep_questions, envelope.prepQuestions),
      prepCommitmentsReview: firstNonEmpty(
        row.prep_commitments_review,
        envelope.prepCommitmentsReview
      ),
      prepRisks: firstNonEmpty(row.prep_risks, envelope.prepRisks),
      prepPrivateNotes: firstNonEmpty(
        prepPrivateParsed.text,
        envelope.prepPrivateNotes
      ),
      prepAiBrief: parsePreparationAiBrief(row.prep_ai_brief),
      prepAiBriefGeneratedAt: row.prep_ai_brief_generated_at ?? "",
      prepAiBriefStyle: (isPreparationStyle(row.prep_ai_brief_style)
        ? row.prep_ai_brief_style
        : "") as PreparationStyle | "",
      prepAiBriefConfirmedAt: row.prep_ai_brief_confirmed_at ?? "",
      prepAiBriefSourceFingerprint: row.prep_ai_brief_source_fingerprint ?? "",
      intelligenceMode: row.intelligence_mode
        ? parseCoachingIntelligenceMode(row.intelligence_mode, "assisted")
        : "",
      intelligenceStatus: parseCoachingIntelligenceStatus(
        row.intelligence_status,
        "idle"
      ),
      intelligenceSources: parseIntelligenceSources(row.intelligence_sources),
      intelligenceLastRefreshedAt: row.intelligence_last_refreshed_at ?? "",
      intelligenceErrorCode: row.intelligence_error_code ?? "",
      notes: extractVisibleCoachNotes(row.notes),
      commitments: firstNonEmpty(row.commitments, envelope.commitments),
      parkingLot: firstNonEmpty(row.parking_lot, envelope.parkingLot),
      notesSavedAt: row.notes_saved_at ?? envelope.notesSavedAt ?? "",
      timerElapsedSeconds:
        typeof row.timer_elapsed_seconds === "number" &&
        Number.isFinite(row.timer_elapsed_seconds)
          ? Math.max(0, Math.floor(row.timer_elapsed_seconds))
          : 0,
      timerStartedAt: row.timer_started_at ?? null,
      sessionStartedAt: row.session_started_at ?? null,
      reflection: reflectPrivate,
      reflectWhatShifted: firstNonEmpty(
        row.reflect_what_shifted,
        envelope.reflectWhatShifted
      ),
      reflectWhatSurprised: firstNonEmpty(
        row.reflect_what_surprised,
        envelope.reflectWhatSurprised
      ),
      reflectWhatWorked: firstNonEmpty(
        row.reflect_what_worked,
        envelope.reflectWhatWorked
      ),
      reflectDifferently: firstNonEmpty(
        row.reflect_differently,
        envelope.reflectDifferently
      ),
      reflectProfessionalLearning: firstNonEmpty(
        row.reflect_professional_learning,
        envelope.reflectProfessionalLearning
      ),
      reflectPrivate,
      summary: extractVisibleCoachNotes(row.ai_draft_summary ?? row.summary),
      emergingThemes: extractVisibleCoachNotes(row.emerging_themes),
      strengthsObserved: extractVisibleCoachNotes(row.strengths_observed),
      valuesBecomingVisible: extractVisibleCoachNotes(row.values_becoming_visible),
      professionalIdentityDevelopment: extractVisibleCoachNotes(
        row.professional_identity_development
      ),
      agreedActions: extractVisibleCoachNotes(row.agreed_actions),
      outcomes: firstNonEmpty(row.outcomes, envelope.outcomes),
      suggestedFocus: extractVisibleCoachNotes(row.suggested_focus),
      coachReflection: extractVisibleCoachNotes(row.coach_reflection),
      summaryStatus:
        (row.summary_status as Session["summaryStatus"]) ||
        envelope.summaryStatus ||
        undefined,
      aiSummaryApproved:
        row.ai_summary_approved === true ||
        row.summary_status === "approved" ||
        envelope.summaryStatus === "approved" ||
        (row.ai_summary_approved == null &&
          Boolean(
            extractVisibleCoachNotes(row.ai_draft_summary ?? row.summary)
          )),
      coachingQuestions: parseCoachingQuestions(row.coaching_questions),
      completedAt: row.completed_at ?? envelope.completedAt ?? "",
      lastUpdated: row.updated_at ?? "",
    },
    {
      clientId: row.client_id,
      coachId: row.coach_id,
      index,
      total,
    }
  );
}

export function clientToRow(client: Client, coachId: string): Omit<ClientRow, "created_at" | "updated_at"> {
  const archivedAt = client.archivedAt ?? null;
  const status =
    archivedAt || client.status === "Archived" ? "Archived" : client.status;

  return {
    id: client.id,
    coach_id: coachId,
    name: client.name,
    organisation: client.organisation || null,
    role: client.role || null,
    email: client.email.trim() || null,
    identity_mode: client.identityMode || "standard",
    confidential_reference: client.confidentialReference || null,
    display_label: client.displayLabel || null,
    ai_name_allowed: Boolean(client.aiNameAllowed),
    status,
    archived_at: archivedAt,
    next_session: toNextSessionTimestamp(client.nextSession),
    next_session_label: client.nextSession || null,
    current_focus: client.currentFocus || null,
    identity_summary: client.identitySummary || null,
    coach_insight: client.coachInsight || null,
    preparation_style_override: client.preparationStyleOverride,
    relationship_agreement: client.relationshipAgreement ?? null,
    initial_conversation: client.initialConversation ?? null,
    supporting_context: client.supportingContext ?? [],
    initials: client.initials || initialsFromName(client.name),
  };
}

export function clientItemsToRows(client: Client, coachId: string): Omit<ClientItemRow, "created_at">[] {
  const rows: Omit<ClientItemRow, "created_at">[] = [];

  for (const strength of client.strengths) {
    rows.push({
      id: strength.id,
      client_id: client.id,
      coach_id: coachId,
      item_type: "strength",
      title: strength.name,
      detail: null,
      status: strength.stage,
      evidence: strength.evidence,
      event_date: null,
    });
  }

  for (const value of client.values) {
    rows.push({
      id: value.id,
      client_id: client.id,
      coach_id: coachId,
      item_type: "value",
      title: value.name,
      detail: null,
      status: null,
      evidence: value.evidence,
      event_date: null,
    });
  }

  for (const [index, theme] of client.themes.entries()) {
    rows.push({
      id: `${client.id}-theme-${index}`,
      client_id: client.id,
      coach_id: coachId,
      item_type: "theme",
      title: theme,
      detail: null,
      status: null,
      evidence: null,
      event_date: null,
    });
  }

  for (const [index, goal] of client.goals.entries()) {
    rows.push({
      id: `${client.id}-goal-${index}`,
      client_id: client.id,
      coach_id: coachId,
      item_type: "goal",
      title: goal,
      detail: null,
      status: null,
      evidence: null,
      event_date: null,
    });
  }

  for (const action of client.actions) {
    rows.push({
      id: action.id,
      client_id: client.id,
      coach_id: coachId,
      session_id: action.sessionId ?? null,
      item_type: "action",
      title: action.title,
      detail: encodeActionDetail(action.owner, action.notes),
      owner: action.owner ?? null,
      status: action.status,
      // Legacy fallback when session_id column is absent.
      evidence: action.sessionId ?? null,
      event_date: action.due ?? null,
    });
  }

  for (const [index, quote] of client.quotes.entries()) {
    rows.push({
      id: `${client.id}-quote-${index}`,
      client_id: client.id,
      coach_id: coachId,
      item_type: "quote",
      title: quote,
      detail: null,
      status: null,
      evidence: null,
      event_date: null,
    });
  }

  for (const event of client.journey) {
    rows.push({
      id: event.id,
      client_id: client.id,
      coach_id: coachId,
      item_type: "journey",
      title: event.title,
      detail: event.detail,
      status: null,
      evidence: null,
      event_date: event.date,
    });
  }

  return rows;
}

function itemsToClientFields(items: ClientItemRow[]): Pick<
  Client,
  "strengths" | "values" | "themes" | "goals" | "actions" | "quotes" | "journey"
> {
  const strengths: Strength[] = [];
  const values: ValueItem[] = [];
  const themes: string[] = [];
  const goals: string[] = [];
  const actions: CoachingAction[] = [];
  const quotes: string[] = [];
  const journey: JourneyEvent[] = [];

  for (const item of items) {
    switch (item.item_type) {
      case "strength":
        strengths.push({
          id: item.id,
          name: item.title,
          stage: asStrengthStage(item.status),
          evidence: item.evidence ?? "",
        });
        break;
      case "value":
        values.push({
          id: item.id,
          name: item.title,
          evidence: item.evidence ?? "",
        });
        break;
      case "theme":
        themes.push(item.title);
        break;
      case "goal":
        goals.push(item.title);
        break;
      case "action": {
        const parsedDetail = decodeActionDetail(item.detail);
        const sessionFromEvidence =
          item.evidence &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            item.evidence
          )
            ? item.evidence
            : null;
        actions.push({
          id: item.id,
          title: item.title,
          status: asActionStatus(item.status),
          due: item.event_date ?? undefined,
          owner: item.owner ?? parsedDetail.owner,
          notes: parsedDetail.notes,
          clientId: item.client_id,
          sessionId: item.session_id ?? sessionFromEvidence,
        });
        break;
      }
      case "quote":
        quotes.push(item.title);
        break;
      case "journey":
        journey.push({
          id: item.id,
          date: item.event_date ?? "",
          title: item.title,
          detail: item.detail ?? "",
        });
        break;
    }
  }

  return { strengths, values, themes, goals, actions, quotes, journey };
}

export function assembleClient(
  row: ClientRow,
  sessions: SessionRow[],
  items: ClientItemRow[]
): Client {
  const orderedSessions = [...sessions].sort((a, b) => b.session_number - a.session_number);
  const mappedSessions = orderedSessions.map((session, index) =>
    rowToSession(session, index, orderedSessions.length)
  );
  const fields = itemsToClientFields(items);

  return {
    id: row.id,
    name: row.name,
    initials: row.initials || initialsFromName(row.name),
    organisation: row.organisation ?? "",
    role: row.role ?? "",
    email: row.email ?? "",
    identityMode: parseIdentityMode(row.identity_mode),
    displayLabel: row.display_label?.trim() || row.name,
    confidentialReference: row.confidential_reference?.trim() || null,
    aiNameAllowed: Boolean(row.ai_name_allowed),
    isSelfDevelopment: Boolean(row.is_self_development),
    status: asClientStatus(row.status, row.archived_at),
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at ?? "",
    nextSession: row.next_session_label || "Not scheduled",
    currentFocus: row.current_focus ?? "",
    identitySummary: row.identity_summary ?? "",
    coachInsight: row.coach_insight ?? "",
    preparationStyleOverride: parsePreparationStyleOverride(
      row.preparation_style_override
    ),
    relationshipAgreement: parseAgreement(row.relationship_agreement),
    initialConversation: parseInitialConversation(row.initial_conversation),
    supportingContext: parseSupportingContext(row.supporting_context),
    ...fields,
    sessions: mappedSessions,
  };
}
