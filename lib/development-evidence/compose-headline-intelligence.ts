/**
 * Compose Development page headline intelligence.
 *
 * Product rule: after a reviewed Development Update is applied, the living
 * development_profile is authoritative for current Development Intelligence.
 * The evidence library remains authoritative for uploaded/reviewed evidence
 * signals, but its empty state must not contradict a populated profile.
 */

import type { DevelopmentIntelligenceEvidenceView } from "@/lib/development-evidence/types";
import type { DevelopmentProfile, ProfileEntry } from "@/lib/development-updates/types";

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

function entryValues(entries: ProfileEntry[] | undefined): string[] {
  return (entries ?? [])
    .map(entry => entry.value.trim())
    .filter(Boolean);
}

function profileHasReviewedSignals(profile: DevelopmentProfile | null | undefined): boolean {
  if (!profile) return false;
  const acceptedPatterns = (profile.coachingPatterns ?? []).filter(
    pattern =>
      !pattern.suppressed &&
      pattern.coachAccepted !== false &&
      (pattern.strength === "emerging" || pattern.strength === "established")
  );
  return (
    Boolean(profile.currentFocus?.trim()) ||
    entryValues(profile.strengths).length > 0 ||
    entryValues(profile.emergingThemes).length > 0 ||
    entryValues(profile.growthAreas).length > 0 ||
    entryValues(profile.patterns).length > 0 ||
    acceptedPatterns.length > 0
  );
}

/**
 * Evidence-library intelligence is meaningful when included reviewed evidence
 * already contributes strengths, capabilities, priorities, or recent items.
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

function buildProfileBackedHeadline(
  evidenceView: DevelopmentIntelligenceEvidenceView,
  profile: DevelopmentProfile
): DevelopmentHeadlineIntelligence {
  const strengths = entryValues(profile.strengths).slice(0, 6);
  const themes = entryValues(profile.emergingThemes).slice(0, 6);
  const growthAreas = entryValues(profile.growthAreas).slice(0, 6);
  const profilePatterns = entryValues(profile.patterns).slice(0, 6);
  const coachingPatterns = (profile.coachingPatterns ?? [])
    .filter(
      pattern =>
        !pattern.suppressed &&
        pattern.coachAccepted !== false &&
        (pattern.strength === "emerging" || pattern.strength === "established")
    )
    .map(pattern => pattern.title.trim())
    .filter(Boolean)
    .slice(0, 6);

  const behaviouralPatterns = Array.from(
    new Set([...profilePatterns, ...coachingPatterns])
  ).slice(0, 6);

  const focus = profile.currentFocus?.trim() || "";
  const priorities = Array.from(
    new Set([
      ...(focus ? [`Continue exploring: ${focus}`] : []),
      ...growthAreas,
    ])
  ).slice(0, 6);

  const currentPosition =
    focus ||
    (strengths[0]
      ? `Current reviewed development highlights ${strengths[0].toLowerCase()}.`
      : themes[0]
        ? `Current reviewed development centres on ${themes[0].toLowerCase()}.`
        : "Reviewed development signals from applied coaching conversations are available.");

  let developmentTrajectory: string;
  if (themes.length > 0 && strengths.length > 0) {
    developmentTrajectory = `The reviewed development profile shows progress in ${themes
      .slice(0, 2)
      .join(" and ")}, with demonstrated strengths including ${strengths
      .slice(0, 2)
      .join(" and ")}.`;
  } else if (themes.length > 0) {
    developmentTrajectory = `Reviewed development themes now include ${themes
      .slice(0, 3)
      .join(", ")}.`;
  } else if (strengths.length > 0) {
    developmentTrajectory = `Reviewed development strengths now include ${strengths
      .slice(0, 3)
      .join(", ")}.`;
  } else if (behaviouralPatterns.length > 0) {
    developmentTrajectory = `Reviewed coaching patterns are beginning to describe how development is progressing over time.`;
  } else if (focus) {
    developmentTrajectory = `Reviewed development focus is currently oriented toward ${focus}.`;
  } else {
    developmentTrajectory =
      "Reviewed development signals from applied coaching conversations are available.";
  }

  const nextDevelopmentFocus =
    focus ||
    growthAreas[0] ||
    themes[0] ||
    "Continue with the highest-priority reviewed development signal from the living profile.";

  return {
    ...evidenceView,
    headlineSource: "development_profile",
    currentPosition,
    developmentTrajectory,
    strengthsBeingDemonstrated: strengths,
    developmentPriorities: priorities,
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
