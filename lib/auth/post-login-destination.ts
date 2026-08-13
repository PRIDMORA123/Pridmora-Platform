import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeNextPath } from "@/lib/auth/email-link";
import { isPlatformOwner } from "@/lib/owner/platform-owner";

export const MANAGER_WORKSPACE_PATH = "/?view=dashboard";
export const LEAD_WORKSPACE_PATH = "/organisation";
export const OWNER_CONSOLE_PATH = "/owner";

function isHomePath(path: string): boolean {
  return path === "/" || path.startsWith("/?");
}

/**
 * Server-authoritative post-auth destination.
 * Uses existing role architecture only:
 * - Platform Owner → /owner
 * - Organisation Lead (oversight) / owner / administrator → /organisation
 * - Manager (practitioner + professional_role manager) → Manager workspace
 *
 * Deep links (invitations, etc.) win over role defaults when `requestedNext`
 * is a non-home path.
 */
export function resolvePostLoginDestination(input: {
  requestedNext?: string | null;
  isPlatformOwner: boolean;
  membershipRole?: string | null;
  professionalRole?: string | null;
}): string {
  const requested = sanitizeNextPath(input.requestedNext, "/");

  if (!isHomePath(requested)) {
    return requested;
  }

  if (input.isPlatformOwner) {
    return OWNER_CONSOLE_PATH;
  }

  const role = (input.membershipRole || "").toLowerCase();
  const professional = (input.professionalRole || "").toLowerCase();

  if (role === "oversight" || role === "owner" || role === "administrator") {
    return LEAD_WORKSPACE_PATH;
  }

  if (role === "practitioner" && professional === "manager") {
    return MANAGER_WORKSPACE_PATH;
  }

  return requested;
}

type MembershipRow = {
  role: string;
  professional_role: string | null;
  organisation_id: string;
};

/**
 * Load membership context for post-login routing (active memberships only).
 * Prefers profiles.current_organisation_id when present.
 */
export async function loadActiveMembershipForRouting(
  supabase: SupabaseClient,
  userId: string
): Promise<{ role: string | null; professionalRole: string | null }> {
  if (!userId) {
    return { role: null, professionalRole: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("current_organisation_id")
    .eq("id", userId)
    .maybeSingle();

  const preferredOrgId =
    typeof profile?.current_organisation_id === "string"
      ? profile.current_organisation_id
      : null;

  let query = supabase
    .from("organisation_memberships")
    .select("role, professional_role, organisation_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(20);

  const { data, error } = await query;
  if (error || !data?.length) {
    return { role: null, professionalRole: null };
  }

  const rows = data as MembershipRow[];
  const preferred =
    (preferredOrgId &&
      rows.find(row => row.organisation_id === preferredOrgId)) ||
    rows[0];

  return {
    role: preferred?.role ?? null,
    professionalRole: preferred?.professional_role ?? null,
  };
}

/**
 * Resolve destination after a successful password grant (or equivalent).
 */
export async function resolveAuthoritativePostLoginDestination(
  supabase: SupabaseClient,
  userId: string,
  requestedNext?: string | null
): Promise<string> {
  const [owner, membership] = await Promise.all([
    isPlatformOwner(supabase, userId),
    loadActiveMembershipForRouting(supabase, userId),
  ]);

  return resolvePostLoginDestination({
    requestedNext,
    isPlatformOwner: owner,
    membershipRole: membership.role,
    professionalRole: membership.professionalRole,
  });
}
