export type {
  Organisation,
  OrganisationMembership,
  OrganisationContext,
  OrganisationInvitation,
  RelationshipAssignment,
  MembershipRole,
  ProfessionalRole,
  OrganisationType,
  OrganisationPermission,
  AssignmentRole,
  SafeOversightMetrics,
} from "@/lib/organisations/types";

export {
  MEMBERSHIP_ROLE_LABELS,
  MEMBERSHIP_ROLE_DESCRIPTIONS,
  ORGANISATION_TYPE_LABELS,
} from "@/lib/organisations/types";

export {
  formatOrganisationDate,
  formatOrganisationDateLong,
  formatProfessionalRoleLabel,
  formatAssignmentRoleLabel,
  formatMembershipStatusLabel,
  PROFESSIONAL_ROLE_LABELS,
  ASSIGNMENT_ROLE_LABELS,
} from "@/lib/organisations/format";

export {
  countActivePractitioners,
  countAwaitingSessionNotes,
  METRIC_DEFINITIONS,
} from "@/lib/organisations/metric-definitions";

export {
  hasPermission,
  canSeeOrganisationNav,
  canAccessCoachingContent,
  canAccessPrivateNotes,
  canManageOrganisation,
  canViewSafeOversight,
  canInviteMembers,
  canManageMembers,
  canManageAssignments,
  canCreateRelationships,
  invitableRoles,
  canAssignRole,
  permissionsForRole,
} from "@/lib/organisations/permissions";

export {
  requireOrganisationContext,
  requireOrganisationPermission,
  requireAssignedClientAccess,
  redactPrivateNotesFields,
  ensureUserOrganisationReady,
} from "@/lib/organisations/current-organisation";

export type { OrganisationRequestContext } from "@/lib/organisations/current-organisation";
