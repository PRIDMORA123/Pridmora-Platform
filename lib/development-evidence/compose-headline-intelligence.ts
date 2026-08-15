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

function joinUk(parts: string[]): string {
  const unique = Array.from(new Set(parts.map(part => part.trim()).filter(Boolean)));
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0]!;
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

/**
 * Present-state Current Position — never uses currentFocus as the primary source.
 */
export function buildProfileCurrentPosition(input: {
  demonstratedStrengths: string[];
  themes: string[];
  behaviouralPatterns: string[];
  growthAreas: string[];
}): string {
  const { demonstratedStrengths, themes, behaviouralPatterns, growthAreas } = input;

  if (demonstratedStrengths.length > 0 && themes.length > 0) {
    return `Reviewed development currently centres on ${joinUk(
      themes.slice(0, 2)
    )}, with demonstrated strengths including ${joinUk(
      demonstratedStrengths.slice(0, 2)
    )}.`;
  }
  if (demonstratedStrengths.length > 0) {
    return `Reviewed development currently shows demonstrated strengths in ${joinUk(
      demonstratedStrengths.slice(0, 3)
    )}.`;
  }
  if (themes.length > 0 && behaviouralPatterns.length > 0) {
    return `Reviewed development currently centres on ${joinUk(
      themes.slice(0, 2)
    )}, with recurring behavioural patterns around ${joinUk(
      behaviouralPatterns.slice(0, 2)
    )}.`;
  }
  if (themes.length > 0) {
    return `Reviewed development currently centres on ${joinUk(themes.slice(0, 3))}.`;
  }
  if (behaviouralPatterns.length > 0) {
    return `Reviewed development currently shows recurring behavioural patterns around ${joinUk(
      behaviouralPatterns.slice(0, 3)
    )}.`;
  }
  if (growthAreas.length > 0) {
    return `Reviewed development currently remains open around ${joinUk(
      growthAreas.slice(0, 3)
    )}.`;
  }
  return "Reviewed development signals from applied coaching conversations describe the person’s present developmental state.";
}

/**
 * Deterministic progression statement — not a raw theme/strength concatenation.
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

  if (establishedSignals > 0 && emergingSignals > 0) {
    const progressed = joinUk(
      [
        ...demonstratedStrengths.slice(0, 2),
        ...themes.slice(0, 1),
      ].filter(Boolean)
    );
    const stillEmerging = joinUk(
      [...growthAreas.slice(0, 2), ...emergingStrengths.slice(0, 1)].filter(
        Boolean
      )
    );
    if (progressed && stillEmerging) {
      return `Reviewed signals show strengthening evidence around ${progressed}, while ${stillEmerging} remains emerging rather than established.`;
    }
    if (progressed) {
      return `Reviewed signals show strengthening evidence around ${progressed}, with other development edges still emerging.`;
    }
  }

  if (establishedSignals > 0) {
    const progressed = joinUk(
      [
        ...demonstratedStrengths.slice(0, 3),
        ...(demonstratedStrengths.length === 0 ? themes.slice(0, 2) : []),
      ].filter(Boolean)
    );
    return progressed
      ? `Reviewed signals suggest movement from intention toward demonstrated practice in ${progressed}.`
      : "Reviewed signals suggest movement from intention toward more established practice.";
  }

  if (themes.length > 0 && growthAreas.length > 0) {
    return `Reviewed development is progressing from awareness of ${joinUk(
      themes.slice(0, 2)
    )} toward clearer action on ${joinUk(growthAreas.slice(0, 2))}.`;
  }

  if (themes.length > 0) {
    return `Reviewed development themes are becoming clearer over time, with ${joinUk(
      themes.slice(0, 3)
    )} now visible across conversations.`;
  }

  if (emergingSignals > 0) {
    return "Reviewed development remains largely emerging: awareness and intention are present, but sustained change is not yet firmly established.";
  }

  return "Reviewed development signals are beginning to describe how this relationship is progressing over time.";
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
    "Continue with the highest-priority reviewed development signal from the living profile.";

  const developmentPriorities = dedupeAgainst(growthAreas, [
    nextDevelopmentFocus,
    focus,
  ]).slice(0, 6);

  const strengthsBeingDemonstrated =
    demonstratedStrengths.length > 0
      ? demonstratedStrengths
      : emergingStrengths.length > 0
        ? emergingStrengths.map(
            value => `${value} (emerging — not yet firmly demonstrated)`
          )
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
