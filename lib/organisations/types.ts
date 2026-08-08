/**
 * Organisation / multi-user foundation types.
 * Permission roles are separate from professional identity.
 */

export const ORGANISATION_TYPES = [
  "personal",
  "practice",
  "business",
  "public_sector",
  "education",
  "other",
] as const;

export type OrganisationType = (typeof ORGANISATION_TYPES)[number];

export const MEMBERSHIP_ROLES = [
  "owner",
  "administrator",
  "oversight",
  "practitioner",
  "viewer",
] as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const PROFESSIONAL_ROLES = [
  "coach",
  "manager",
  "mentor",
  "facilitator",
  "supervisor",
  "other",
] as const;

export type ProfessionalRole = (typeof PROFESSIONAL_ROLES)[number];

export const ASSIGNMENT_ROLES = [
  "primary",
  "co_practitioner",
  "cover",
  "supervisor",
] as const;

export type AssignmentRole = (typeof ASSIGNMENT_ROLES)[number];

export const ORGANISATION_PERMISSIONS = [
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
  "coaching_content.view",
  "private_notes.view",
  "reports.generate",
  "reports.view_relationship",
  "billing.manage",
  "sample_organisation.manage",
] as const;

export type OrganisationPermission = (typeof ORGANISATION_PERMISSIONS)[number];

export const LICENCE_STATUSES = [
  "active",
  "trial",
  "expired",
  "suspended",
  "cancelled",
] as const;

export type LicenceStatus = (typeof LICENCE_STATUSES)[number];

/** Manual organisation licence metadata (no billing automation). */
export type OrganisationLicence = {
  planName: string;
  seatsPurchased: number;
  status: LicenceStatus;
  startsAt: string | null;
  endsAt: string | null;
};

export type PractitionerSeatSummary = {
  seatsPurchased: number;
  seatsInUse: number;
  seatsAvailable: number;
};

export type Organisation = {
  id: string;
  name: string;
  slug: string | null;
  organisationType: OrganisationType;
  status: "active" | "archived" | "pending_closure";
  createdBy: string;
  defaultPreparationStyle: "minimal" | "guided" | "enhanced" | null;
  aiEnabled: boolean;
  dataRetentionPolicyLabel: string;
  brandingStatus: "none" | "placeholder" | "configured";
  logoUrl: string | null;
  licence: OrganisationLicence;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type OrganisationMembership = {
  id: string;
  organisationId: string;
  userId: string;
  role: MembershipRole;
  professionalRole: ProfessionalRole | null;
  status: "active" | "invited" | "deactivated";
  invitedBy: string | null;
  invitedAt: string | null;
  joinedAt: string | null;
  deactivatedAt: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RelationshipAssignment = {
  id: string;
  organisationId: string;
  clientId: string;
  userId: string;
  assignmentRole: AssignmentRole;
  status: "active" | "ended";
  assignedBy: string | null;
  assignedAt: string;
  endedAt: string | null;
  endReason: string | null;
  createdAt: string;
};

export type OrganisationInvitation = {
  id: string;
  organisationId: string;
  email: string;
  role: MembershipRole;
  professionalRole: ProfessionalRole | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedBy: string;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
  createdAt: string;
};

export type OrganisationContext = {
  userId: string;
  organisationId: string;
  membershipId: string;
  role: MembershipRole;
  professionalRole: ProfessionalRole | null;
  organisation: Organisation;
  membership: OrganisationMembership;
};

export type SafeOversightMetrics = {
  organisationName: string;
  /** Present when loaded from the overview API; used for personal vs org subtitle. */
  organisationType?: OrganisationType | null;
  activeMembers: number;
  /**
   * Active practitioners — members with role practitioner, or content-capable
   * members (owner/administrator/practitioner) with an active content-granting
   * assignment. See lib/organisations/metric-definitions.ts.
   */
  practitioners: number;
  activeRelationships: number;
  conversationsThisMonth: number;
  awaitingSessionNotes: number;
  summariesAwaitingReview: number;
  preparationUsageThisMonth: number;
  developmentUpdatesCompleted: number;
  reportsCount: number;
  aiOperationCounts: {
    preparation: number;
    summaries: number;
    developmentUpdates: number;
    reports: number;
  };
};

export const MEMBERSHIP_ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Owner",
  administrator: "Administrator",
  oversight: "Oversight",
  practitioner: "Practitioner",
  viewer: "Viewer",
};

export const MEMBERSHIP_ROLE_DESCRIPTIONS: Record<MembershipRole, string> = {
  owner: "Full organisation administration and commercial control.",
  administrator: "Manages members, assignments and operational settings.",
  oversight:
    "Views safe operational information without confidential coaching content.",
  practitioner: "Manages assigned developmental relationships.",
  viewer: "Views explicitly shared organisation-level information.",
};

export const ORGANISATION_TYPE_LABELS: Record<OrganisationType, string> = {
  personal: "Personal",
  practice: "Practice",
  business: "Business",
  public_sector: "Public sector",
  education: "Education",
  other: "Other",
};

export const LICENCE_STATUS_LABELS: Record<LicenceStatus, string> = {
  active: "Active",
  trial: "Trial",
  expired: "Expired",
  suspended: "Suspended",
  cancelled: "Cancelled",
};
