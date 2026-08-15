/**
 * Narrow post-parse safeguard: recover explicit agreed actions from trusted
 * summary evidence when the model returns an empty commitments array.
 *
 * Does not invent actions. Does not run when the model already extracted commitments.
 */

import { isNoCommitmentAgreedMarker } from "@/lib/summary-insights/debrief-evidence-for-summary";
import {
  SUMMARY_INSIGHTS_LIMITS,
  type SummaryInsightsContent,
} from "@/lib/summary-insights/types";

const EXPLICIT_AGREEMENT_PATTERNS: RegExp[] = [
  /\b[A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){0,3}\s+agreed\s+to\b/i,
  /\b[A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){0,3}\s+committed\s+to\b/i,
  /\b[A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){0,3}\s+decided\s+to\b/i,
  /\bit\s+was\s+agreed\s+that\b/i,
];

const AGREEMENT_ANCHORS = [
  "agreed to",
  "committed to",
  "decided to",
  "it was agreed that",
] as const;

/** Tentative / inferred framing — never sufficient alone; also blocks hedged "might have agreed". */
const HEDGE_BEFORE_AGREEMENT =
  /\b(could|might|should|may|possible|suggested|consider|explore|would be useful|possible next step)\b/i;

function normaliseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function splitEvidenceCandidates(evidence: string): string[] {
  const blocks = evidence
    .split(/\n+/)
    .map(line => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);

  const candidates: string[] = [];
  for (const block of blocks) {
    const sentences = block
      .split(/(?<=[.!?])\s+/)
      .map(part => part.trim())
      .filter(Boolean);
    if (sentences.length > 1) {
      candidates.push(...sentences);
    } else {
      candidates.push(block);
    }
  }
  return candidates;
}

function hasExplicitAgreementLanguage(text: string): boolean {
  return EXPLICIT_AGREEMENT_PATTERNS.some(pattern => pattern.test(text));
}

function agreementAnchorIndex(text: string): number {
  const lower = text.toLowerCase();
  let best = -1;
  for (const anchor of AGREEMENT_ANCHORS) {
    const index = lower.indexOf(anchor);
    if (index !== -1 && (best === -1 || index < best)) {
      best = index;
    }
  }
  return best;
}

/**
 * Reject when hedge/inference language appears before the agreement anchor
 * in the same candidate (e.g. "Alex might have agreed to…").
 */
function isHedgedAgreement(text: string): boolean {
  const anchorIndex = agreementAnchorIndex(text);
  if (anchorIndex <= 0) return false;
  return HEDGE_BEFORE_AGREEMENT.test(text.slice(0, anchorIndex));
}

/**
 * Extract grounded explicit agreement lines from trusted debrief/live notes.
 * Returns original candidate wording; does not rewrite meaning.
 */
export function extractExplicitAgreementsFromEvidence(
  evidence: string
): string[] {
  const trimmed = evidence.trim();
  if (!trimmed) return [];

  const seen = new Set<string>();
  const recovered: string[] = [];

  for (const raw of splitEvidenceCandidates(trimmed)) {
    const candidate = normaliseWhitespace(raw);
    if (!candidate) continue;
    if (isNoCommitmentAgreedMarker(candidate)) continue;
    if (!hasExplicitAgreementLanguage(candidate)) continue;
    if (isHedgedAgreement(candidate)) continue;

    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recovered.push(candidate);

    if (recovered.length >= SUMMARY_INSIGHTS_LIMITS.commitments) break;
  }

  return recovered;
}

/**
 * If the model already returned commitments, preserve them.
 * If empty, recover only from explicit agreement language in trusted evidence.
 */
export function applyExplicitCommitmentSafeguard(
  content: SummaryInsightsContent,
  trustedEvidence: string
): SummaryInsightsContent {
  const existing = content.commitments
    .map(item => normaliseWhitespace(item))
    .filter(Boolean)
    .filter(item => !isNoCommitmentAgreedMarker(item));

  if (existing.length > 0) {
    return {
      ...content,
      commitments: existing.slice(0, SUMMARY_INSIGHTS_LIMITS.commitments),
    };
  }

  const recovered = extractExplicitAgreementsFromEvidence(trustedEvidence);
  if (recovered.length === 0) {
    return { ...content, commitments: [] };
  }

  return {
    ...content,
    commitments: recovered.slice(0, SUMMARY_INSIGHTS_LIMITS.commitments),
  };
}

/**
 * Legacy plain-text sections path: fill agreedActions only when empty.
 */
export function applyExplicitCommitmentSafeguardToAgreedActionsText(
  agreedActions: string,
  trustedEvidence: string
): string {
  const existing = agreedActions
    .split(/\r?\n/)
    .map(line => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .filter(item => !isNoCommitmentAgreedMarker(item));

  if (existing.length > 0) {
    return existing.map(item => `- ${item}`).join("\n");
  }

  const recovered = extractExplicitAgreementsFromEvidence(trustedEvidence);
  if (recovered.length === 0) return "";
  return recovered.map(item => `- ${item}`).join("\n");
}
