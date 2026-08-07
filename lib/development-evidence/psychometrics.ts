/**
 * Psychometric / assessment interpretation rules (deterministic guards).
 */

import {
  PSYCHOMETRIC_EVIDENCE_TYPES,
  type DevelopmentEvidenceType,
} from "@/lib/development-evidence/constants";
import type { StructuredEvidence } from "@/lib/development-evidence/types";

const FORBIDDEN_DETERMINISTIC_PATTERNS = [
  /\byou are a high [a-z]\b/i,
  /\bthis person is an? (estj|entj|infj|intj|enfp|istp|high [diisc])\b/i,
  /\bready for promotion\b/i,
  /\bhigh potential\b/i,
  /\bdiagnos(e|is|tic)\b/i,
  /\bfixed personality\b/i,
  /\bthis proves\b/i,
  /\bdefinitely\b/i,
];

const PREFERENCE_LANGUAGE = [
  "suggests a preference",
  "reported pattern",
  "assessment suggests",
  "contextual evidence",
  "available evidence",
];

export function isPsychometricEvidenceType(
  evidenceType: DevelopmentEvidenceType
): boolean {
  return (PSYCHOMETRIC_EVIDENCE_TYPES as readonly string[]).includes(
    evidenceType
  );
}

export function assertPsychometricLanguageSafe(text: string): {
  ok: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  for (const pattern of FORBIDDEN_DETERMINISTIC_PATTERNS) {
    if (pattern.test(text)) {
      violations.push(pattern.source);
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Soft rewrite guidance for sample / deterministic extraction when AI is unavailable.
 */
export function preferenceFramedSummary(input: {
  evidenceType: DevelopmentEvidenceType;
  theme: string;
  supportingBehaviour?: string | null;
  conflictingBehaviour?: string | null;
}): string {
  const label = input.evidenceType.toUpperCase().replaceAll("_", " ");
  const base = `The ${label} report suggests a preference related to ${input.theme}.`;
  if (input.conflictingBehaviour?.trim()) {
    return `${base} Recent development conversations describe ${input.conflictingBehaviour.trim()}. The available evidence does not establish why these differ.`;
  }
  if (input.supportingBehaviour?.trim()) {
    return `${base} Recent development conversations provide some supporting evidence, particularly ${input.supportingBehaviour.trim()}.`;
  }
  return `${base} Treat this as contextual evidence only until corroborated by observed behaviour.`;
}

export function validateStructuredPsychometricEvidence(
  evidenceType: DevelopmentEvidenceType,
  structured: StructuredEvidence
): StructuredEvidence {
  if (!isPsychometricEvidenceType(evidenceType)) return structured;

  const observations = (structured.observations ?? []).map(observation => {
    const joined = [
      observation.title,
      observation.description,
      observation.developmentImplication,
      observation.assessmentContext,
    ]
      .filter(Boolean)
      .join(" ");

    const check = assertPsychometricLanguageSafe(joined);
    if (check.ok) return observation;

    return {
      ...observation,
      description: preferenceSafeRewrite(observation.description, evidenceType),
      developmentImplication: observation.developmentImplication
        ? preferenceSafeRewrite(observation.developmentImplication, evidenceType)
        : observation.developmentImplication,
      limitations:
        observation.limitations ||
        "Assessment evidence describes preferences or reported patterns, not proven ability or promotion suitability.",
      assessmentContext:
        observation.assessmentContext ||
        "Interpret as preference / contextual evidence only.",
    };
  });

  const limitations = [
    ...(structured.limitations ?? []),
    "Psychometric findings are contextual evidence and must not dominate Development Intelligence.",
  ];

  return {
    ...structured,
    observations,
    limitations: Array.from(new Set(limitations)),
  };
}

function preferenceSafeRewrite(
  text: string,
  evidenceType: DevelopmentEvidenceType
): string {
  const cleaned = text
    .replace(/\bYou are\b/gi, "The report suggests a preference for")
    .replace(/\bThis person is\b/gi, "The assessment suggests")
    .replace(/\bready for promotion\b/gi, "possibly relevant to explore in conversation")
    .replace(/\bhigh potential\b/gi, "an area that may be worth exploring")
    .replace(/\bthis proves\b/gi, "the available evidence suggests")
    .replace(/\bdefinitely\b/gi, "possibly");

  if (PREFERENCE_LANGUAGE.some(phrase => cleaned.toLowerCase().includes(phrase))) {
    return cleaned;
  }

  return `The ${evidenceType.replaceAll("_", " ")} report suggests: ${cleaned}`;
}

export function surfaceAssessmentBehaviourConflict(input: {
  assessmentSignal: string;
  behaviouralSignal: string;
}): string {
  return `The assessment suggests ${input.assessmentSignal}, while recent development conversations describe ${input.behaviouralSignal}. The available evidence does not establish why these differ.`;
}
