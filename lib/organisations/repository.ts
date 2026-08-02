import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssignmentRole,
  MembershipRole,
  Organisation,
  OrganisationContext,
  OrganisationMembership,
  OrganisationType,
  ProfessionalRole,
  RelationshipAssignment,
} from "@/lib/organisations/types";
import { parseMembershipRole } from "@/lib/organisations/permissions";

type OrgRow = {
  id: string;
  name: string;
  slug: string | null;
  organisation_type: string;
  status: string;
  created_by: string;
  default_preparation_style: string | null;
  ai_enabled: boolean;
  data_retention_policy_label: string;
  branding_status: string;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type MembershipRow = {
  id: string;
  organisation_id: string;
  user_id: string;
  role: string;
  professional_role: string | null;
  status: string;
  invited_by: string | null;
  invited_at: string | null;
  joined_at: string | null;
  deactivated_at: string | null;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
};

type AssignmentRow = {
  id: string;
  organisation_id: string;
  client_id: string;
  user_id: string;
  assignment_role: string;
  status: string;
  assigned_by: string | null;
  assigned_at: string;
  ended_at: string | null;
  end_reason: string | null;
  created_at: string;
};

export function mapOrganisation(row: OrgRow): Organisation {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    organisationType: row.organisation_type as OrganisationType,
    status: row.status as Organisation["status"],
    createdBy: row.created_by,
    defaultPreparationStyle: (row.default_preparation_style as Organisation["defaultPreparationStyle"]) ?? null,
    aiEnabled: row.ai_enabled ?? true,
    dataRetentionPolicyLabel: row.data_retention_policy_label ?? "standard",
    brandingStatus: (row.branding_status as Organisation["brandingStatus"]) ?? "none",
    logoUrl: row.logo_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export function mapMembership(row: MembershipRow): OrganisationMembership {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    userId: row.user_id,
    role: row.role as MembershipRole,
    professionalRole: row.professional_role as ProfessionalRole | null,
    status: row.status as OrganisationMembership["status"],
    invitedBy: row.invited_by,
    invitedAt: row.invited_at,
    joinedAt: row.joined_at,
    deactivatedAt: row.deactivated_at,
    lastActiveAt: row.last_active_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAssignment(row: AssignmentRow): RelationshipAssignment {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    clientId: row.client_id,
    userId: row.user_id,
    assignmentRole: row.assignment_role as AssignmentRole,
    status: row.status as RelationshipAssignment["status"],
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at,
    endedAt: row.ended_at,
    endReason: row.end_reason,
    createdAt: row.created_at,
  };
}

const ORG_SELECT =
  "id, name, slug, organisation_type, status, created_by, default_preparation_style, ai_enabled, data_retention_policy_label, branding_status, logo_url, created_at, updated_at, archived_at";

const MEMBERSHIP_SELECT =
  "id, organisation_id, user_id, role, professional_role, status, invited_by, invited_at, joined_at, deactivated_at, last_active_at, created_at, updated_at";

/**
 * Ensure the authenticated user has a personal organisation.
 * Safe to call repeatedly (DB function is idempotent).
 */
export async function ensurePersonalOrganisation(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc("ensure_personal_organisation", {
    p_user_id: userId,
  });

  if (error) {
    // Pre-migration environments: organisation tables may not exist yet.
    if (
      /does not exist|schema cache|could not find/i.test(error.message)
    ) {
      return null;
    }
    console.error("ensure_personal_organisation failed:", error.message);
    return null;
  }

  return typeof data === "string" ? data : null;
}

export async function listUserMemberships(
  supabase: SupabaseClient,
  userId: string
): Promise<Array<{ membership: OrganisationMembership; organisation: Organisation }>> {
  const { data, error } = await supabase
    .from("organisation_memberships")
    .select(`${MEMBERSHIP_SELECT}, organisations (${ORG_SELECT})`)
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    if (/does not exist|schema cache|could not find/i.test(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }

  const results: Array<{
    membership: OrganisationMembership;
    organisation: Organisation;
  }> = [];

  for (const row of data ?? []) {
    const orgRaw = (row as { organisations?: OrgRow | OrgRow[] | null }).organisations;
    const org = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw;
    if (!org || org.status !== "active") continue;
    results.push({
      membership: mapMembership(row as unknown as MembershipRow),
      organisation: mapOrganisation(org),
    });
  }

  return results;
}

export async function getMembership(
  supabase: SupabaseClient,
  organisationId: string,
  userId: string
): Promise<OrganisationMembership | null> {
  const { data, error } = await supabase
    .from("organisation_memberships")
    .select(MEMBERSHIP_SELECT)
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    if (/does not exist|schema cache|could not find/i.test(error.message)) {
      return null;
    }
    throw new Error(error.message);
  }

  return data ? mapMembership(data as MembershipRow) : null;
}

export async function getOrganisation(
  supabase: SupabaseClient,
  organisationId: string
): Promise<Organisation | null> {
  const { data, error } = await supabase
    .from("organisations")
    .select(ORG_SELECT)
    .eq("id", organisationId)
    .maybeSingle();

  if (error) {
    if (/does not exist|schema cache|could not find/i.test(error.message)) {
      return null;
    }
    throw new Error(error.message);
  }

  return data ? mapOrganisation(data as OrgRow) : null;
}

export async function getActiveAssignment(
  supabase: SupabaseClient,
  clientId: string,
  userId: string
): Promise<RelationshipAssignment | null> {
  const { data, error } = await supabase
    .from("relationship_assignments")
    .select("*")
    .eq("client_id", clientId)
    .eq("user_id", userId)
    .eq("status", "active")
    .in("assignment_role", ["primary", "co_practitioner", "cover"])
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (/does not exist|schema cache|could not find/i.test(error.message)) {
      return null;
    }
    throw new Error(error.message);
  }

  return data ? mapAssignment(data as AssignmentRow) : null;
}

export async function listAssignedClientIds(
  supabase: SupabaseClient,
  organisationId: string,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("relationship_assignments")
    .select("client_id")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .in("assignment_role", ["primary", "co_practitioner", "cover"]);

  if (error) {
    if (/does not exist|schema cache|could not find/i.test(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? []).map(row => row.client_id as string);
}

export async function createPrimaryAssignment(input: {
  supabase: SupabaseClient;
  organisationId: string;
  clientId: string;
  userId: string;
  assignedBy: string;
}): Promise<void> {
  const { error } = await input.supabase.from("relationship_assignments").insert({
    organisation_id: input.organisationId,
    client_id: input.clientId,
    user_id: input.userId,
    assignment_role: "primary",
    status: "active",
    assigned_by: input.assignedBy,
    assigned_at: new Date().toISOString(),
  });

  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error(error.message);
  }
}

export async function writeOrganisationAudit(input: {
  supabase: SupabaseClient;
  organisationId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("organisation_audit_log").insert({
    organisation_id: input.organisationId,
    actor_user_id: input.actorUserId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.warn("organisation audit write failed:", error.message);
  }
}

export async function setCurrentOrganisationPreference(
  supabase: SupabaseClient,
  userId: string,
  organisationId: string
): Promise<void> {
  const role = parseMembershipRole(
    (await getMembership(supabase, organisationId, userId))?.role
  );
  if (!role) {
    throw new Error("Not an active member of that organisation.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      current_organisation_id: organisationId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) throw new Error(error.message);

  await writeOrganisationAudit({
    supabase,
    organisationId,
    actorUserId: userId,
    action: "organisation_changed",
    entityType: "organisation",
    entityId: organisationId,
  });
}

export async function getPreferredOrganisationId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("current_organisation_id")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return (data.current_organisation_id as string | null) ?? null;
}

export type ResolveOrganisationResult =
  | { ok: true; context: OrganisationContext }
  | { ok: false; reason: "no_membership" | "inactive" | "unavailable" };

/**
 * Resolve the current organisation for an authenticated user.
 * Never trusts a client-supplied organisation id without membership verification.
 */
export async function resolveOrganisationContext(
  supabase: SupabaseClient,
  userId: string,
  preferredOrganisationId?: string | null
): Promise<ResolveOrganisationResult> {
  await ensurePersonalOrganisation(supabase, userId);

  const memberships = await listUserMemberships(supabase, userId);
  if (memberships.length === 0) {
    return { ok: false, reason: "unavailable" };
  }

  let preferred =
    preferredOrganisationId ??
    (await getPreferredOrganisationId(supabase, userId));

  let selected =
    (preferred
      ? memberships.find(m => m.organisation.id === preferred)
      : null) ?? null;

  if (!selected) {
    // Prefer personal org when only resolving defaults
    selected =
      memberships.find(m => m.organisation.organisationType === "personal") ??
      memberships[0];
  }

  if (!selected || selected.membership.status !== "active") {
    return { ok: false, reason: "inactive" };
  }

  // Persist preference when missing or invalid
  if (preferred !== selected.organisation.id) {
    await supabase
      .from("profiles")
      .update({
        current_organisation_id: selected.organisation.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  }

  // Touch last_active_at (best-effort)
  await supabase
    .from("organisation_memberships")
    .update({
      last_active_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", selected.membership.id);

  return {
    ok: true,
    context: {
      userId,
      organisationId: selected.organisation.id,
      membershipId: selected.membership.id,
      role: selected.membership.role,
      professionalRole: selected.membership.professionalRole,
      organisation: selected.organisation,
      membership: selected.membership,
    },
  };
}
