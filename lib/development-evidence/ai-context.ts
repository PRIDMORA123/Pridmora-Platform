/**
 * Canonical evidence AI-context builder.
 * All evidence-analysis AI routes MUST use this helper.
 *
 * Identity protection:
 * - Confidential: real name / email / phone never enter AI context
 * - Standard: minimise email, phone, account IDs, auth data
 * - AI receives public relationship identity only
 */

import {
  assertAiPayloadExcludesPrivateIdentity,
  buildRelationshipAiContext,
  formatRelationshipAiPersonContext,
  type PrivateIdentityFields,
  type RelationshipAiContext,
} from "@/lib/relationship-identity";
import {
  assertNoForbiddenEvidenceAiFields,
  sanitizeEvidenceTextForAi,
} from "@/lib/development-evidence/sanitize";
import {
  EVIDENCE_TYPE_LABELS,
  EXTRACTION_VERSION,
  EVIDENCE_ANALYSIS_MAX_OBSERVATIONS,
  EVIDENCE_ANALYSIS_MAX_OBSERVATIONS_PSYCHOMETRIC,
  PSYCHOMETRIC_EVIDENCE_TYPES,
  type DevelopmentEvidenceType,
} from "@/lib/development-evidence/constants";
import type { StructuredEvidence } from "@/lib/development-evidence/types";

export type EvidenceAiDocumentInput = {
  fileName?: string | null;
  evidenceType: DevelopmentEvidenceType;
  evidenceDate?: string | null;
  purpose?: string | null;
  sourceSummary?: string | null;
  extractedText: string;
  contentHash?: string | null;
};

export type EvidenceAiApprovedItem = {
  title: string;
  evidenceType: DevelopmentEvidenceType;
  freshnessClass: string;
  sourceSummary?: string | null;
  observations?: Array<{
    title: string;
    description: string;
    behaviouralEvidence?: string | null;
    developmentImplication?: string | null;
    capabilityKey?: string | null;
  }>;
};

export type BuildEvidenceAiContextInput = {
  client: {
    name: string;
    role?: string | null;
    organisation?: string | null;
    identityMode?: string | null;
    displayLabel?: string | null;
    confidentialReference?: string | null;
    aiNameAllowed?: boolean | null;
  };
  /** Ignored for prompt content — used only for exclusion asserts. */
  privateIdentity?: Partial<PrivateIdentityFields> | null;
  document?: EvidenceAiDocumentInput | null;
  approvedEvidence?: EvidenceAiApprovedItem[];
  longitudinalSummary?: string | null;
  contradictions?: string[];
  tokenBudgetChars?: number;
};

export type EvidenceAiContext = {
  relationship: RelationshipAiContext;
  systemAddendum: string;
  userPrompt: string;
  serialisedPayload: string;
  extractionVersion: string;
  contentHash: string | null;
};

const PSYCHOMETRIC_RULES = `
PSYCHOMETRIC AND ASSESSMENT RULES

Psychometric and behavioural assessments describe preferences or reported patterns.
They do not establish ability, potential, diagnosis, fixed personality, promotion suitability or future performance.

Never write:
"You are a High D so..."

Prefer:
"The DISC report suggests a preference for..."

If assessment conflicts with observed behaviour, surface the difference without inventing an explanation.

DISC, MBTI and similar frameworks must never dominate Development Intelligence.
`.trim();

const EVIDENCE_REASONING_RULES = `
EVIDENCE REASONING

Distinguish clearly:
- EVIDENCE: what is actually present
- INTERPRETATION: what the evidence may suggest
- UNCERTAINTY: what cannot yet be concluded
- RECOMMENDATION: what may be useful to consider

Never blur these categories.

Prefer:
"The available evidence suggests..."
"Across recent evidence sources..."
"There is emerging evidence of..."
"Evidence is currently mixed..."
"There is not yet enough evidence to conclude..."
"A useful next area to explore may be..."

Avoid:
"This proves..."
"You are..."
"This person is..."
"Clearly..."
"Definitely..."
"High potential..."
"Ready for promotion..."

Never manufacture observations to make a profile appear complete.
If evidence is absent, leave it absent.
`.trim();

/**
 * Canonical builder — use for every evidence-analysis AI route.
 */
export function buildEvidenceAiContext(
  input: BuildEvidenceAiContextInput
): EvidenceAiContext {
  const relationship = buildRelationshipAiContext(
    input.client,
    input.privateIdentity
  );

  const budget = input.tokenBudgetChars ?? 12000;
  const personLines = formatRelationshipAiPersonContext(relationship, {
    includeOrganisation: relationship.identityMode !== "confidential",
  });

  const payloadObject: Record<string, unknown> = {
    identityMode: relationship.identityMode,
    aiDisplayName: relationship.aiDisplayName,
    role: relationship.role,
    organisation:
      relationship.identityMode === "confidential"
        ? undefined
        : relationship.organisation || undefined,
    purpose: "development_evidence_analysis",
  };

  assertNoForbiddenEvidenceAiFields(payloadObject);

  const sections: string[] = [
    "Analyse the following development evidence for manager development intelligence.",
    "",
    "Person context (public relationship identity only):",
    ...personLines,
    "",
  ];

  if (input.document) {
    const sanitized = sanitizeEvidenceTextForAi(
      input.document.extractedText,
      input.privateIdentity
    );
    const clipped = clip(sanitized, Math.floor(budget * 0.55));
    sections.push(
      "Document under review:",
      `Evidence type: ${EVIDENCE_TYPE_LABELS[input.document.evidenceType]}`,
      input.document.evidenceDate
        ? `Evidence date: ${input.document.evidenceDate}`
        : "Evidence date: not supplied"
    );
    if (input.document.purpose) {
      sections.push(
        `Purpose: ${sanitizeEvidenceTextForAi(input.document.purpose, input.privateIdentity)}`
      );
    }
    if (input.document.fileName) {
      sections.push(`File name: ${sanitizeFileName(input.document.fileName)}`);
    }
    sections.push("", "Extracted text (sanitised):", clipped, "");
  }

  if (input.longitudinalSummary?.trim()) {
    sections.push(
      "Longitudinal development summary (approved evidence only):",
      clip(
        sanitizeEvidenceTextForAi(
          input.longitudinalSummary,
          input.privateIdentity
        ),
        Math.floor(budget * 0.15)
      ),
      ""
    );
  }

  const approved = input.approvedEvidence ?? [];
  if (approved.length > 0) {
    sections.push("Recent high-relevance approved evidence:");
    let used = 0;
    const approvedBudget = Math.floor(budget * 0.25);
    for (const item of approved.slice(0, 8)) {
      const block = formatApprovedEvidenceBlock(item, input.privateIdentity);
      if (used + block.length > approvedBudget) break;
      sections.push(block, "");
      used += block.length;
    }
  }

  if (input.contradictions?.length) {
    sections.push(
      "Known contradictory signals:",
      ...input.contradictions
        .slice(0, 6)
        .map(
          item =>
            `- ${sanitizeEvidenceTextForAi(item, input.privateIdentity)}`
        ),
      ""
    );
  }

  const isPsychometric =
    input.document &&
    (PSYCHOMETRIC_EVIDENCE_TYPES as readonly string[]).includes(
      input.document.evidenceType
    );

  if (isPsychometric) {
    sections.push(
      "Return structured JSON only with this shape:",
      JSON.stringify(
        {
          observations: [
            {
              title: "concise string",
              description: "concise string",
              behaviouralEvidence: "short supporting excerpt or paraphrase",
              developmentImplication: "one short sentence optional",
              sourceConfidence: "low|medium|high",
              assessmentContext:
                "preference/contextual framing when needed for this assessment",
              capabilityKey: "optional pridmora capability key",
              limitations: "string optional",
            },
          ],
          strengthSignals: [],
          developmentSignals: [],
          capabilitySignals: [],
          contradictoryEvidence: [],
          limitations: [],
        },
        null,
        2
      ),
      "",
      `Hard limit: at most ${EVIDENCE_ANALYSIS_MAX_OBSERVATIONS_PSYCHOMETRIC} observations.`,
      "Prioritise the strongest preference or contextual signals supported by the assessment.",
      "Keep each field concise. Do not write exhaustive narrative.",
      "Treat this assessment as preference/contextual evidence only.",
      "Do not invent observations."
    );
  } else {
    sections.push(
      "Return structured JSON only with this shape:",
      JSON.stringify(
        {
          observations: [
            {
              title: "concise string",
              description: "concise string",
              behaviouralEvidence: "short supporting evidence",
              developmentImplication: "one short sentence optional",
              capabilityKey: "optional pridmora capability key when genuinely supported",
            },
          ],
          limitations: [],
        },
        null,
        2
      ),
      "",
      `Hard limit: at most ${EVIDENCE_ANALYSIS_MAX_OBSERVATIONS} observations.`,
      "Prioritise the strongest, most developmentally useful evidence-backed observations for manager review.",
      "Each observation must be concise. Do not generate repetitive parallel narrative.",
      "Do not include assessmentContext.",
      "Leave strengthSignals, developmentSignals, capabilitySignals and contradictoryEvidence empty unless essential — prefer observations.",
      "Do not invent observations. Fewer strong observations are better than many weak ones."
    );
  }

  const userPrompt = sections.join("\n");
  const serialisedPayload = userPrompt;

  assertAiPayloadExcludesPrivateIdentity(
    serialisedPayload,
    input.privateIdentity ?? {}
  );

  // Guard: confidential reference may exist for practitioner context but
  // organisation-level aggregation must not use this builder's document text.
  if (relationship.identityMode === "confidential") {
    assertNoPrivateIdentityLeakPatterns(serialisedPayload);
  }

  return {
    relationship,
    systemAddendum: [PSYCHOMETRIC_RULES, EVIDENCE_REASONING_RULES].join("\n\n"),
    userPrompt,
    serialisedPayload,
    extractionVersion: EXTRACTION_VERSION,
    contentHash: input.document?.contentHash ?? null,
  };
}

function formatApprovedEvidenceBlock(
  item: EvidenceAiApprovedItem,
  privateIdentity?: Partial<PrivateIdentityFields> | null
): string {
  const lines = [
    `- ${item.title} (${EVIDENCE_TYPE_LABELS[item.evidenceType]}, ${item.freshnessClass})`,
  ];
  if (item.sourceSummary) {
    lines.push(
      `  Summary: ${sanitizeEvidenceTextForAi(item.sourceSummary, privateIdentity)}`
    );
  }
  for (const observation of (item.observations ?? []).slice(0, 3)) {
    lines.push(
      `  Observation: ${sanitizeEvidenceTextForAi(observation.title, privateIdentity)} — ${sanitizeEvidenceTextForAi(observation.description, privateIdentity)}`
    );
  }
  return lines.join("\n");
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 180);
}

function clip(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[truncated for token budget]`;
}

function assertNoPrivateIdentityLeakPatterns(payload: string): void {
  // Soft structural guard — private values are asserted separately.
  const lower = payload.toLowerCase();
  if (lower.includes("private_notes") || lower.includes("real_name")) {
    throw new Error("Evidence AI payload contains forbidden private identity keys.");
  }
}

export function parseStructuredEvidenceJson(
  raw: string
): StructuredEvidence {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return { observations: [], limitations: ["Unable to parse structured evidence."] };
  }

  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as StructuredEvidence;
    return {
      observations: Array.isArray(parsed.observations)
        ? parsed.observations
            .filter(item => item && typeof item.title === "string")
            .map(item => ({
              title: String(item.title).trim(),
              description: String(item.description ?? "").trim(),
              category: item.category ? String(item.category) : undefined,
              behaviouralEvidence: item.behaviouralEvidence
                ? String(item.behaviouralEvidence)
                : undefined,
              developmentImplication: item.developmentImplication
                ? String(item.developmentImplication)
                : undefined,
              sourceConfidence:
                item.sourceConfidence === "low" ||
                item.sourceConfidence === "high" ||
                item.sourceConfidence === "medium"
                  ? item.sourceConfidence
                  : "medium",
              assessmentContext: item.assessmentContext
                ? String(item.assessmentContext)
                : undefined,
              limitations: item.limitations ? String(item.limitations) : undefined,
              capabilityKey: item.capabilityKey
                ? String(item.capabilityKey)
                : undefined,
            }))
        : [],
      strengthSignals: asStringArray(parsed.strengthSignals),
      developmentSignals: asStringArray(parsed.developmentSignals),
      capabilitySignals: asStringArray(parsed.capabilitySignals),
      contradictoryEvidence: asStringArray(parsed.contradictoryEvidence),
      context: asStringArray(parsed.context),
      limitations: asStringArray(parsed.limitations),
    };
  } catch {
    return {
      observations: [],
      limitations: ["Structured evidence response was invalid JSON."],
    };
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => typeof item === "string" && item.trim())
    .map(item => String(item).trim());
}
