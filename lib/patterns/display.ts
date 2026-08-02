import { distinctSessionIds } from "@/lib/patterns/evidence";
import {
  classifyPatternStrength,
  isDisplayablePattern,
  unresolvedAbsenceMessage,
} from "@/lib/patterns/classify";
import type {
  CoachingPattern,
  PatternEvidenceReference,
  SessionPatternInsight,
} from "@/lib/patterns/types";
import {
  INSUFFICIENT_PATTERN_MESSAGE,
  PATTERN_STATUS_LABELS,
  PATTERN_STRENGTH_LABELS,
} from "@/lib/patterns/types";

export function patternStrengthLabel(
  strength: CoachingPattern["strength"]
): string {
  return PATTERN_STRENGTH_LABELS[strength];
}

export function patternStatusLabel(
  status: CoachingPattern["status"]
): string {
  return PATTERN_STATUS_LABELS[status];
}

export function formatSupportedBySessions(
  pattern: CoachingPattern,
  sessionNumbers?: Map<string, number>
): string {
  const sessionIds = distinctSessionIds(pattern.evidence);
  if (sessionIds.length === 0) {
    const contextCount = pattern.evidence.filter(
      item => item.sourceType === "supporting_context"
    ).length;
    if (contextCount > 0) {
      return `Supported by ${contextCount} authorised supporting context source${
        contextCount === 1 ? "" : "s"
      }.`;
    }
    return `Supported by ${pattern.evidenceCount} evidence source${
      pattern.evidenceCount === 1 ? "" : "s"
    }.`;
  }

  const labels = sessionIds.map(id => {
    const number = sessionNumbers?.get(id);
    return number != null ? `Session ${number}` : "a reviewed session";
  });

  if (labels.length === 1) return `Supported by ${labels[0]}.`;
  if (labels.length === 2) return `Supported by ${labels[0]} and ${labels[1]}.`;
  const last = labels[labels.length - 1];
  return `Supported by ${labels.slice(0, -1).join(", ")} and ${last}.`;
}

export function coachReviewStateLabel(pattern: CoachingPattern): string {
  if (pattern.pendingSuggestion) return "Update suggested — review required";
  if (pattern.coachAccepted === true) return "Coach accepted";
  if (pattern.coachAccepted === false || pattern.suppressed) {
    return "Rejected";
  }
  if (!pattern.coachReviewed) return "Awaiting coach review";
  return "Reviewed";
}

/**
 * Summary & Insights — cautious session-level longitudinal claim.
 */
export function buildSessionPatternInsight(input: {
  sessionEvidence: PatternEvidenceReference[];
  existingPatterns: CoachingPattern[];
  sessionsSinceTheme?: number;
}): SessionPatternInsight {
  const { sessionEvidence, existingPatterns, sessionsSinceTheme = 0 } = input;

  if (sessionEvidence.length === 0) {
    return {
      kind: "insufficient",
      text: INSUFFICIENT_PATTERN_MESSAGE,
    };
  }

  const sessionStrength = classifyPatternStrength(sessionEvidence);

  for (const pattern of existingPatterns) {
    if (!isDisplayablePattern(pattern.strength)) continue;
    if (pattern.suppressed || pattern.coachAccepted === false) continue;

    const overlap = sessionEvidence.some(point =>
      pattern.evidence.some(
        existing =>
          existing.sourceId === point.sourceId ||
          (existing.sessionId &&
            point.sessionId &&
            existing.sessionId === point.sessionId)
      )
    );

    // Match by thematic overlap via shared session ids in combined evidence
    const combined = [...pattern.evidence, ...sessionEvidence];
    const combinedStrength = classifyPatternStrength(combined);
    const grew =
      combined.length > pattern.evidence.length &&
      combinedStrength !== "observation";

    if (grew && (overlap || titlesMayRelate(pattern, sessionEvidence))) {
      if (
        pattern.status === "reducing" ||
        (sessionsSinceTheme >= 2 && !overlap)
      ) {
        return {
          kind: "weakens",
          text: unresolvedAbsenceMessage(sessionsSinceTheme || 2),
          patternId: pattern.id,
        };
      }

      if (pattern.strength === "emerging" || combinedStrength === "emerging") {
        return {
          kind: "emerging",
          text: `Emerging theme: ${pattern.title} has appeared in ${Math.min(
            combined.length,
            pattern.evidenceCount + 1
          )} approved evidence sources.`,
          patternId: pattern.id,
        };
      }

      return {
        kind: "reinforces",
        text: `This session reinforces an existing ${patternStrengthLabel(
          pattern.strength
        ).toLowerCase()}: ${pattern.description}`,
        patternId: pattern.id,
      };
    }
  }

  if (sessionStrength === "observation") {
    return {
      kind: "insufficient",
      text: "This session provides an observation, but there is not yet enough longitudinal evidence for a pattern.",
    };
  }

  if (sessionStrength === "emerging") {
    return {
      kind: "emerging",
      text: `Emerging theme: related material has appeared across ${sessionEvidence.length} approved evidence sources.`,
    };
  }

  return {
    kind: "insufficient",
    text: INSUFFICIENT_PATTERN_MESSAGE,
  };
}

function titlesMayRelate(
  pattern: CoachingPattern,
  evidence: PatternEvidenceReference[]
): boolean {
  const haystack = evidence
    .map(item => item.excerpt ?? "")
    .join(" ")
    .toLowerCase();
  const tokens = pattern.title
    .toLowerCase()
    .split(/\s+/)
    .filter(token => token.length >= 4);
  return tokens.some(token => haystack.includes(token));
}

export function provenanceHref(reference: PatternEvidenceReference): string {
  if (reference.sessionId) {
    return `#evidence-session-${reference.sessionId}`;
  }
  if (reference.sourceType === "supporting_context") {
    return `#evidence-context-${reference.sourceId}`;
  }
  return `#evidence-${reference.sourceType}-${reference.sourceId}`;
}
