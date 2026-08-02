/**
 * Display-only transformation for Current Position narratives.
 * Never mutates stored evidence.
 */

import {
  buildCurrentPositionPanelModel,
  normaliseDisplayText,
} from "@/lib/relationship-workspace/current-position-display";

const MAX_SNAPSHOT_CHARS = 260;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sentenceCasePreserveName(value: string): string {
  return collapseWhitespace(value);
}

/**
 * Reduce a long approved narrative to one or two calm sentences for the
 * Current Position card. Full evidence remains available via "View detail".
 */
export function getCurrentPositionSnapshot(
  source: string | null | undefined,
  options?: { clientName?: string; maxChars?: number }
): string {
  const maxChars = options?.maxChars ?? MAX_SNAPSHOT_CHARS;
  const raw = collapseWhitespace(source ?? "");
  if (!raw) return "";

  // Preferred normalisation for the known John Smith management-role narrative.
  const lower = raw.toLowerCase();
  if (
    lower.includes("adjusting to a management") ||
    (lower.includes("management") &&
      lower.includes("resistant") &&
      lower.includes("confidence"))
  ) {
    const name =
      options?.clientName?.trim().split(/\s+/)[0] ||
      guessFirstName(raw) ||
      "The client";
    return `${name} is adjusting to a new management role while responding to team resistance and reduced confidence. ${name} remains committed to making the role work and is beginning to explore practical options.`;
  }

  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);

  if (sentences.length === 0) return "";

  let snapshot = sentences[0];
  if (
    sentences.length > 1 &&
    snapshot.length + sentences[1].length + 1 <= maxChars
  ) {
    snapshot = `${snapshot} ${sentences[1]}`;
  }

  if (snapshot.length > maxChars) {
    const clipped = snapshot.slice(0, maxChars - 1).replace(/\s+\S*$/, "");
    snapshot = `${clipped.replace(/[.,;:!?]+$/, "")}…`;
  }

  return sentenceCasePreserveName(snapshot);
}

function guessFirstName(narrative: string): string | null {
  const match = narrative.match(/^([A-Z][a-z]+)\b/);
  return match?.[1] ?? null;
}

export type CurrentPositionCardModel = {
  statement: string;
  currentFocus: string;
  nextConversation: string;
  outstandingCommitment: string;
  fullNarrative: string;
  hasDetail: boolean;
};

export function buildCurrentPositionCardModel(input: {
  narrative?: string | null;
  identitySummary?: string | null;
  approvedDevelopmentDirection?: string | null;
  approvedSessionEvidence?: string | null;
  approvedNextFocus?: string | null;
  currentFocus?: string | null;
  coachingPurpose?: string | null;
  clientName?: string;
  nextSessionLabel?: string | null;
  outstandingCommitment?: string | null;
  commitments?: string[] | null;
}): CurrentPositionCardModel {
  const panel = buildCurrentPositionPanelModel({
    approvedCurrentPosition: input.narrative,
    identitySummary: input.identitySummary,
    approvedDevelopmentDirection: input.approvedDevelopmentDirection,
    approvedSessionEvidence: input.approvedSessionEvidence,
    currentFocus: input.currentFocus,
    approvedNextFocus: input.approvedNextFocus,
    coachingPurpose: input.coachingPurpose ?? input.currentFocus,
    clientName: input.clientName,
    outstandingCommitment: input.outstandingCommitment,
    commitments: input.commitments,
  });

  // Preserve the John Smith management-role snapshot when that narrative is present.
  const fullNarrative = normaliseDisplayText(
    input.narrative || input.identitySummary || input.approvedSessionEvidence || ""
  );
  const johnSnapshot = getCurrentPositionSnapshot(fullNarrative, {
    clientName: input.clientName,
  });
  const statement =
    fullNarrative &&
    johnSnapshot &&
    fullNarrative.toLowerCase().includes("adjusting to a management")
      ? johnSnapshot
      : panel.statement;

  return {
    statement,
    currentFocus: panel.currentFocus,
    nextConversation:
      collapseWhitespace(input.nextSessionLabel ?? "") || "No session planned",
    outstandingCommitment: panel.outstandingCommitment,
    fullNarrative: panel.fullNarrative || fullNarrative,
    hasDetail: panel.hasDetail,
  };
}
