import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildJourneyPageViewModel,
  type JourneyPageViewModel,
} from "@/lib/client-journey";
import {
  getDevelopmentProfileForClient,
  listDevelopmentUpdatesForClient,
} from "@/lib/development-updates/repository";
import type {
  DevelopmentProfile,
  DevelopmentUpdate,
} from "@/lib/development-updates/types";
import { coachingStatusLabel } from "@/lib/identity-journey-path";
import {
  assertRelationshipOwnership,
  type RelationshipScope,
} from "@/lib/relationship-scope";
import { parseIdentityMode } from "@/lib/relationship-identity";
import { listSessionsForClientInDb } from "@/lib/supabase/repository";
import type { Client, Session } from "@/lib/types";

export type JourneySourceRecord = {
  relationshipId: string;
  id: string;
};

export type JourneyViewModel = JourneyPageViewModel & {
  relationshipId: string;
  coachId: string;
  personName: string;
  sourceRecords: JourneySourceRecord[];
  profile: DevelopmentProfile | null;
  updates: DevelopmentUpdate[];
};

async function getRelationship(
  supabase: SupabaseClient,
  { coachId, relationshipId }: RelationshipScope
): Promise<Omit<Client, "sessions"> | null> {
  const { data, error } = await supabase
    .from("clients")
    .select(
      "id, name, organisation, role, email, status, archived_at, current_focus, identity_summary, coach_insight, preparation_style_override, initials, created_at, updated_at, next_session, next_session_label, identity_mode, display_label, confidential_reference, ai_name_allowed"
    )
    .eq("id", relationshipId)
    .eq("coach_id", coachId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    name: data.name,
    initials: data.initials || "",
    organisation: data.organisation ?? "",
    role: data.role ?? "",
    email: data.email ?? "",
    identityMode: parseIdentityMode(data.identity_mode),
    displayLabel: data.display_label?.trim() || data.name,
    confidentialReference: data.confidential_reference?.trim() || null,
    aiNameAllowed: Boolean(data.ai_name_allowed),
    status: (data.status as Client["status"]) || "Active",
    archivedAt: data.archived_at ?? null,
    createdAt: data.created_at ?? "",
    nextSession: data.next_session_label ?? data.next_session ?? "",
    currentFocus: data.current_focus ?? "",
    identitySummary: data.identity_summary ?? "",
    coachInsight: data.coach_insight ?? "",
    preparationStyleOverride: null,
    strengths: [],
    values: [],
    themes: [],
    goals: [],
    actions: [],
    quotes: [],
    journey: [],
  };
}

export async function getRelationshipConversations(
  supabase: SupabaseClient,
  { coachId, relationshipId }: RelationshipScope
): Promise<Session[]> {
  const sessions = await listSessionsForClientInDb(
    supabase,
    coachId,
    relationshipId
  );
  return sessions ?? [];
}

export function reflectionsFromConversations(
  conversations: Session[]
): Array<{ relationshipId: string; id: string; reflection: string }> {
  return conversations
    .filter(
      session =>
        session.reflection.trim() ||
        session.reflectWhatShifted.trim() ||
        session.reflectProfessionalLearning.trim()
    )
    .map(session => ({
      relationshipId: session.clientId,
      id: session.id,
      reflection:
        session.reflection ||
        session.reflectWhatShifted ||
        session.reflectProfessionalLearning,
    }));
}

export function commitmentsFromSources(
  conversations: Session[],
  profile: DevelopmentProfile | null
): Array<{ relationshipId: string; id: string; value: string }> {
  const fromSessions = conversations
    .filter(
      session => session.commitments.trim() || session.agreedActions.trim()
    )
    .map(session => ({
      relationshipId: session.clientId,
      id: `session-commitment:${session.id}`,
      value: session.commitments || session.agreedActions,
    }));

  const fromProfile = (profile?.commitments ?? []).map(item => ({
    relationshipId: profile!.clientId,
    id: item.id,
    value: item.value,
  }));

  return [...fromSessions, ...fromProfile];
}

export async function getRelationshipReflections(
  supabase: SupabaseClient,
  scope: RelationshipScope
): Promise<Array<{ relationshipId: string; id: string; reflection: string }>> {
  const conversations = await getRelationshipConversations(supabase, scope);
  return reflectionsFromConversations(conversations);
}

export async function getRelationshipCommitments(
  supabase: SupabaseClient,
  scope: RelationshipScope
): Promise<Array<{ relationshipId: string; id: string; value: string }>> {
  const [conversations, profile] = await Promise.all([
    getRelationshipConversations(supabase, scope),
    getDevelopmentProfileForClient(
      supabase,
      scope.coachId,
      scope.relationshipId
    ),
  ]);
  return commitmentsFromSources(conversations, profile);
}

export async function getRelationshipDevelopmentUpdates(
  supabase: SupabaseClient,
  { coachId, relationshipId }: RelationshipScope
): Promise<DevelopmentUpdate[]> {
  return listDevelopmentUpdatesForClient(supabase, coachId, relationshipId);
}

export async function getApprovedRelationshipEvidence(
  supabase: SupabaseClient,
  scope: RelationshipScope
): Promise<
  Array<{
    relationshipId: string;
    id: string;
    summary: string;
    focus: string;
  }>
> {
  const conversations = await getRelationshipConversations(supabase, scope);
  return conversations
    .filter(
      session =>
        session.summaryStatus === "approved" || session.aiSummaryApproved
    )
    .map(session => ({
      relationshipId: session.clientId,
      id: session.id,
      summary: session.summary,
      focus: session.focus,
    }));
}

export function resolveJourneyViewModel(input: {
  relationship: Omit<Client, "sessions"> & { sessions?: Session[] };
  coachId: string;
  conversations: Session[];
  reflections: Array<{ relationshipId: string }>;
  commitments: Array<{ relationshipId: string }>;
  developmentUpdates: DevelopmentUpdate[];
  profile: DevelopmentProfile | null;
}): JourneyViewModel {
  const relationshipId = input.relationship.id;

  assertRelationshipOwnership(
    relationshipId,
    input.conversations.map(session => ({ relationshipId: session.clientId }))
  );
  assertRelationshipOwnership(relationshipId, input.reflections);
  assertRelationshipOwnership(relationshipId, input.commitments);
  assertRelationshipOwnership(relationshipId, input.developmentUpdates);
  if (input.profile) {
    assertRelationshipOwnership(relationshipId, [input.profile]);
  }

  const client: Client = {
    ...input.relationship,
    sessions: input.conversations,
  };

  const statusLabel = coachingStatusLabel(client, input.developmentUpdates);
  const page = buildJourneyPageViewModel(
    client,
    input.profile,
    input.developmentUpdates,
    statusLabel
  );

  const sourceRecords: JourneySourceRecord[] = [
    ...input.conversations.map(session => ({
      relationshipId: session.clientId,
      id: session.id,
    })),
    ...input.developmentUpdates.map(update => ({
      relationshipId: update.clientId,
      id: update.id,
    })),
  ];

  assertRelationshipOwnership(relationshipId, sourceRecords);

  return {
    ...page,
    relationshipId,
    coachId: input.coachId,
    personName: input.relationship.name,
    sourceRecords,
    profile: input.profile,
    updates: input.developmentUpdates,
  };
}

/**
 * Relationship-scoped Journey loader.
 * Never load Journey evidence using only coachId or the latest conversation.
 */
export async function loadJourneyViewModel(
  supabase: SupabaseClient,
  { coachId, relationshipId }: RelationshipScope
): Promise<JourneyViewModel> {
  const relationship = await getRelationship(supabase, {
    coachId,
    relationshipId,
  });

  if (!relationship) {
    throw new Error("Relationship not found");
  }

  const [conversations, developmentUpdates, profile] = await Promise.all([
    getRelationshipConversations(supabase, { coachId, relationshipId }),
    getRelationshipDevelopmentUpdates(supabase, {
      coachId,
      relationshipId,
    }),
    getDevelopmentProfileForClient(supabase, coachId, relationshipId),
  ]);

  const reflections = reflectionsFromConversations(conversations);
  const commitments = commitmentsFromSources(conversations, profile);

  return resolveJourneyViewModel({
    relationship,
    coachId,
    conversations,
    reflections,
    commitments,
    developmentUpdates,
    profile,
  });
}

/**
 * Client-side helper: validate already-loaded relationship data before render.
 * Throws RelationshipScopeIntegrityError on mixed ownership.
 */
export function assertJourneySourcesForRelationship(
  relationshipId: string,
  input: {
    conversations: Session[];
    updates: DevelopmentUpdate[];
    profile: DevelopmentProfile | null;
  }
): void {
  assertRelationshipOwnership(
    relationshipId,
    input.conversations.map(session => ({ relationshipId: session.clientId }))
  );
  assertRelationshipOwnership(relationshipId, input.updates);
  if (input.profile) {
    assertRelationshipOwnership(relationshipId, [input.profile]);
  }
}
