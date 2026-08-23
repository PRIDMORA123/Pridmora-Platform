import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeNextPath } from "@/lib/auth/email-link";
import { isPlatformOwner } from "@/lib/owner/platform-owner";

export const MANAGER_WORKSPACE_PATH = "/?view=dashboard";
export const LEAD_WORKSPACE_PATH = "/organisation";
export const OWNER_CONSOLE_PATH = "/owner";

/** True for `/` and `/?…` Manager home paths (not Lead/Owner destinations). */
export function isHomeWorkspacePath(path: string): boolean {
  return path === "/" || path.startsWith("/?");
}

/**
 * Server-authoritative post-auth destination.
 * Uses existing role architecture only:
 * - Platform Owner → /owner
 * - Organisation Lead (oversight) / business owner / administrator → /organisation
 * - Personal-workspace owner → Manager home (coaching workspace)
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
  /** When set, personal owners land on Manager home rather than Lead shell. */
  organisationType?: string | null;
}): string {
  const requested = sanitizeNextPath(input.requestedNext, "/");

  if (!isHomeWorkspacePath(requested)) {
    return requested;
  }

  if (input.isPlatformOwner) {
    // Explicit Manager workspace (Exit to workspace) wins; bare `/` still
    // sends platform owners to the Owner Console.
    if (requested === MANAGER_WORKSPACE_PATH) {
      return MANAGER_WORKSPACE_PATH;
    }
    return OWNER_CONSOLE_PATH;
  }

  const role = (input.membershipRole || "").toLowerCase();
  const professional = (input.professionalRole || "").toLowerCase();
  const organisationType = (input.organisationType || "").toLowerCase();

  if (role === "oversight" || role === "administrator") {
    return LEAD_WORKSPACE_PATH;
  }

  if (role === "owner") {
    if (organisationType === "personal") {
      return MANAGER_WORKSPACE_PATH;
    }
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
  organisations?:
    | { organisation_type?: string | null }
    | Array<{ organisation_type?: string | null }>
    | null;
};

/**
 * Load membership context for post-login routing (active memberships only).
 * Prefers profiles.current_organisation_id when present.
 */
export async function loadActiveMembershipForRouting(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  role: string | null;
  professionalRole: string | null;
  organisationType: string | null;
}> {
  if (!userId) {
    return { role: null, professionalRole: null, organisationType: null };
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

  const { data, error } = await supabase
    .from("organisation_memberships")
    .select("role, professional_role, organisation_id, organisations(organisation_type)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(20);

  if (error || !data?.length) {
    return { role: null, professionalRole: null, organisationType: null };
  }

  const rows = data as MembershipRow[];
  const preferred =
    (preferredOrgId &&
      rows.find(row => row.organisation_id === preferredOrgId)) ||
    rows[0];

  const orgJoin = preferred?.organisations;
  const organisationType = Array.isArray(orgJoin)
    ? orgJoin[0]?.organisation_type ?? null
    : orgJoin?.organisation_type ?? null;

  return {
    role: preferred?.role ?? null,
    professionalRole: preferred?.professional_role ?? null,
    organisationType:
      typeof organisationType === "string" ? organisationType : null,
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
    organisationType: membership.organisationType,
  });
}
