/**
 * Post-generation validation for organisation intelligence AI output.
 * Rejects identity leakage, unsupported certainty, progress/difficulty claims
 * and references to themes that are not Lead-visible.
 */

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN =
  /(?:\+44\s?|0)(?:\d\s?){9,10}\b|\+\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/;
const CONFIDENTIAL_REF_PATTERN =
  /\b(?:CR|REF|CONF)[-_]?\d{3,}\b|\bconfidential reference\b/i;

const CERTAINTY_PATTERNS = [
  /\bthis proves\b/i,
  /\bdefinitive\b/i,
  /\bguaranteed\b/i,
  /\bai predicts with certainty\b/i,
  /\bthe organisation is\b/i,
  /\bwithout doubt\b/i,
  /\bcertainly\b/i,
];

const COMMERCIAL_PATTERNS = [
  /\bpridmora programme\b/i,
  /\bbuy\b/i,
  /\bpurchase\b/i,
  /\bupgrade your plan\b/i,
  /\bsubscribe\b/i,
  /\bsales\b/i,
  /\bpricing\b/i,
];

/** Progress / difficulty claims unsupported by prevalence aggregates alone. */
const FORBIDDEN_PROGRESS_DIFFICULTY_PATTERNS = [
  /\bbehaviours? are strengthening\b/i,
  /\bstrengthening\b/i,
  /\bimproving\b/i,
  /\bcapability is improving\b/i,
  /\bdevelopment is progressing\b/i,
  /\bprogressing\b/i,
  /\brecurring difficulty\b/i,
  /\bdifficulty\b/i,
  /\bcomparatively strong\b/i,
  /\brequiring attention\b/i,
  /\bweakness\b/i,
  /\bperformance (gap|problem|issue)\b/i,
];

/** Foundation labels that must not appear unless they are also visible theme labels. */
const FOUNDATION_LABELS = [
  "Listening and Presence",
  "Psychological Safety",
  "Accountability and Ownership",
  "Feedback and Conversations",
  "Emotional Intelligence and Self-Management",
  "Collaboration and Alignment",
];

export type OrganisationIntelligenceValidationResult =
  | { ok: true; brief: string }
  | {
      ok: false;
      reasons: string[];
      retryable: boolean;
    };

export type OrganisationIntelligenceBriefValidationOptions = {
  visibleThemeLabels?: string[];
};

export function validateOrganisationIntelligenceBrief(
  brief: string,
  allowedNumbers: number[] = [],
  options: OrganisationIntelligenceBriefValidationOptions = {}
): OrganisationIntelligenceValidationResult {
  const text = brief.trim();
  const reasons: string[] = [];

  if (!text) {
    return {
      ok: false,
      reasons: ["empty_output"],
      retryable: true,
    };
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount > 250) {
    reasons.push("too_long");
  }

  const paragraphs = text
    .split(/\n\s*\n/)
    .map(part => part.trim())
    .filter(Boolean);
  if (paragraphs.length > 4) {
    reasons.push("too_many_paragraphs");
  }

  if (EMAIL_PATTERN.test(text)) reasons.push("email_like_string");
  if (PHONE_PATTERN.test(text)) {
    reasons.push("telephone_like_string");
  }
  if (CONFIDENTIAL_REF_PATTERN.test(text)) {
    reasons.push("confidential_reference");
  }

  for (const pattern of CERTAINTY_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push("certainty_language");
      break;
    }
  }

  for (const pattern of COMMERCIAL_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push("commercial_language");
      break;
    }
  }

  for (const pattern of FORBIDDEN_PROGRESS_DIFFICULTY_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push("forbidden_progress_or_difficulty_language");
      break;
    }
  }

  const visibleLabels = (options.visibleThemeLabels ?? []).map(label =>
    label.trim().toLowerCase()
  );
  if (visibleLabels.length > 0) {
    for (const foundation of FOUNDATION_LABELS) {
      const foundationLower = foundation.toLowerCase();
      if (
        text.toLowerCase().includes(foundationLower) &&
        !visibleLabels.includes(foundationLower)
      ) {
        // Allow "Psychological Safety" when that exact theme is visible.
        reasons.push("foundation_or_non_visible_theme_label");
        break;
      }
    }
  }

  const numbers = Array.from(text.matchAll(/\b\d+(?:\.\d+)?%?\b/g)).map(match =>
    Number.parseFloat(match[0].replace("%", ""))
  );
  const allowed = new Set(
    allowedNumbers
      .filter(value => Number.isFinite(value))
      .map(value => Math.round(value * 10) / 10)
  );
  for (const value of numbers) {
    const rounded = Math.round(value * 10) / 10;
    if (!allowed.has(rounded) && !allowed.has(Math.round(value))) {
      if (value > 4) {
        reasons.push("unsupported_number");
        break;
      }
    }
  }

  if (
    /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/.test(text) &&
    !/\b(Development Momentum|Psychological Safety|Emotional Intelligence)\b/.test(
      text
    )
  ) {
    reasons.push("possible_name");
  }

  if (reasons.length > 0) {
    return { ok: false, reasons: Array.from(new Set(reasons)), retryable: true };
  }

  return { ok: true, brief: text };
}

export function collectAllowedNumbers(
  values: Array<number | null | undefined>
): number[] {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      out.push(value);
    }
  }
  return out;
}
