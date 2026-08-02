/**
 * Multi-organisation test fixtures (logical).
 * Used by reliability and security tests — not loaded into production seed.
 *
 * Organisation A: 3 practitioners, 9 clients, mixed assignments
 * Organisation B: 2 practitioners, 6 clients
 * Personal organisation: 1 practitioner, 3 clients
 *
 * Includes:
 * - one user belonging to two organisations
 * - one administrator who is not assigned to relationships
 * - one practitioner with five assigned relationships
 * - one transferred relationship
 * - one deactivated member
 * - one pending invitation
 */

export const ORG_FIXTURES = {
  organisations: [
    {
      id: "org-a",
      name: "Northside Practice",
      organisationType: "practice" as const,
      practitioners: ["user-a1", "user-a2", "user-a3"],
      administrator: "user-a-admin",
      oversight: "user-a-oversight",
      deactivated: "user-a-deactivated",
      clientCount: 9,
    },
    {
      id: "org-b",
      name: "River Coaching",
      organisationType: "practice" as const,
      practitioners: ["user-b1", "user-dual"],
      clientCount: 6,
    },
    {
      id: "org-personal",
      name: "Solo Practitioner Personal workspace",
      organisationType: "personal" as const,
      practitioners: ["user-solo"],
      clientCount: 3,
    },
  ],
  dualMembershipUserId: "user-dual",
  unassignedAdminUserId: "user-a-admin",
  heavyPractitionerUserId: "user-a1",
  heavyPractitionerAssignmentCount: 5,
  transferredRelationshipId: "client-a-transfer",
  transferredFromUserId: "user-a2",
  transferredToUserId: "user-a3",
  pendingInvitation: {
    organisationId: "org-a",
    email: "pending.invitee@example.com",
    role: "practitioner" as const,
    status: "pending" as const,
  },
} as const;

export function buildMultiOrgReliabilityPlan() {
  return {
    organisations: 3,
    usersPerOrganisation: 5,
    clientsPerOrganisation: 20,
    sessionsPerClient: 6,
    requiredOutcomes: {
      crossOrganisationReferences: 0,
      crossPractitionerUnauthorisedRecords: 0,
      wrongSessionOperations: 0,
      duplicateWrites: 0,
      confidentialContentExposureToAdmin: 0,
    },
  };
}
