/**
 * Stage 2.2.2 / 2.2.2A / 2.2.3 — Manager Aurelia multi-turn conversation helpers.
 * Person-free. Optional minimised development focus/actions context.
 * No transcript persistence.
 */

import { IDENTITY_SYSTEM_PROMPT } from "@/lib/ai/identity-system-prompt";
import { BRAND } from "@/lib/brand";
import {
  formatManagerAureliaDevelopmentContext,
  type ManagerAureliaDevelopmentContext,
} from "@/lib/my-development/aurelia-context";

/** Manager new message and prior Manager turns. */
export const MANAGER_AURELIA_MAX_MESSAGE_CHARS = 2000;

/**
 * Prior Aurelia turns and returned replies share this cap so a reply from this
 * API can always be re-submitted as a prior Aurelia turn.
 */
export const MANAGER_AURELIA_MAX_AURELIA_TURN_CHARS = 1600;

export const MANAGER_AURELIA_MAX_TURNS = 20;
export const MANAGER_AURELIA_MAX_TOTAL_CHARS = 14_000;

/** Model output headroom; prompt + char bounding keep replies conversational. */
export const MANAGER_AURELIA_MAX_OUTPUT_TOKENS = 400;

export type ManagerAureliaRole = "manager" | "aurelia";

export type ManagerAureliaTurn = {
  role: ManagerAureliaRole;
  content: string;
};

export const MANAGER_AURELIA_CONVERSATION_ADDENDUM = `You are speaking with a Manager in a private working session inside ${BRAND.companyName}.

This is a multi-turn conversation — a development partner dialogue, not a management briefing, essay, or coaching questionnaire.

Default length and shape:
- Prefer approximately 60–140 words.
- For direct practical requests, prefer approximately 50–120 words.
- Usually make one main point at a time.
- Normally ask at most ONE useful clarifying question, and only when uncertainty materially affects the answer.
- Keep paragraphs short and natural.
- Do not repeat the Manager’s situation back at length.
- Avoid numbered frameworks, long option lists, and scripted speeches unless the Manager asks for structure or wording depth.
- Give more detail only when the Manager explicitly asks for depth, or the issue genuinely cannot be handled briefly.

Match the Manager’s request:
- Exploring → help them think, briefly.
- Asks for challenge → challenge constructively, with evidence from what they said.
- Asks what to do / what first → offer concise practical options (usually 2–3), with light trade-offs if useful. Do not force preliminary coaching questions.
- Asks what to say / for an opening → offer a short adaptable opening, not a speech.
- Says “keep this short”, “I don’t want a long coaching conversation”, “just help me prepare”, or similar → honour that immediately with a short, direct reply.

Manager development context (when supplied separately in the input):
- A small amount of the Manager’s own development focus titles and incomplete actions may be available.
- That context is AVAILABLE, NOT MANDATORY. Use it only when genuinely relevant to what the Manager is discussing now.
- Do not mention a focus or action merely because it exists. Do not inventory the portfolio.
- Avoid wording such as “According to your portfolio…”, “You have three actions…”, or “Your development record says…”.
- Prefer natural connections when relevant, for example: “You’ve been working on delegation. Does what you’re describing here feel connected to that?”
- Current conversation takes precedence over older development context. If the Manager’s current words conflict with an old focus or action, work with what they are saying now — do not correct them using the portfolio, and do not treat old context as current truth.
- Never invent a focus or action that was not supplied.
- Names appearing inside Manager-authored action titles do not grant person-record access. Do not look up, identify, or claim to know that person.
- Do not claim access to reflections, evidence, assessments, strengths, values, team members, My People, or organisational intelligence.

Always:
- Keep Manager judgement central: propose, do not decide for them.
- Follow Evidence before certainty: do not invent facts about people, teams or the organisation.
- Do not claim access to person records, full portfolios, evidence, assessments or organisational intelligence.
- Discuss “someone I manage” only from what the Manager has written — never attempt to identify or retrieve that person.
- Do not diagnose employees; do not provide HR, legal, disciplinary or clinical advice.
- Do not claim this conversation is saved or that it becomes organisational intelligence.
- Do not mention internal coaching frameworks (GROW, OSKAR, Gibbs, etc.) by name in the UI-facing reply.
- Stay calm, natural, and conversational.`;

export function buildManagerAureliaInstructions(): string {
  return `${IDENTITY_SYSTEM_PROMPT}

---

${MANAGER_AURELIA_CONVERSATION_ADDENDUM}`;
}

export function isManagerAureliaRole(value: unknown): value is ManagerAureliaRole {
  return value === "manager" || value === "aurelia";
}

function maxCharsForRole(role: ManagerAureliaRole): number {
  return role === "aurelia"
    ? MANAGER_AURELIA_MAX_AURELIA_TURN_CHARS
    : MANAGER_AURELIA_MAX_MESSAGE_CHARS;
}

/**
 * Deterministically bound an Aurelia reply so it can always be re-submitted as a
 * prior Aurelia turn. Prefers a clean sentence/word boundary over mid-word cuts.
 */
export function boundManagerAureliaReply(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.length <= MANAGER_AURELIA_MAX_AURELIA_TURN_CHARS) {
    return trimmed;
  }

  const limit = MANAGER_AURELIA_MAX_AURELIA_TURN_CHARS;
  const window = trimmed.slice(0, limit);

  const sentenceEnd = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
    window.lastIndexOf(".\n"),
    window.lastIndexOf("!\n"),
    window.lastIndexOf("?\n")
  );
  if (sentenceEnd >= Math.floor(limit * 0.55)) {
    return window.slice(0, sentenceEnd + 1).trim();
  }

  const lastSpace = window.lastIndexOf(" ");
  if (lastSpace >= Math.floor(limit * 0.55)) {
    return window.slice(0, lastSpace).trim();
  }

  return window.trim();
}

/**
 * Validate and bound prior turns. Rejects non-app roles and oversized content.
 * Returns the most recent window that fits turn/char caps.
 */
export function boundManagerAureliaTurns(
  turns: unknown
):
  | { ok: true; turns: ManagerAureliaTurn[] }
  | { ok: false; error: string; status: number } {
  if (!Array.isArray(turns)) {
    return { ok: false, error: "turns must be an array.", status: 400 };
  }

  const normalised: ManagerAureliaTurn[] = [];
  for (const item of turns) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Each turn must be an object.", status: 400 };
    }
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (!isManagerAureliaRole(role)) {
      return {
        ok: false,
        error: "Each turn role must be manager or aurelia.",
        status: 400,
      };
    }
    if (typeof content !== "string") {
      return {
        ok: false,
        error: "Each turn content must be a string.",
        status: 400,
      };
    }
    const trimmed = content.trim();
    if (!trimmed) continue;
    const max = maxCharsForRole(role);
    if (trimmed.length > max) {
      return {
        ok: false,
        error:
          role === "aurelia"
            ? `Each Aurelia turn must be ${MANAGER_AURELIA_MAX_AURELIA_TURN_CHARS} characters or fewer.`
            : `Each Manager turn must be ${MANAGER_AURELIA_MAX_MESSAGE_CHARS} characters or fewer.`,
        status: 400,
      };
    }
    normalised.push({ role, content: trimmed });
  }

  let windowed = normalised.slice(-MANAGER_AURELIA_MAX_TURNS);
  let total = windowed.reduce((sum, turn) => sum + turn.content.length, 0);
  while (windowed.length > 0 && total > MANAGER_AURELIA_MAX_TOTAL_CHARS) {
    const removed = windowed.shift();
    total -= removed?.content.length ?? 0;
  }

  return { ok: true, turns: windowed };
}

export function validateManagerAureliaMessage(
  message: unknown
):
  | { ok: true; message: string }
  | { ok: false; error: string; status: number } {
  if (typeof message !== "string") {
    return { ok: false, error: "message is required.", status: 400 };
  }
  const trimmed = message.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a message before sending.", status: 400 };
  }
  if (trimmed.length > MANAGER_AURELIA_MAX_MESSAGE_CHARS) {
    return {
      ok: false,
      error: `Messages must be ${MANAGER_AURELIA_MAX_MESSAGE_CHARS} characters or fewer.`,
      status: 400,
    };
  }
  return { ok: true, message: trimmed };
}

/** Reject person identifiers — this endpoint is person-free. */
export function rejectPersonIdentifiers(
  body: Record<string, unknown>
): { ok: true } | { ok: false; error: string; status: number } {
  const forbidden = [
    "clientId",
    "managedPersonId",
    "employeeId",
    "personId",
    "relationshipId",
    "teamMemberId",
  ] as const;
  for (const key of forbidden) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") {
      return {
        ok: false,
        error: "Person identifiers are not accepted for Manager Aurelia chat.",
        status: 400,
      };
    }
  }
  return { ok: true };
}

/**
 * Reject client-supplied portfolio/identity fields. Context is resolved
 * server-side only from the authenticated Manager's self-development record.
 */
export function rejectClientSuppliedDevelopmentContext(
  body: Record<string, unknown>
): { ok: true } | { ok: false; error: string; status: number } {
  const forbidden = [
    "developmentContext",
    "managerDevelopmentContext",
    "focus",
    "focuses",
    "focusItems",
    "focusTitles",
    "actions",
    "portfolio",
    "workspace",
    "selfClientId",
    "organisationId",
    "coachId",
    "managerId",
    "userId",
  ] as const;
  for (const key of forbidden) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") {
      return {
        ok: false,
        error:
          "Development context must be resolved server-side and cannot be supplied by the client.",
        status: 400,
      };
    }
  }
  return { ok: true };
}

export function buildManagerAureliaInput(
  turns: ManagerAureliaTurn[],
  message: string,
  developmentContext?: ManagerAureliaDevelopmentContext | null
): string {
  const contextBlock = developmentContext
    ? formatManagerAureliaDevelopmentContext(developmentContext)
    : "";

  const lines: string[] = [
    "Active private working session (not saved as history).",
    "No person records are available.",
  ];

  if (contextBlock) {
    lines.push(
      "Selected Manager development focus/actions may be available below. Use only when relevant."
    );
    lines.push("");
    lines.push(contextBlock);
  } else {
    lines.push("No development focus or action context is available for this session.");
  }

  lines.push("");

  if (turns.length > 0) {
    lines.push("Conversation so far:");
    for (const turn of turns) {
      const speaker = turn.role === "manager" ? "Manager" : BRAND.intelligenceName;
      lines.push(`${speaker}: ${turn.content}`);
    }
    lines.push("");
  }

  lines.push(`Manager: ${message}`);
  lines.push("");
  lines.push(`${BRAND.intelligenceName}:`);
  return lines.join("\n");
}
