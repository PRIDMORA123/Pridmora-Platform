/**
 * Stage 2.2.4 — deliberate capture draft proposal for Manager Aurelia.
 * Proposals are never saved. No transcript persistence.
 */

import { BRAND } from "@/lib/brand";
import {
  MANAGER_AURELIA_MAX_OUTPUT_TOKENS,
  boundManagerAureliaTurns,
  type ManagerAureliaTurn,
} from "@/lib/ai/manager-aurelia-conversation";

export const MANAGER_AURELIA_PROPOSE_CAPTURE_MAX_OUTPUT_TOKENS = Math.min(
  MANAGER_AURELIA_MAX_OUTPUT_TOKENS,
  350
);

export type ManagerAureliaCaptureType = "reflection" | "action";

export type ManagerAureliaReflectionDraft = {
  title: string;
  whatNoticed: string;
  practiseNext: string;
};

export type ManagerAureliaActionDraft = {
  title: string;
  due?: string;
};

export function isManagerAureliaCaptureType(
  value: unknown
): value is ManagerAureliaCaptureType {
  return value === "reflection" || value === "action";
}

export function validateManagerAureliaCaptureTurns(
  turns: unknown
):
  | { ok: true; turns: ManagerAureliaTurn[] }
  | { ok: false; error: string; status: number } {
  const bounded = boundManagerAureliaTurns(turns);
  if (!bounded.ok) return bounded;
  if (bounded.turns.length === 0) {
    return {
      ok: false,
      error: "Have a short conversation before capturing something.",
      status: 400,
    };
  }
  return bounded;
}

export function buildManagerAureliaProposeCaptureInstructions(
  captureType: ManagerAureliaCaptureType
): string {
  const common = `You help a Manager draft a short, editable capture from a private working conversation in ${BRAND.companyName}.

Rules:
- Use only what the Manager and ${BRAND.intelligenceName} said in the conversation below.
- Do not invent facts, people, organisations, or outcomes.
- Do not claim person-record access. Names in the chat do not authorise looking anyone up.
- Prefer describing situations without naming colleagues when a durable record is being drafted.
- Do not imply anything has been saved.
- Keep Manager agency: this is a draft for the Manager to edit.
- Return JSON only. No markdown fences. No commentary.`;

  if (captureType === "reflection") {
    return `${common}

Task: propose a concise Manager development reflection draft.

Return exactly this JSON shape:
{"title":"...","whatNoticed":"...","practiseNext":"..."}

Field guidance:
- title: max ~80 characters
- whatNoticed: 1–3 short sentences on what the Manager noticed or is learning
- practiseNext: 1–2 short sentences on a practical next practise
- Keep the whole draft brief. No essay.`;
  }

  return `${common}

Task: propose one concise development action from the conversation.

Return exactly this JSON shape:
{"title":"...","due":null}

or, only if a clear date was stated in the conversation:
{"title":"...","due":"YYYY-MM-DD"}

Field guidance:
- title: one practical action, max ~80 characters
- due: omit or null unless clearly supported
- Do not include owner, notes, or person identifiers`;
}

export function buildManagerAureliaProposeCaptureInput(
  turns: ManagerAureliaTurn[],
  captureType: ManagerAureliaCaptureType
): string {
  const lines: string[] = [
    `Capture type: ${captureType}`,
    "Conversation (private, not saved as history):",
    "",
  ];
  for (const turn of turns) {
    const speaker = turn.role === "manager" ? "Manager" : BRAND.intelligenceName;
    lines.push(`${speaker}: ${turn.content}`);
  }
  lines.push("");
  lines.push("JSON draft:");
  return lines.join("\n");
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asTrimmedString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

function asOptionalDue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
  return trimmed;
}

export function parseManagerAureliaProposeCaptureDraft(
  raw: string,
  captureType: ManagerAureliaCaptureType
):
  | { ok: true; draft: ManagerAureliaReflectionDraft | ManagerAureliaActionDraft }
  | { ok: false; error: string } {
  const json = extractJsonObject(raw);
  if (!json) {
    return { ok: false, error: "Aurelia could not propose a draft. Please try again." };
  }

  if (captureType === "reflection") {
    const draft: ManagerAureliaReflectionDraft = {
      title: asTrimmedString(json.title, 120),
      whatNoticed: asTrimmedString(json.whatNoticed, 1200),
      practiseNext: asTrimmedString(json.practiseNext, 800),
    };
    if (!draft.whatNoticed && !draft.practiseNext) {
      return {
        ok: false,
        error: "The proposed reflection needs at least one note field.",
      };
    }
    if (!draft.title) {
      draft.title = "Development reflection";
    }
    return { ok: true, draft };
  }

  const title = asTrimmedString(json.title, 120);
  if (!title) {
    return { ok: false, error: "The proposed action needs a title." };
  }
  const due = asOptionalDue(json.due);
  const draft: ManagerAureliaActionDraft = due ? { title, due } : { title };
  return { ok: true, draft };
}

export function reflectionDraftHasNote(
  draft: Pick<ManagerAureliaReflectionDraft, "whatNoticed" | "practiseNext">
): boolean {
  return Boolean(draft.whatNoticed.trim() || draft.practiseNext.trim());
}
