import type { SupabaseClient } from "@supabase/supabase-js";
import { writeOrganisationAudit } from "@/lib/organisations/repository";

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
  const { data: client, error: clientError } = await input.supabase
    .from("clients")
    .select("id, organisation_id")
    .eq("id", input.clientId)
    .maybeSingle();

  if (clientError) throw new Error(clientError.message);
  if (!client || client.organisation_id !== input.organisationId) {
    throw new Error("Relationship not found in this organisation.");
  }

  const { data: membership } = await input.supabase
    .from("organisation_memberships")
    .select("id, status")
    .eq("organisation_id", input.organisationId)
    .eq("user_id", input.toUserId)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    throw new Error("Target user is not an active organisation member.");
  }

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
