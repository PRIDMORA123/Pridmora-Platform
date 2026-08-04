import type { SupabaseClient } from "@supabase/supabase-js";
import {
  hasAnyPrivateIdentityField,
  type PrivateIdentityFields,
  type PrivateIdentityRecord,
} from "@/lib/relationship-identity";
import { writeOrganisationAudit } from "@/lib/organisations/repository";

export type ClientPrivateIdentityRow = {
  id: string;
  client_id: string;
  organisation_id: string;
  coach_id: string;
  real_name: string | null;
  email: string | null;
  phone: string | null;
  private_notes: string | null;
  created_at: string;
  updated_at: string;
};

export function rowToPrivateIdentity(
  row: ClientPrivateIdentityRow
): PrivateIdentityRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    organisationId: row.organisation_id,
    coachId: row.coach_id,
    realName: row.real_name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    privateNotes: row.private_notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Fetch private identity for a client.
 * Relies on RLS — returns null when no row or no access.
 * Never include in list/org-wide responses.
 */
export async function fetchPrivateIdentity(
  supabase: SupabaseClient,
  clientId: string
): Promise<PrivateIdentityRecord | null> {
  const { data, error } = await supabase
    .from("client_private_identities")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    if (/schema cache|does not exist|could not find/i.test(error.message)) {
      return null;
    }
    throw new Error(error.message);
  }

  if (!data) return null;
  return rowToPrivateIdentity(data as ClientPrivateIdentityRow);
}

export async function upsertPrivateIdentity(input: {
  supabase: SupabaseClient;
  clientId: string;
  organisationId: string;
  coachId: string;
  actorUserId: string;
  fields: PrivateIdentityFields;
  auditAction?: "private_identity_updated" | "private_identity_created";
}): Promise<PrivateIdentityRecord> {
  if (!hasAnyPrivateIdentityField(input.fields)) {
    throw new Error("At least one private identity field is required.");
  }

  const now = new Date().toISOString();
  const payload = {
    client_id: input.clientId,
    organisation_id: input.organisationId,
    coach_id: input.coachId,
    real_name: input.fields.realName.trim() || null,
    email: input.fields.email.trim() || null,
    phone: input.fields.phone.trim() || null,
    private_notes: input.fields.privateNotes.trim() || null,
    updated_at: now,
  };

  const { data, error } = await input.supabase
    .from("client_private_identities")
    .upsert(payload, { onConflict: "client_id" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await writeOrganisationAudit({
    supabase: input.supabase,
    organisationId: input.organisationId,
    actorUserId: input.actorUserId,
    action: input.auditAction ?? "private_identity_updated",
    entityType: "client_private_identity",
    entityId: input.clientId,
    metadata: {
      // Safe metadata only — never log private values.
      clientId: input.clientId,
      hasRealName: Boolean(input.fields.realName.trim()),
      hasEmail: Boolean(input.fields.email.trim()),
      hasPhone: Boolean(input.fields.phone.trim()),
      hasNotes: Boolean(input.fields.privateNotes.trim()),
    },
  });

  return rowToPrivateIdentity(data as ClientPrivateIdentityRow);
}

export async function deletePrivateIdentity(input: {
  supabase: SupabaseClient;
  clientId: string;
  organisationId: string;
  actorUserId: string;
}): Promise<boolean> {
  const { error, count } = await input.supabase
    .from("client_private_identities")
    .delete({ count: "exact" })
    .eq("client_id", input.clientId);

  if (error) throw new Error(error.message);

  await writeOrganisationAudit({
    supabase: input.supabase,
    organisationId: input.organisationId,
    actorUserId: input.actorUserId,
    action: "private_identity_deleted",
    entityType: "client_private_identity",
    entityId: input.clientId,
    metadata: { clientId: input.clientId },
  });

  return (count ?? 0) > 0;
}

export async function auditPrivateIdentityViewed(input: {
  supabase: SupabaseClient;
  organisationId: string;
  actorUserId: string;
  clientId: string;
}): Promise<void> {
  await writeOrganisationAudit({
    supabase: input.supabase,
    organisationId: input.organisationId,
    actorUserId: input.actorUserId,
    action: "private_identity_viewed",
    entityType: "client_private_identity",
    entityId: input.clientId,
    metadata: {
      clientId: input.clientId,
      // Never log identity values.
    },
  });
}

/**
 * Search private real names for authorised practitioners.
 * Returns client IDs only — never the matched private name.
 * RLS ensures unassigned / oversight users match nothing.
 */
export async function searchPrivateIdentityClientIds(input: {
  supabase: SupabaseClient;
  organisationId: string;
  query: string;
}): Promise<string[]> {
  const q = input.query.trim();
  if (!q || q.length < 2) return [];

  const { data, error } = await input.supabase
    .from("client_private_identities")
    .select("client_id")
    .eq("organisation_id", input.organisationId)
    .ilike("real_name", `%${q}%`);

  if (error) {
    if (/schema cache|does not exist|could not find/i.test(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? [])
    .map(row => row.client_id as string)
    .filter(Boolean);
}
