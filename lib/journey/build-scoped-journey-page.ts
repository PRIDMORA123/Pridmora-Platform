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

export type JourneyRenderTrace = {
  routeRelationshipId: string;
  loadedRelationshipId: string;
  personName: string;
  conversationIds: Array<{
    id: string;
    relationshipId: string;
    personName: string;
  }>;
  reflectionIds: Array<{ id: string; relationshipId: string }>;
  commitmentIds: Array<{ id: string; relationshipId: string }>;
  developmentUpdateIds: Array<{ id: string; relationshipId: string }>;
  storedJourneySummary: string;
};

/**
 * The Journey Overview page path that is actually rendered.
 * Marks itself so browser consoles prove this loader is live.
 */
export function buildScopedJourneyPageViewModel(
  client: Client,
  profile: DevelopmentProfile | null | undefined,
  updates: DevelopmentUpdate[],
  journeyStageLabel: string,
  knownOtherNames: string[] = []
): JourneyPageViewModel {
  // Temporary diagnostic marker — must appear when opening Journey.
  console.log("USING NEW RELATIONSHIP-SCOPED JOURNEY LOADER");

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

  const storedJourneySummary =
    page.currentPosition.narrative ||
    page.latestConversation?.approvedSummary ||
    "";

  const reflections = conversations
    .filter(
      session =>
        session.reflection.trim() ||
        session.reflectWhatShifted.trim() ||
        session.reflectProfessionalLearning.trim()
    )
    .map(session => ({
      id: session.id,
      relationshipId: session.clientId,
    }));

  const commitments = [
    ...conversations
      .filter(
        session => session.commitments.trim() || session.agreedActions.trim()
      )
      .map(session => ({
        id: `session:${session.id}`,
        relationshipId: session.clientId,
      })),
    ...(profile?.commitments ?? []).map(item => ({
      id: item.id,
      relationshipId: profile!.clientId,
    })),
  ];

  const trace: JourneyRenderTrace = {
    routeRelationshipId: relationshipId,
    loadedRelationshipId: scopedClient.id,
    personName: scopedClient.name,
    conversationIds: conversations.map(item => ({
      id: item.id,
      relationshipId: item.clientId,
      personName: scopedClient.name,
    })),
    reflectionIds: reflections,
    commitmentIds: commitments,
    developmentUpdateIds: updates.map(item => ({
      id: item.id,
      relationshipId: item.clientId,
    })),
    storedJourneySummary,
  };

  if (process.env.NODE_ENV !== "production") {
    console.group("Journey data trace");
    console.log("Journey route", {
      relationshipId,
      personName: scopedClient.name,
      note: "In this app relationshipId === clients.id (person workspace id).",
    });
    console.log(trace);
    console.groupEnd();
  }

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
