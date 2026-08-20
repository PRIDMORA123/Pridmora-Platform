import type { SupabaseClient } from "@supabase/supabase-js";
import { isSelfDevelopmentClientRow } from "@/lib/my-development/self-development-identity";
import { writeOrganisationAudit } from "@/lib/organisations/repository";
import {
  assertPractitionerSeatAvailable,
  assignmentWouldNewlyConsumeSeat,
  loadPractitionerSeatUsage,
  memberAlreadyConsumesSeat,
} from "@/lib/organisations/licence";

export const SELF_DEVELOPMENT_ASSIGNMENT_BLOCKED_CODE =
  "self_development_assignment_blocked" as const;

export const SELF_DEVELOPMENT_ASSIGNMENT_BLOCKED_MESSAGE =
  "My Development records cannot be transferred, assigned or ended from organisation administration.";

export class SelfDevelopmentAssignmentBlockedError extends Error {
  readonly code = SELF_DEVELOPMENT_ASSIGNMENT_BLOCKED_CODE;

  constructor(message = SELF_DEVELOPMENT_ASSIGNMENT_BLOCKED_MESSAGE) {
    super(message);
    this.name = "SelfDevelopmentAssignmentBlockedError";
  }
}

function isMissingSelfDevelopmentColumnError(message: string): boolean {
  return /is_self_development|schema cache|could not find/i.test(message);
}

export type LeadAssignmentClientRow = {
  id: string;
  name?: string | null;
  status?: string | null;
  role?: string | null;
  is_self_development?: boolean | null;
};

export type LeadAssignmentRow = {
  id: string;
  client_id: string;
  user_id: string;
  assignment_role: string;
  status: string;
  assigned_at?: string | null;
  ended_at?: string | null;
};

/**
 * People-only view of Lead assignment administration.
 * Reuses canonical self-development identity; never treats My Development as a Person.
 */
export function buildLeadAssignmentAdministrationPayload(input: {
  clients: LeadAssignmentClientRow[];
  assignments: LeadAssignmentRow[];
  members: Array<{
    user_id: string;
    role: string;
    professional_role?: string | null;
  }>;
  nameByUser: Map<string, string>;
}): {
  assignments: Array<{
    id: string;
    clientId: string;
    userId: string;
    assignmentRole: string;
    status: string;
    assignedAt: string | null;
    endedAt: string | null;
    practitionerName: string;
    clientName: string;
  }>;
  practitioners: Array<{
    userId: string;
    name: string;
    role: string;
    professionalRole: string | null;
    assignedCount: number;
  }>;
  relationships: Array<{
    id: string;
    name: string;
    status: string | null;
  }>;
} {
  const peopleClients = input.clients.filter(
    row => !isSelfDevelopmentClientRow(row)
  );
  const peopleIds = new Set(peopleClients.map(row => row.id));
  const peopleAssignments = input.assignments.filter(row =>
    peopleIds.has(row.client_id)
  );

  const counts = new Map<string, number>();
  for (const row of peopleAssignments) {
    if (row.status !== "active") continue;
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  }

  const nameByClient = new Map(
    peopleClients.map(row => [row.id, row.name || "Relationship"])
  );

  return {
    assignments: peopleAssignments.map(row => ({
      id: row.id,
      clientId: row.client_id,
      userId: row.user_id,
      assignmentRole: row.assignment_role,
      status: row.status,
      assignedAt: row.assigned_at ?? null,
      endedAt: row.ended_at ?? null,
      practitionerName: input.nameByUser.get(row.user_id) || "Practitioner",
      clientName: nameByClient.get(row.client_id) ?? "Relationship",
    })),
    practitioners: input.members
      .filter(member =>
        ["practitioner", "owner", "administrator"].includes(member.role)
      )
      .map(member => ({
        userId: member.user_id,
        name: input.nameByUser.get(member.user_id) || "Member",
        role: member.role,
        professionalRole: member.professional_role ?? null,
        assignedCount: counts.get(member.user_id) ?? 0,
      })),
    // Names exposed only for assignment-management (explicit product policy).
    // My Development clients are excluded above and never appear here.
    relationships: peopleClients.map(row => ({
      id: row.id,
      name: row.name || "Relationship",
      status: row.status ?? null,
    })),
  };
}

export function countActiveAssignedPeopleByUser(
  assignments: Array<{ user_id: string; client_id: string; status?: string }>,
  excludedClientIds: ReadonlySet<string>
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of assignments) {
    if (row.status && row.status !== "active") continue;
    if (excludedClientIds.has(row.client_id)) continue;
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Fail-closed: Lead assignment administration may only target organisation People.
 * My Development clients remain assigned internally and must never be
 * transferred, assigned or ended here — even when a caller supplies the UUID.
 */
export async function assertClientIsAssignableOrganisationPerson(input: {
  supabase: SupabaseClient;
  organisationId: string;
  clientId: string;
}): Promise<void> {
  const clientId = input.clientId.trim();
  if (!clientId) {
    throw new Error("Relationship not found in this organisation.");
  }

  const withFlag = await input.supabase
    .from("clients")
    .select("id, organisation_id, role, is_self_development")
    .eq("id", clientId)
    .maybeSingle();

  let row = withFlag.data as {
    id: string;
    organisation_id: string;
    role?: string | null;
    is_self_development?: boolean | null;
  } | null;
  let error = withFlag.error;

  if (error && isMissingSelfDevelopmentColumnError(error.message)) {
    const fallback = await input.supabase
      .from("clients")
      .select("id, organisation_id, role")
      .eq("id", clientId)
      .maybeSingle();
    row = fallback.data as typeof row;
    error = fallback.error;
  }

  if (error) {
    throw new Error(error.message);
  }
  if (!row || row.organisation_id !== input.organisationId) {
    throw new Error("Relationship not found in this organisation.");
  }
  if (isSelfDevelopmentClientRow(row)) {
    throw new SelfDevelopmentAssignmentBlockedError();
  }
}

export async function loadLeadAssignmentAdminClients(
  supabase: SupabaseClient,
  organisationId: string
): Promise<LeadAssignmentClientRow[]> {
  const withFlag = await supabase
    .from("clients")
    .select("id, name, status, role, is_self_development")
    .eq("organisation_id", organisationId)
    .is("archived_at", null);

  if (!withFlag.error) {
    return (withFlag.data ?? []) as LeadAssignmentClientRow[];
  }

  if (isMissingSelfDevelopmentColumnError(withFlag.error.message)) {
    const fallback = await supabase
      .from("clients")
      .select("id, name, status, role")
      .eq("organisation_id", organisationId)
      .is("archived_at", null);
    if (fallback.error) throw new Error(fallback.error.message);
    return (fallback.data ?? []) as LeadAssignmentClientRow[];
  }

  throw new Error(withFlag.error.message);
}

async function assertSeatForNewAssignment(input: {
  supabase: SupabaseClient;
  organisationId: string;
  userId: string;
}): Promise<void> {
  const seatUsage = await loadPractitionerSeatUsage(
    input.supabase,
    input.organisationId
  );
  const membership = seatUsage.memberships.find(
    row => row.userId === input.userId
  );
  if (!membership || membership.status !== "active") {
    throw new Error("Target user is not an active organisation member.");
  }

  const alreadyConsumes = memberAlreadyConsumesSeat(
    input.userId,
    seatUsage.memberships,
    seatUsage.assignments
  );
  const wouldNewly = assignmentWouldNewlyConsumeSeat({
    role: membership.role,
    status: membership.status,
    alreadyConsumesSeat: alreadyConsumes,
  });
  const seatBlock = assertPractitionerSeatAvailable({
    licenceStatus: seatUsage.licence.status,
    seatsPurchased: seatUsage.licence.seatsPurchased,
    seatsInUse: seatUsage.summary.seatsInUse,
    wouldNewlyConsumeSeat: wouldNewly,
  });
  if (seatBlock) throw new Error(seatBlock);
}

/**
 * Transfer primary practitioner assignment.
 * Preserves history; does not grant previous private notes to the new practitioner.
 * coach_id on the client is retained as the private-notes ownership marker.
 */
export async function transferPrimaryAssignment(input: {
  supabase: SupabaseClient;
  organisationId: string;
  clientId: string;
  toUserId: string;
  actorUserId: string;
}): Promise<void> {
  await assertClientIsAssignableOrganisationPerson({
    supabase: input.supabase,
    organisationId: input.organisationId,
    clientId: input.clientId,
  });

  const { data: membership } = await input.supabase
    .from("organisation_memberships")
    .select("id, status, role")
    .eq("organisation_id", input.organisationId)
    .eq("user_id", input.toUserId)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    throw new Error("Target user is not an active organisation member.");
  }

  await assertSeatForNewAssignment({
    supabase: input.supabase,
    organisationId: input.organisationId,
    userId: input.toUserId,
  });

  const now = new Date().toISOString();

  const { data: currentPrimary } = await input.supabase
    .from("relationship_assignments")
    .select("id, user_id")
    .eq("client_id", input.clientId)
    .eq("assignment_role", "primary")
    .eq("status", "active")
    .maybeSingle();

  if (currentPrimary) {
    if (currentPrimary.user_id === input.toUserId) return;

    const { error: endError } = await input.supabase
      .from("relationship_assignments")
      .update({
        status: "ended",
        ended_at: now,
        end_reason: "transferred",
      })
      .eq("id", currentPrimary.id);

    if (endError) throw new Error(endError.message);
  }

  const { error: insertError } = await input.supabase
    .from("relationship_assignments")
    .insert({
      organisation_id: input.organisationId,
      client_id: input.clientId,
      user_id: input.toUserId,
      assignment_role: "primary",
      status: "active",
      assigned_by: input.actorUserId,
      assigned_at: now,
    });

  if (insertError) throw new Error(insertError.message);

  await writeOrganisationAudit({
    supabase: input.supabase,
    organisationId: input.organisationId,
    actorUserId: input.actorUserId,
    action: "relationship_transferred",
    entityType: "client",
    entityId: input.clientId,
    metadata: {
      fromUserId: currentPrimary?.user_id ?? null,
      toUserId: input.toUserId,
      privateNotesRemainWithOriginalOwner: true,
    },
  });
}

export async function assignRelationship(input: {
  supabase: SupabaseClient;
  organisationId: string;
  clientId: string;
  userId: string;
  assignmentRole: "primary" | "co_practitioner" | "cover" | "supervisor";
  actorUserId: string;
}): Promise<void> {
  await assertClientIsAssignableOrganisationPerson({
    supabase: input.supabase,
    organisationId: input.organisationId,
    clientId: input.clientId,
  });

  if (input.assignmentRole === "primary") {
    await transferPrimaryAssignment({
      supabase: input.supabase,
      organisationId: input.organisationId,
      clientId: input.clientId,
      toUserId: input.userId,
      actorUserId: input.actorUserId,
    });
    return;
  }

  const { data: membership } = await input.supabase
    .from("organisation_memberships")
    .select("id, status, role")
    .eq("organisation_id", input.organisationId)
    .eq("user_id", input.userId)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    throw new Error("Target user is not an active organisation member.");
  }

  await assertSeatForNewAssignment({
    supabase: input.supabase,
    organisationId: input.organisationId,
    userId: input.userId,
  });

  const now = new Date().toISOString();
  const { error } = await input.supabase.from("relationship_assignments").insert({
    organisation_id: input.organisationId,
    client_id: input.clientId,
    user_id: input.userId,
    assignment_role: input.assignmentRole,
    status: "active",
    assigned_by: input.actorUserId,
    assigned_at: now,
  });

  if (error) throw new Error(error.message);

  await writeOrganisationAudit({
    supabase: input.supabase,
    organisationId: input.organisationId,
    actorUserId: input.actorUserId,
    action: "relationship_assigned",
    entityType: "client",
    entityId: input.clientId,
    metadata: {
      userId: input.userId,
      assignmentRole: input.assignmentRole,
    },
  });
}

export async function endAssignment(input: {
  supabase: SupabaseClient;
  organisationId: string;
  assignmentId: string;
  actorUserId: string;
  reason?: string;
}): Promise<void> {
  const { data: existing, error: lookupError } = await input.supabase
    .from("relationship_assignments")
    .select("id, client_id, user_id, assignment_role, status")
    .eq("id", input.assignmentId)
    .eq("organisation_id", input.organisationId)
    .eq("status", "active")
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);
  if (!existing) throw new Error("Assignment not found.");

  await assertClientIsAssignableOrganisationPerson({
    supabase: input.supabase,
    organisationId: input.organisationId,
    clientId: existing.client_id as string,
  });

  const { data, error } = await input.supabase
    .from("relationship_assignments")
    .update({
      status: "ended",
      ended_at: new Date().toISOString(),
      end_reason: input.reason ?? "ended",
    })
    .eq("id", input.assignmentId)
    .eq("organisation_id", input.organisationId)
    .eq("status", "active")
    .select("id, client_id, user_id, assignment_role")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Assignment not found.");

  await writeOrganisationAudit({
    supabase: input.supabase,
    organisationId: input.organisationId,
    actorUserId: input.actorUserId,
    action: "relationship_assignment_ended",
    entityType: "relationship_assignment",
    entityId: data.id,
    metadata: {
      clientId: data.client_id,
      userId: data.user_id,
      assignmentRole: data.assignment_role,
    },
  });
}
