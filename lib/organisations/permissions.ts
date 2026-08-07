import type {
  AssignmentRole,
  MembershipRole,
  OrganisationPermission,
} from "@/lib/organisations/types";

/**
 * Central permission matrix.
 * Do not scatter role string comparisons through components and routes.
 *
 * IMPORTANT: organisation admin/oversight permissions do NOT grant
 * automatic access to confidential coaching content. Assignment checks
 * are required separately for coaching_content.view and private_notes.view.
 */

const ROLE_PERMISSIONS: Record<MembershipRole, readonly OrganisationPermission[]> = {
  owner: [
    "organisation.manage",
    "organisation.view_usage",
    "organisation.view_safe_oversight",
    "intelligence.organisation.read",
    "members.invite",
    "members.manage",
    "members.deactivate",
    "assignments.manage",
    "relationships.create",
    "relationships.view_assigned",
    "relationships.transfer",
    "reports.generate",
    "reports.view_relationship",
    "billing.manage",
    "sample_organisation.manage",
    // coaching_content.view / private_notes.view require assignment — see canAccessCoachingContent
  ],
  administrator: [
    "organisation.manage",
    "organisation.view_usage",
    "organisation.view_safe_oversight",
    "intelligence.organisation.read",
    "members.invite",
    "members.manage",
    "members.deactivate",
    "assignments.manage",
    "relationships.create",
    "relationships.view_assigned",
    "relationships.transfer",
    "sample_organisation.manage",
  ],
  oversight: [
    "organisation.view_usage",
    "organisation.view_safe_oversight",
    "intelligence.organisation.read",
    "relationships.view_assigned",
  ],
  practitioner: [
    "relationships.create",
    "relationships.view_assigned",
    "coaching_content.view",
    "private_notes.view",
    "reports.generate",
    "reports.view_relationship",
  ],
  viewer: ["relationships.view_assigned"],
};

/** Roles that may access confidential content when also assigned. */
const CONTENT_CAPABLE_ROLES: ReadonlySet<MembershipRole> = new Set([
  "practitioner",
  "owner",
  "administrator",
]);

/** Assignment roles that grant operational coaching access (not supervisor-only). */
const CONTENT_ASSIGNMENT_ROLES: ReadonlySet<AssignmentRole> = new Set([
  "primary",
  "co_practitioner",
  "cover",
]);

export function permissionsForRole(
  role: MembershipRole
): readonly OrganisationPermission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(
  role: MembershipRole,
  permission: OrganisationPermission
): boolean {
  return permissionsForRole(role).includes(permission);
}

export function canManageOrganisation(role: MembershipRole): boolean {
  return hasPermission(role, "organisation.manage");
}

export function canViewSafeOversight(role: MembershipRole): boolean {
  return hasPermission(role, "organisation.view_safe_oversight");
}

export function canReadOrganisationIntelligence(
  role: MembershipRole
): boolean {
  return hasPermission(role, "intelligence.organisation.read");
}

export function canInviteMembers(role: MembershipRole): boolean {
  return hasPermission(role, "members.invite");
}

export function canManageMembers(role: MembershipRole): boolean {
  return hasPermission(role, "members.manage");
}

export function canManageAssignments(role: MembershipRole): boolean {
  return hasPermission(role, "assignments.manage");
}

export function canCreateRelationships(role: MembershipRole): boolean {
  return hasPermission(role, "relationships.create");
}

export function canManageSampleOrganisation(role: MembershipRole): boolean {
  return hasPermission(role, "sample_organisation.manage");
}

export function canSeeOrganisationNav(role: MembershipRole): boolean {
  return (
    canManageOrganisation(role) ||
    canViewSafeOversight(role) ||
    canManageAssignments(role) ||
    canManageMembers(role)
  );
}

/**
 * Confidential coaching content requires:
 * 1. Role capable of content (practitioner, or owner/admin who is assigned)
 * 2. Active assignment that grants content access
 *
 * Owners/admins WITHOUT assignment must not receive notes/summaries.
 */
export function canAccessCoachingContent(input: {
  role: MembershipRole;
  assignmentRole: AssignmentRole | null;
}): boolean {
  if (!CONTENT_CAPABLE_ROLES.has(input.role)) return false;
  if (!input.assignmentRole) return false;
  return CONTENT_ASSIGNMENT_ROLES.has(input.assignmentRole);
}

/**
 * Private identity (real name / email / phone / notes) requires the same
 * direct practitioner access as confidential coaching content.
 *
 * Organisation owner, administrator, or oversight membership alone is never enough.
 * Legacy coach_id ownership is modelled as assignmentRole "primary" only when
 * there are no active assignments (see requireAssignedClientAccess).
 */
export function canAccessPrivateIdentity(input: {
  role: MembershipRole;
  assignmentRole: AssignmentRole | null;
}): boolean {
  return canAccessCoachingContent(input);
}

/**
 * Private notes: primary / co_practitioner / cover when role allows.
 * Supervisor assignment never grants private notes.
 * After transfer, previous practitioner-only notes are filtered at the API layer
 * using the original coach_id ownership marker.
 */
export function canAccessPrivateNotes(input: {
  role: MembershipRole;
  assignmentRole: AssignmentRole | null;
  isOriginalPrivateNotesOwner: boolean;
}): boolean {
  if (!canAccessCoachingContent(input)) return false;
  return input.isOriginalPrivateNotesOwner || input.assignmentRole === "primary";
}

/** Roles an inviter may assign (never escalate above own role). */
export function invitableRoles(actorRole: MembershipRole): MembershipRole[] {
  if (actorRole === "owner") {
    return ["administrator", "oversight", "practitioner", "viewer"];
  }
  if (actorRole === "administrator") {
    return ["oversight", "practitioner", "viewer"];
  }
  return [];
}

export function canAssignRole(
  actorRole: MembershipRole,
  targetRole: MembershipRole
): boolean {
  if (targetRole === "owner" && actorRole !== "owner") return false;
  return invitableRoles(actorRole).includes(targetRole);
}

export function parseMembershipRole(value: unknown): MembershipRole | null {
  if (typeof value !== "string") return null;
  return (Object.keys(ROLE_PERMISSIONS) as MembershipRole[]).includes(
    value as MembershipRole
  )
    ? (value as MembershipRole)
    : null;
}

export function parseAssignmentRole(value: unknown): AssignmentRole | null {
  if (typeof value !== "string") return null;
  return CONTENT_ASSIGNMENT_ROLES.has(value as AssignmentRole) ||
    value === "supervisor"
    ? (value as AssignmentRole)
    : null;
}
