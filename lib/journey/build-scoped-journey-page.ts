import {
  buildJourneyPageViewModel,
  type JourneyPageViewModel,
} from "@/lib/client-journey";
import { assertJourneyViewModelPersonMatch } from "@/lib/journey/assert-journey-person-match";
import { assertJourneySourcesForRelationship } from "@/lib/journey/load-journey-view-model";
import type {
  DevelopmentProfile,
  DevelopmentUpdate,
} from "@/lib/development-updates/types";
import type { Client } from "@/lib/types";

/**
 * The Journey Overview page path that is actually rendered.
 */
export function buildScopedJourneyPageViewModel(
  client: Client,
  profile: DevelopmentProfile | null | undefined,
  updates: DevelopmentUpdate[],
  journeyStageLabel: string,
  knownOtherNames: string[] = []
): JourneyPageViewModel {
  const relationshipId = client.id;
  const conversations = client.sessions.filter(
    session => session.clientId === relationshipId
  );

  assertJourneySourcesForRelationship(relationshipId, {
    conversations,
    updates,
    profile: profile ?? null,
  });

  const scopedClient: Client = {
    ...client,
    sessions: conversations,
  };

  const page = buildJourneyPageViewModel(
    scopedClient,
    profile,
    updates,
    journeyStageLabel
  );

  assertJourneyViewModelPersonMatch({
    expectedPersonName: scopedClient.name,
    headline: page.currentPosition.headline,
    narrative: page.currentPosition.narrative,
    evidence: page.currentPosition.evidence,
    commitment: page.currentPosition.commitment,
    emergingDirection: page.currentPosition.emergingDirection,
    nextFocus: page.lookingAhead.nextFocus,
    timelineSummaries: page.milestones.flatMap(item => [
      item.title,
      item.summary,
    ]),
    knownOtherNames,
  });

  return page;
}
