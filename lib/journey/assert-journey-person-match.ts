import {
  containsUnexpectedPersonName,
  RelationshipScopeIntegrityError,
} from "@/lib/relationship-scope";

const DEFAULT_KNOWN_OTHER_NAMES = [
  "Sarah Thompson",
  "Sarah Johnson",
  "Emma Brown",
  "Sally Brown",
  "David Smith",
];

/**
 * Hard-fail before rendering Journey content that names another coachee.
 * In production callers should catch and show the safe unavailable state.
 */
export function assertJourneyPersonMatch({
  expectedPersonName,
  content,
  knownOtherNames = DEFAULT_KNOWN_OTHER_NAMES,
}: {
  expectedPersonName: string;
  content: string;
  knownOtherNames?: string[];
}): void {
  if (!content?.trim()) return;

  if (
    containsUnexpectedPersonName(
      content,
      expectedPersonName,
      knownOtherNames
    )
  ) {
    throw new RelationshipScopeIntegrityError(
      `Journey content names another person but active relationship is ${expectedPersonName}.`
    );
  }
}

export function assertJourneyViewModelPersonMatch(input: {
  expectedPersonName: string;
  headline?: string;
  narrative?: string;
  evidence?: string;
  commitment?: string;
  emergingDirection?: string;
  nextFocus?: string;
  timelineSummaries?: string[];
  knownOtherNames?: string[];
}): void {
  const fields = [
    input.headline,
    input.narrative,
    input.evidence,
    input.commitment,
    input.emergingDirection,
    input.nextFocus,
    ...(input.timelineSummaries ?? []),
  ];

  for (const content of fields) {
    if (!content) continue;
    assertJourneyPersonMatch({
      expectedPersonName: input.expectedPersonName,
      content,
      knownOtherNames: input.knownOtherNames,
    });
  }
}
