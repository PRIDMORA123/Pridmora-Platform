import { apiJson } from "@/lib/api-client";
import { extractVisibleCoachNotes } from "@/lib/coach-notes";
import { parseDraftSummary } from "@/lib/sessions";
import { sessionDisplayTitle } from "@/lib/session-workflow";
import type { Client, Session, SessionStatus as AppSessionStatus } from "@/lib/types";
import type {
  CoachWorkspaceViewModel,
  CoachingCommitment,
  CoachingSupportAction,
  CoachingSupportResult,
  SessionStatus,
  SuggestedQuestion,
} from "@/types/coach-workspace";

export type PersistCoachSession = (session: Session) => Promise<Session>;

/** Temporary migration safeguard — strip legacy workflow blocks from notes. */
export function cleanLegacyCoachNotes(value: string | null | undefined): string {
  return extractVisibleCoachNotes(value);
}

export function secondsBetween(startedAt: string | null | undefined, now = Date.now()): number {
  if (!startedAt) return 0;
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((now - started) / 1000));
}

export function calculateDisplayedElapsed(
  storedElapsedSeconds: number,
  timerStartedAt: string | null | undefined,
  now = Date.now()
): number {
  return Math.max(0, Math.floor(storedElapsedSeconds || 0)) + secondsBetween(timerStartedAt, now);
}

export function toWorkspaceSessionStatus(status: AppSessionStatus): SessionStatus {
  switch (status) {
    case "prepared":
      return "prepared";
    case "planned":
      return "not_started";
    case "in_progress":
      return "in_progress";
    case "paused":
      return "paused";
    case "awaiting_completion":
    case "completed":
      return "completed";
  }
}

export function buildCoachWorkspaceViewModel(
  client: Client,
  session: Session,
  options?: { totalSessions?: number }
): CoachWorkspaceViewModel {
  const total = options?.totalSessions ?? Math.max(client.sessions.length, session.sessionNumber);
  const notes = cleanLegacyCoachNotes(session.notes);
  const elapsedSeconds = calculateDisplayedElapsed(
    session.timerElapsedSeconds,
    session.status === "in_progress" ? session.timerStartedAt : null
  );

  return {
    relationshipId: client.id,
    conversationId: session.id,
    client: {
      name: client.name,
      role: client.role || null,
      organisation: client.organisation || null,
    },
    conversation: {
      title: sessionDisplayTitle(session),
      sequenceLabel: `Session ${session.sessionNumber} of ${total}`,
      date: session.date || null,
      focus: session.focus?.trim() || null,
      status: toWorkspaceSessionStatus(session.status),
      notes,
      elapsedSeconds,
      timerStartedAt: session.timerStartedAt,
    },
    context: {
      commitments: buildOpenCommitments(client, session),
      insights: buildKeyInsights(client, session),
      suggestedQuestions: buildSuggestedQuestions(session),
    },
  };
}

function buildOpenCommitments(client: Client, session: Session): CoachingCommitment[] {
  const fromActions = client.actions
    .filter(
      action =>
        action.status !== "Complete" &&
        (!action.sessionId || action.sessionId === session.id || action.clientId === client.id)
    )
    .map(action => ({
      id: action.id,
      text: action.title,
      status: "open" as const,
    }));

  if (fromActions.length > 0) return fromActions.slice(0, 8);

  const lines = session.commitments
    .split(/\r?\n/)
    .map(line => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);

  return lines.map((text, index) => ({
    id: `commitment-${session.id}-${index}`,
    text,
    status: "open" as const,
  }));
}

function buildKeyInsights(client: Client, session: Session): string[] {
  const insights = [
    ...client.themes,
    client.coachInsight,
    session.emergingThemes,
  ]
    .flatMap(value =>
      typeof value === "string"
        ? value
            .split(/\r?\n|;/)
            .map(part => part.trim())
            .filter(Boolean)
        : []
    )
    .filter((value, index, all) => all.indexOf(value) === index);

  return insights.slice(0, 6);
}

function buildSuggestedQuestions(session: Session): SuggestedQuestion[] {
  if (session.coachingQuestions.length > 0) {
    return session.coachingQuestions.map((text, index) => ({
      id: `question-${session.id}-${index}`,
      text,
    }));
  }

  const fromPrep = session.prepQuestions
    .split(/\r?\n/)
    .map(line => line.replace(/^\d+\.\s*/, "").replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);

  return fromPrep.map((text, index) => ({
    id: `prep-question-${session.id}-${index}`,
    text,
  }));
}

type SessionMutationInput = {
  relationshipId: string;
  conversationId: string;
  session: Session;
  persist: PersistCoachSession;
};

async function persistSession(
  session: Session,
  persist: PersistCoachSession
): Promise<Session> {
  return persist({
    ...session,
    notes: cleanLegacyCoachNotes(session.notes),
    lastUpdated: new Date().toISOString(),
  });
}

export async function updateCoachNotes(input: {
  relationshipId: string;
  conversationId: string;
  notes: string;
  session: Session;
  persist: PersistCoachSession;
}): Promise<Session> {
  if (input.session.clientId !== input.relationshipId) {
    throw new Error("Coach notes are scoped to the selected relationship.");
  }
  if (input.session.id !== input.conversationId) {
    throw new Error("Coach notes are scoped to the selected conversation.");
  }

  return persistSession(
    {
      ...input.session,
      notes: cleanLegacyCoachNotes(input.notes),
      notesSavedAt: new Date().toISOString(),
    },
    input.persist
  );
}

export async function startCoachingSession(input: SessionMutationInput): Promise<Session> {
  assertSessionScope(input);
  const now = new Date().toISOString();

  return persistSession(
    {
      ...input.session,
      status: "in_progress",
      timerStartedAt: now,
      sessionStartedAt: input.session.sessionStartedAt || now,
    },
    input.persist
  );
}

export async function pauseCoachingSession(input: {
  conversationId: string;
  elapsedSeconds: number;
  session: Session;
  persist: PersistCoachSession;
}): Promise<Session> {
  if (input.session.id !== input.conversationId) {
    throw new Error("Pause is scoped to the selected conversation.");
  }

  return persistSession(
    {
      ...input.session,
      status: "paused",
      timerElapsedSeconds: Math.max(0, Math.floor(input.elapsedSeconds)),
      timerStartedAt: null,
    },
    input.persist
  );
}

export async function resumeCoachingSession(input: {
  conversationId: string;
  session: Session;
  persist: PersistCoachSession;
}): Promise<Session> {
  if (input.session.id !== input.conversationId) {
    throw new Error("Resume is scoped to the selected conversation.");
  }

  return persistSession(
    {
      ...input.session,
      status: "in_progress",
      timerStartedAt: new Date().toISOString(),
    },
    input.persist
  );
}

export async function completeCoachingSession(input: {
  relationshipId: string;
  conversationId: string;
  elapsedSeconds: number;
  session: Session;
  persist: PersistCoachSession;
}): Promise<Session> {
  assertSessionScope(input);
  const now = new Date().toISOString();

  return persistSession(
    {
      ...input.session,
      status: "awaiting_completion",
      timerElapsedSeconds: Math.max(0, Math.floor(input.elapsedSeconds)),
      timerStartedAt: null,
      notesSavedAt: input.session.notes.trim()
        ? input.session.notesSavedAt || now
        : input.session.notesSavedAt,
    },
    input.persist
  );
}

function assertSessionScope(input: SessionMutationInput) {
  if (input.session.clientId !== input.relationshipId) {
    throw new Error("Conversation is scoped to the selected relationship.");
  }
  if (input.session.id !== input.conversationId) {
    throw new Error("Conversation scope mismatch.");
  }
}

export async function generateCoachingSupport(
  action: CoachingSupportAction,
  context: {
    notes: string;
    focus?: string;
    clientName?: string;
    clientId?: string;
    preparation?: string;
  }
): Promise<CoachingSupportResult> {
  const notes = cleanLegacyCoachNotes(context.notes);

  if (action === "suggest_question") {
    if (!notes.trim()) {
      return {
        action,
        title: "Suggested question",
        content:
          "What feels most important to explore in this conversation today?",
      };
    }

    const data = await apiJson<{ questions?: string; raw?: string }>(
      "/api/coaching-questions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, clientId: context.clientId }),
      }
    );

    const raw = data.questions || data.raw || "";
    const firstQuestion =
      raw
        .split(/\r?\n/)
        .map(line => line.replace(/^\d+\.\s*/, "").trim())
        .find(line => line.endsWith("?") || line.length > 12) || raw.trim();

    return {
      action,
      title: "Suggested question",
      content: firstQuestion || "What would be useful to notice before we go further?",
    };
  }

  if (action === "draft_summary" || action === "identify_themes") {
    if (!notes.trim()) {
      return {
        action,
        title: action === "identify_themes" ? "Emerging themes" : "Draft session summary",
        content:
          "Add a little more into your coach notes first, then try again.",
      };
    }

    const data = await apiJson<{
      summary?: string;
      sections?: ReturnType<typeof parseDraftSummary>;
      rawDraft?: string;
    }>("/api/draft-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notes,
        focus: context.focus || "",
        preparation: context.preparation || "",
        clientName: context.clientName || "",
        clientId: context.clientId,
      }),
    });

    const sections = data.sections ?? parseDraftSummary(data.rawDraft || data.summary || "");

    if (action === "identify_themes") {
      return {
        action,
        title: "Emerging themes",
        content:
          sections.emergingThemes.trim() ||
          "No clear themes yet. Continue capturing the conversation.",
      };
    }

    return {
      action,
      title: "Draft session summary",
      content:
        sections.aiDraftSummary.trim() ||
        data.summary?.trim() ||
        "A draft summary could not be produced from the current notes.",
    };
  }

  // reflection_prompt
  const focusLine = context.focus?.trim()
    ? `Session focus: ${context.focus.trim()}`
    : "Session focus has not been set.";

  return {
    action,
    title: "Reflection prompt",
    content: [
      focusLine,
      "",
      "After this conversation, pause with:",
      "• What shifted for the client?",
      "• What surprised you as the coach?",
      "• What evidence matters most to carry forward?",
      "• What will you protect in the next conversation?",
      notes.trim()
        ? `\nFrom today’s notes, notice where energy rose or fell.`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** Sarah Thompson — Session 2 fixture for workspace verification. */
export const sarahCoachWorkspace: CoachWorkspaceViewModel = {
  relationshipId: "relationship-sarah",
  conversationId: "conversation-sarah-2",

  client: {
    name: "Sarah Thompson",
    role: "Service Delivery Manager",
    organisation: "Northbridge Community Services",
  },

  conversation: {
    title: "Development Conversation 2",
    sequenceLabel: "Session 2 of 6",
    date: "2026-08-06",
    focus:
      "Explore what happened when Sarah attempted to delegate differently and identify what supported or prevented behavioural change.",
    status: "prepared",
    notes: "",
    elapsedSeconds: 0,
    timerStartedAt: null,
  },

  context: {
    commitments: [
      {
        id: "commitment-1",
        text: "Delegate one meaningful task without taking it back.",
        status: "open",
      },
      {
        id: "commitment-2",
        text: "Ask what support is needed before offering solutions.",
        status: "open",
      },
      {
        id: "commitment-3",
        text: "Protect one hour each week for strategic work.",
        status: "open",
      },
    ],

    insights: [
      "Sarah may interpret questions as evidence that she needs to take work back.",
      "Her intention to support others may unintentionally reduce accountability.",
      "The next stage is to move from awareness towards repeatable behaviour.",
    ],

    suggestedQuestions: [
      {
        id: "question-1",
        text: "What happened when you delegated differently?",
      },
      {
        id: "question-2",
        text: "When were you most tempted to take the work back?",
      },
      {
        id: "question-3",
        text: "What did your team member need from you at that point?",
      },
      {
        id: "question-4",
        text: "What evidence suggests your team is capable of more?",
      },
      {
        id: "question-5",
        text: "What will you experiment with before our next conversation?",
      },
    ],
  },
};
