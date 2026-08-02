import { describe, expect, it } from "vitest";
import {
  ORG_FIXTURES,
  buildMultiOrgReliabilityPlan,
} from "@/tests/fixtures/organisation-fixtures";
import {
  canAccessCoachingContent,
  canInviteMembers,
  canSeeOrganisationNav,
} from "@/lib/organisations/permissions";

describe("organisation fixtures", () => {
  it("covers required multi-org scenarios", () => {
    expect(ORG_FIXTURES.organisations).toHaveLength(3);
    expect(ORG_FIXTURES.organisations[0].practitioners).toHaveLength(3);
    expect(ORG_FIXTURES.organisations[0].clientCount).toBe(9);
    expect(ORG_FIXTURES.organisations[1].clientCount).toBe(6);
    expect(ORG_FIXTURES.organisations[2].clientCount).toBe(3);
    expect(ORG_FIXTURES.dualMembershipUserId).toBe("user-dual");
    expect(ORG_FIXTURES.unassignedAdminUserId).toBe("user-a-admin");
    expect(ORG_FIXTURES.heavyPractitionerAssignmentCount).toBe(5);
    expect(ORG_FIXTURES.pendingInvitation.status).toBe("pending");
  });

  it("encodes confidentiality expectations for fixture roles", () => {
    expect(
      canAccessCoachingContent({
        role: "administrator",
        assignmentRole: null,
      })
    ).toBe(false);
    expect(canInviteMembers("viewer")).toBe(false);
    expect(canSeeOrganisationNav("oversight")).toBe(true);
  });

  it("defines multi-org reliability plan with zero-leak outcomes", () => {
    const plan = buildMultiOrgReliabilityPlan();
    expect(plan.organisations).toBe(3);
    expect(plan.usersPerOrganisation).toBe(5);
    expect(plan.clientsPerOrganisation).toBe(20);
    expect(plan.sessionsPerClient).toBe(6);
    expect(plan.requiredOutcomes.crossOrganisationReferences).toBe(0);
    expect(plan.requiredOutcomes.confidentialContentExposureToAdmin).toBe(0);
  });
});
