/**
 * Compose Development page headline intelligence.
 *
 * Product rule: after a reviewed Development Update is applied, the living
 * development_profile is authoritative for current Development Intelligence.
 * The evidence library remains authoritative for uploaded/reviewed evidence
 * signals, but its empty state must not contradict a populated profile.
 *
 * Profile-backed card semantics (display only):
 * - Current Position = present developmental state (not currentFocus)
 * - Trajectory = progression over time
 * - Priorities = growth/development areas
 * - Capabilities & Patterns = behavioural/coaching patterns
 * - Strengths = demonstrated positive behaviour
 * - Next Focus = currentFocus / forward edge
 *
 * Narrative quality: never embed complete stored sentences mid-template.
 */

import type { DevelopmentIntelligenceEvidenceView } from "@/lib/development-evidence/types";
import type {
  DevelopmentProfile,
  ProfileEntry,
  ProfileEntryStatus,
} from "@/lib/development-updates/types";
import type { CoachingPattern } from "@/lib/patterns/types";

export type DevelopmentHeadlineSource =
  | "evidence_library"
  | "development_profile"
  | "empty";

export type DevelopmentHeadlineIntelligence = DevelopmentIntelligenceEvidenceView & {
  headlineSource: DevelopmentHeadlineSource;
  /**
   * Profile-derived behavioural pattern statements for the Capabilities card
   * when evidence-library capability insights are unavailable.
   * Not uploaded evidence — attributed as profile-backed in the UI.
   */
  profileBehaviouralPatterns: string[];
};

const ZERO_EVIDENCE_TRAJECTORY =
  "There is not yet enough reviewed evidence to describe a development trajectory.";

const DEMONSTRATED_STATUSES: ReadonlySet<ProfileEntryStatus> = new Set([
  "supported",
  "well_established",
]);

const SENTENCE_STARTERS =
  /^(i|we|they|he|she|it|this|that|there|alex|confidence|evidence|the next|development|reviewed)\b/i;

function entryValues(entries: ProfileEntry[] | undefined): string[] {
  return (entries ?? [])
    .map(entry => entry.value.trim())
    .filter(Boolean);
}

function entriesWithStatus(
  entries: ProfileEntry[] | undefined,
  statuses: ReadonlySet<ProfileEntryStatus>
): string[] {
  return (entries ?? [])
    .filter(entry => statuses.has(entry.status))
    .map(entry => entry.value.trim())
    .filter(Boolean);
}

function acceptedCoachingPatterns(profile: DevelopmentProfile): CoachingPattern[] {
  return (profile.coachingPatterns ?? []).filter(
    pattern =>
      !pattern.suppressed &&
      pattern.coachAccepted !== false &&
      (pattern.strength === "emerging" || pattern.strength === "established")
  );
}

function profileHasReviewedSignals(profile: DevelopmentProfile | null | undefined): boolean {
  if (!profile) return false;
  return (
    Boolean(profile.currentFocus?.trim()) ||
    entryValues(profile.strengths).length > 0 ||
    entryValues(profile.emergingThemes).length > 0 ||
    entryValues(profile.growthAreas).length > 0 ||
    entryValues(profile.patterns).length > 0 ||
    acceptedCoachingPatterns(profile).length > 0
  );
}

/**
 * Evidence-library intelligence is meaningful when included reviewed evidence
 * already contributes strengths, capabilities, priorities, or recent items.
 * currentFocus / currentPosition alone does not count.
 */
export function evidenceLibraryHasMeaningfulSignals(
  view: DevelopmentIntelligenceEvidenceView
): boolean {
  return (
    view.strengthsBeingDemonstrated.length > 0 ||
    view.capabilities.length > 0 ||
    view.developmentPriorities.length > 0 ||
    view.recentEvidence.length > 0
  );
}

function normaliseForCompare(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^continue exploring:\s*/i, "")
    .replace(/\s+/g, " ");
}

function dedupeAgainst(values: string[], blocked: string[]): string[] {
  const blockedSet = new Set(blocked.map(normaliseForCompare).filter(Boolean));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = normaliseForCompare(value);
    if (!key || blockedSet.has(key) || seen.has(key)) continue;
    seen.add(key);
    result.push(value.trim());
  }
  return result;
}

/** Conservative: prefer treating as a complete statement when unsure. */
export function isCompleteStatement(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/[.!?]$/.test(text)) return true;
  if (text.includes(". ")) return true;
  if (/\b(is|are|has|have|was|were|remains|remain|shows|show|appears|beginning|moving|becoming)\b/i.test(text) && text.split(/\s+/).length >= 6) {
    return true;
  }
  if (SENTENCE_STARTERS.test(text) && text.split(/\s+/).length >= 5) {
    return true;
  }
  return false;
}

function ensureSentence(value: string): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return "";
  if (/[.!?]$/.test(text)) return text;
  return `${text}.`;
}

function lowerFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function joinPhrases(parts: string[]): string {
  const unique = Array.from(
    new Set(parts.map(part => part.trim()).filter(Boolean))
  );
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0]!;
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

function joinStandaloneStatements(parts: string[]): string {
  return parts
    .map(part => ensureSentence(part))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Present-state Current Position — never uses currentFocus as the primary source.
 * Never embeds complete statements mid-clause.
 */
export function buildProfileCurrentPosition(input: {
  demonstratedStrengths: string[];
  themes: string[];
  behaviouralPatterns: string[];
  growthAreas: string[];
}): string {
  const { demonstratedStrengths, themes, behaviouralPatterns, growthAreas } = input;
  const theme = themes[0]?.trim() || "";
  const strengthA = demonstratedStrengths[0]?.trim() || "";
  const strengthB = demonstratedStrengths[1]?.trim() || "";
  const edge = growthAreas[0]?.trim() || "";
  const pattern = behaviouralPatterns[0]?.trim() || "";

  const sentences: string[] = [];

  // Prefer complete theme statement as the opening present-state picture.
  if (theme && isCompleteStatement(theme)) {
    sentences.push(ensureSentence(theme));
  } else if (theme) {
    sentences.push(ensureSentence(`${theme} is a current development theme`));
  }

  if (strengthA && isCompleteStatement(strengthA)) {
    sentences.push(ensureSentence(strengthA));
  } else if (strengthA && strengthB && !isCompleteStatement(strengthB)) {
    sentences.push(
      ensureSentence(
        `${strengthA} and ${lowerFirst(strengthB)} are coming through as strengths`
      )
    );
  } else if (strengthA) {
    sentences.push(
      ensureSentence(`${strengthA} is coming through as a demonstrated strength`)
    );
  } else if (pattern && isCompleteStatement(pattern)) {
    sentences.push(ensureSentence(pattern));
  } else if (pattern) {
    sentences.push(
      ensureSentence(`${pattern} is a recurring behavioural pattern`)
    );
  }

  // Optional remaining edge — only if we still have room and it isn't a long duplicate.
  if (sentences.length < 2 && edge) {
    if (isCompleteStatement(edge)) {
      sentences.push(ensureSentence(edge));
    } else {
      sentences.push(
        ensureSentence(`${edge} remains an open development edge`)
      );
    }
  }

  if (sentences.length === 0) {
    return "Present developmental state is beginning to take shape from applied coaching conversations.";
  }

  return joinStandaloneStatements(sentences.slice(0, 2));
}

/**
 * Deterministic progression statement — answers “What is different now?”
 * Never embeds complete statements mid-clause.
 */
export function buildProfileDevelopmentTrajectory(input: {
  demonstratedStrengths: string[];
  emergingStrengths: string[];
  themes: string[];
  growthAreas: string[];
  establishedPatterns: number;
  emergingPatterns: number;
}): string {
  const {
    demonstratedStrengths,
    emergingStrengths,
    themes,
    growthAreas,
    establishedPatterns,
    emergingPatterns,
  } = input;

  const establishedSignals =
    demonstratedStrengths.length + establishedPatterns;
  const emergingSignals =
    emergingStrengths.length + emergingPatterns + growthAreas.length;

  const establishedPhrase = demonstratedStrengths
    .filter(value => !isCompleteStatement(value))
    .slice(0, 2);
  const establishedSentence = demonstratedStrengths.find(isCompleteStatement);
  const emergingPhrase = [
    ...growthAreas.filter(value => !isCompleteStatement(value)),
    ...emergingStrengths.filter(value => !isCompleteStatement(value)),
  ].slice(0, 2);
  const emergingSentence =
    growthAreas.find(isCompleteStatement) ||
    emergingStrengths.find(isCompleteStatement);
  const themePhrase = themes.filter(value => !isCompleteStatement(value)).slice(0, 1);
  const themeSentence = themes.find(isCompleteStatement);

  if (establishedSignals > 0 && emergingSignals > 0) {
    const parts: string[] = [];
    if (establishedSentence) {
      parts.push(ensureSentence(establishedSentence));
    } else if (establishedPhrase.length > 0) {
      parts.push(
        ensureSentence(
          `${joinPhrases(establishedPhrase)} ${
            establishedPhrase.length === 1 ? "is" : "are"
          } becoming more established in practice`
        )
      );
    } else if (themeSentence) {
      parts.push(ensureSentence(themeSentence));
    } else if (themePhrase.length > 0) {
      parts.push(
        ensureSentence(
          `There is evidence of movement from recognising ${joinPhrases(
            themePhrase
          )} toward more consistent practice`
        )
      );
    }

    if (emergingSentence) {
      parts.push(ensureSentence(emergingSentence));
    } else if (emergingPhrase.length > 0) {
      parts.push(
        ensureSentence(
          `${joinPhrases(emergingPhrase)} ${
            emergingPhrase.length === 1 ? "is" : "are"
          } still emerging`
        )
      );
    } else {
      parts.push("Other development edges are still emerging.");
    }

    return joinStandaloneStatements(parts.slice(0, 2));
  }

  if (establishedSignals > 0) {
    if (establishedSentence) {
      return ensureSentence(establishedSentence);
    }
    if (establishedPhrase.length > 0) {
      return ensureSentence(
        `${joinPhrases(establishedPhrase)} ${
          establishedPhrase.length === 1 ? "is" : "are"
        } becoming more established in practice`
      );
    }
    return "There is evidence of movement from intention toward more established practice.";
  }

  if (themes.length > 0 && growthAreas.length > 0) {
    const themeBit = themeSentence
      ? ensureSentence(themeSentence)
      : themePhrase.length > 0
        ? ensureSentence(
            `There is evidence of movement from recognising ${joinPhrases(
              themePhrase
            )} toward clearer action`
          )
        : "";
    const growthBit = emergingSentence
      ? ensureSentence(emergingSentence)
      : emergingPhrase.length > 0
        ? ensureSentence(
            `${joinPhrases(emergingPhrase.slice(0, 2))} ${
              emergingPhrase.length === 1 ? "remains" : "remain"
            } an area for development`
          )
        : "";
    return joinStandaloneStatements([themeBit, growthBit].filter(Boolean).slice(0, 2));
  }

  if (themeSentence) {
    return ensureSentence(themeSentence);
  }
  if (themePhrase.length > 0) {
    return ensureSentence(
      `${joinPhrases(themePhrase)} ${
        themePhrase.length === 1 ? "is" : "are"
      } becoming clearer over time`
    );
  }

  if (emergingSignals > 0) {
    return "Development remains largely emerging: awareness and intention are present, but sustained change is not yet firmly established.";
  }

  return "Change over time is not yet clear enough to describe with confidence.";
}

function presentStrengthItem(value: string, emergingOnly: boolean): string {
  const text = value.trim();
  if (!text) return "";
  if (emergingOnly) {
    if (isCompleteStatement(text)) {
      return /emerging/i.test(text)
        ? ensureSentence(text)
        : ensureSentence(`${text.replace(/[.!?]$/, "")} — still emerging`);
    }
    return `${text} — still emerging`;
  }
  return text;
}

function buildProfileBackedHeadline(
  evidenceView: DevelopmentIntelligenceEvidenceView,
  profile: DevelopmentProfile
): DevelopmentHeadlineIntelligence {
  const allStrengths = profile.strengths ?? [];
  const demonstratedStrengths = entriesWithStatus(
    allStrengths,
    DEMONSTRATED_STATUSES
  ).slice(0, 6);
  const emergingStrengths = entriesWithStatus(
    allStrengths,
    new Set<ProfileEntryStatus>(["emerging"])
  ).slice(0, 6);

  const themes = entryValues(profile.emergingThemes).slice(0, 6);
  const growthAreas = entryValues(profile.growthAreas).slice(0, 6);
  const profilePatterns = entryValues(profile.patterns).slice(0, 6);
  const coaching = acceptedCoachingPatterns(profile);
  const coachingTitles = coaching
    .map(pattern => pattern.title.trim())
    .filter(Boolean)
    .slice(0, 6);
  const behaviouralPatterns = Array.from(
    new Set([...profilePatterns, ...coachingTitles])
  ).slice(0, 6);

  const establishedPatterns = coaching.filter(
    pattern => pattern.strength === "established"
  ).length;
  const emergingPatterns = coaching.filter(
    pattern => pattern.strength === "emerging"
  ).length;

  const focus = profile.currentFocus?.trim() || "";
  const nextDevelopmentFocus =
    focus ||
    growthAreas[0] ||
    themes[0] ||
    "Continue with the highest-priority development edge from coaching conversations.";

  const developmentPriorities = dedupeAgainst(growthAreas, [
    nextDevelopmentFocus,
    focus,
  ]).slice(0, 3);

  const strengthsBeingDemonstrated =
    demonstratedStrengths.length > 0
      ? demonstratedStrengths.map(value => presentStrengthItem(value, false))
      : emergingStrengths.length > 0
        ? emergingStrengths
            .map(value => presentStrengthItem(value, true))
            .filter(Boolean)
        : [];

  const currentPosition = buildProfileCurrentPosition({
    demonstratedStrengths,
    themes,
    behaviouralPatterns,
    growthAreas,
  });

  const developmentTrajectory = buildProfileDevelopmentTrajectory({
    demonstratedStrengths,
    emergingStrengths,
    themes,
    growthAreas,
    establishedPatterns,
    emergingPatterns,
  });

  return {
    ...evidenceView,
    headlineSource: "development_profile",
    currentPosition,
    developmentTrajectory,
    strengthsBeingDemonstrated,
    developmentPriorities,
    nextDevelopmentFocus,
    // Do not invent evidence-library capability confidence from profile entries.
    capabilities: [],
    profileBehaviouralPatterns: behaviouralPatterns,
  };
}

/**
 * Compose headline cards for the Development page.
 * Prefer meaningful evidence-library signals; otherwise fall back to the
 * living development profile; otherwise keep true empty evidence states.
 *
 * Idempotent: if the view was already composed (e.g. at the API boundary),
 * return it unchanged so client-side defence-in-depth cannot relabel
 * profile-backed headlines as evidence-library intelligence.
 */
export function composeDevelopmentHeadlineIntelligence(input: {
  evidenceView: DevelopmentIntelligenceEvidenceView | DevelopmentHeadlineIntelligence;
  profile?: DevelopmentProfile | null;
}): DevelopmentHeadlineIntelligence {
  const { evidenceView, profile = null } = input;
  const alreadyComposed = evidenceView as DevelopmentHeadlineIntelligence;
  if (
    alreadyComposed.headlineSource === "development_profile" ||
    alreadyComposed.headlineSource === "evidence_library" ||
    alreadyComposed.headlineSource === "empty"
  ) {
    return {
      ...alreadyComposed,
      profileBehaviouralPatterns: alreadyComposed.profileBehaviouralPatterns ?? [],
    };
  }

  if (evidenceLibraryHasMeaningfulSignals(evidenceView)) {
    return {
      ...evidenceView,
      headlineSource: "evidence_library",
      profileBehaviouralPatterns: [],
    };
  }

  if (profileHasReviewedSignals(profile)) {
    return buildProfileBackedHeadline(evidenceView, profile as DevelopmentProfile);
  }

  return {
    ...evidenceView,
    // Preserve evidence empty-state trajectory wording when both layers empty.
    developmentTrajectory:
      evidenceView.developmentTrajectory || ZERO_EVIDENCE_TRAJECTORY,
    headlineSource: "empty",
    profileBehaviouralPatterns: [],
  };
}
