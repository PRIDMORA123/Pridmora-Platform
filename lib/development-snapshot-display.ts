import {
  filterSemanticDuplicates,
  isStrongDuplicate,
} from "@/lib/intelligence/semantic-overlap";
import type {
  DevelopmentSnapshotArea,
  DevelopmentSnapshotModel,
} from "@/lib/development-snapshot";
import type { DevelopmentTheme } from "@/types/development-profile";

export type VisibleDevelopmentSnapshotStory = {
  whatMattersNow: string;
  recentProgress: DevelopmentSnapshotArea[];
  currentFocus: string | null;
};

function duplicatesAny(value: string, rivals: string[]): boolean {
  return rivals.some(rival => isStrongDuplicate(value, rival));
}

/**
 * Display-only snapshot story: What matters now → distinct recent progress →
 * distinct current focus. Does not mutate snapshot builder data.
 */
export function visibleDevelopmentSnapshotStory(
  snapshot: DevelopmentSnapshotModel,
  blockedInsights: string[] = []
): VisibleDevelopmentSnapshotStory {
  const whatMattersNow = snapshot.currentDirection.trim();
  const blocked = [...blockedInsights.map(item => item.trim()), whatMattersNow]
    .filter(Boolean);

  const focusRaw = snapshot.currentFocus.trim();
  const currentFocus =
    focusRaw && !duplicatesAny(focusRaw, blocked) ? focusRaw : null;

  const progressBlocked = currentFocus ? [...blocked, currentFocus] : blocked;
  const recentProgress = snapshot.areas.filter(
    area => !duplicatesAny(area.label, progressBlocked)
  );

  return { whatMattersNow, recentProgress, currentFocus };
}

export function visibleDevelopmentProfileSections(input: {
  snapshot: DevelopmentSnapshotModel;
  themes: DevelopmentTheme[];
  lookingAhead: string[];
  emergingStrengths: string[];
  blockedInsights?: string[];
}): {
  story: VisibleDevelopmentSnapshotStory;
  themes: DevelopmentTheme[];
  lookingAhead: string[];
  emergingStrengths: string[];
} {
  const blockedInsights = input.blockedInsights ?? [];
  const story = visibleDevelopmentSnapshotStory(input.snapshot, blockedInsights);
  const blocked = [
    story.whatMattersNow,
    story.currentFocus ?? "",
    ...story.recentProgress.map(area => area.label),
    ...blockedInsights,
  ].filter(Boolean);

  return {
    story,
    themes: input.themes.filter(
      theme =>
        !duplicatesAny(theme.name, blocked) &&
        !story.recentProgress.some(area => area.id === theme.id)
    ),
    lookingAhead: filterSemanticDuplicates(input.lookingAhead, blocked),
    emergingStrengths: filterSemanticDuplicates(
      input.emergingStrengths,
      blocked
    ),
  };
}
