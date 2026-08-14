import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  canAccessCoachingContent,
  canAccessPrivateIdentity,
  canAccessPrivateNotes,
  canAssignRole,
  canInviteMembers,
  canManageAssignments,
  canManageMembers,
  canReadOrganisationIntelligence,
  hasPermission,
  invitableRoles,
  permissionsForRole,
} from "@/lib/organisations/permissions";
import {
  assertPractitionerSeatAvailable,
} from "@/lib/organisations/licence";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("Organisation Lead (oversight) customer administration", () => {
  it("A. oversight Lead can invite Manager (practitioner)", () => {
    expect(canInviteMembers("oversight")).toBe(true);
    expect(hasPermission("oversight", "members.invite")).toBe(true);
    expect(invitableRoles("oversight")).toEqual(["practitioner"]);
    expect(canAssignRole("oversight", "practitioner")).toBe(true);
  });

  it("B. oversight Lead can revoke pending Manager invitation (members.invite)", () => {
    expect(hasPermission("oversight", "members.invite")).toBe(true);
    const route = read("app/api/organisations/invitations/route.ts");
    expect(route).toContain('action === "revoke"');
    expect(route).toContain('"members.invite"');
    const page = read("app/organisation/members/page.tsx");
    expect(page).toContain("Revoke invitation");
    expect(page).toContain('action: "revoke"');
  });

  it("C. oversight Lead can deactivate Manager membership", () => {
    expect(hasPermission("oversight", "members.deactivate")).toBe(true);
    expect(canManageMembers("oversight")).toBe(true);
    const page = read("app/organisation/members/page.tsx");
    expect(page).toContain("Remove Manager access");
    expect(page).toContain('setStatus(deactivateId, "deactivated")');
  });

  it("D. seat limits still enforced for practitioner invites", () => {
    expect(
      assertPractitionerSeatAvailable({
        licenceStatus: "active",
        seatsPurchased: 5,
        seatsInUse: 5,
        wouldNewlyConsumeSeat: true,
      })
    ).toMatch(/seat/i);
    expect(
      assertPractitionerSeatAvailable({
        licenceStatus: "active",
        seatsPurchased: 5,
        seatsInUse: 4,
        wouldNewlyConsumeSeat: true,
      })
    ).toBeNull();
    const invitations = read("lib/organisations/invitations.ts");
    expect(invitations).toContain("assertPractitionerSeatAvailable");
  });

  it("E. oversight Lead can load Assignments", () => {
    expect(canManageAssignments("oversight")).toBe(true);
    expect(hasPermission("oversight", "assignments.manage")).toBe(true);
    const route = read("app/api/organisations/assignments/route.ts");
    expect(route).toContain('"assignments.manage"');
  });

  it("F. oversight Lead can perform permitted assignment operations", () => {
    expect(canManageAssignments("oversight")).toBe(true);
    const route = read("app/api/organisations/assignments/route.ts");
    expect(route).toContain('action === "transfer"');
    expect(route).toContain('action === "end"');
    expect(route).toContain("assignRelationship");
  });

  it("G. oversight cannot invite administrator/owner/Lead roles", () => {
    expect(canAssignRole("oversight", "owner")).toBe(false);
    expect(canAssignRole("oversight", "administrator")).toBe(false);
    expect(canAssignRole("oversight", "oversight")).toBe(false);
    expect(canAssignRole("oversight", "viewer")).toBe(false);
    expect(invitableRoles("oversight")).not.toContain("administrator");
    expect(invitableRoles("oversight")).not.toContain("owner");
    expect(invitableRoles("oversight")).not.toContain("oversight");
    expect(invitableRoles("oversight")).not.toContain("viewer");
  });

  it("H. oversight cannot access coaching content", () => {
    expect(hasPermission("oversight", "coaching_content.view")).toBe(false);
    expect(
      canAccessCoachingContent({ role: "oversight", assignmentRole: null })
    ).toBe(false);
    expect(
      canAccessCoachingContent({ role: "oversight", assignmentRole: "primary" })
    ).toBe(false);
    expect(
      canAccessCoachingContent({
        role: "oversight",
        assignmentRole: "co_practitioner",
      })
    ).toBe(false);
  });

  it("I. oversight cannot access private notes", () => {
    expect(hasPermission("oversight", "private_notes.view")).toBe(false);
    expect(
      canAccessPrivateNotes({
        role: "oversight",
        assignmentRole: "primary",
        isOriginalPrivateNotesOwner: true,
      })
    ).toBe(false);
  });

  it("J. oversight cannot access reflections/preparation/private development content gates", () => {
    expect(canAccessPrivateIdentity({ role: "oversight", assignmentRole: "primary" })).toBe(
      false
    );
    expect(permissionsForRole("oversight")).not.toContain("coaching_content.view");
    expect(permissionsForRole("oversight")).not.toContain("private_notes.view");
    expect(permissionsForRole("oversight")).not.toContain("reports.generate");
    // Safe org intelligence remains allowed.
    expect(canReadOrganisationIntelligence("oversight")).toBe(true);
  });

  it("K. assignment to a Manager/person does NOT make oversight content-capable", () => {
    const permissionsSrc = read("lib/organisations/permissions.ts");
    expect(permissionsSrc).toContain("CONTENT_CAPABLE_ROLES");
    expect(permissionsSrc).toMatch(
      /CONTENT_CAPABLE_ROLES[\s\S]*?practitioner[\s\S]*?owner[\s\S]*?administrator/
    );
    expect(permissionsSrc).not.toMatch(
      /CONTENT_CAPABLE_ROLES[\s\S]{0,200}oversight/
    );
    expect(
      canAccessCoachingContent({ role: "oversight", assignmentRole: "primary" })
    ).toBe(false);
  });

  it("L. existing administrator/owner permissions remain unchanged", () => {
    expect(hasPermission("owner", "members.invite")).toBe(true);
    expect(hasPermission("owner", "assignments.manage")).toBe(true);
    expect(hasPermission("owner", "organisation.manage")).toBe(true);
    expect(hasPermission("owner", "billing.manage")).toBe(true);
    expect(hasPermission("administrator", "members.invite")).toBe(true);
    expect(hasPermission("administrator", "assignments.manage")).toBe(true);
    expect(hasPermission("administrator", "organisation.manage")).toBe(true);
    expect(hasPermission("administrator", "billing.manage")).toBe(false);
    expect(invitableRoles("owner")).toContain("administrator");
    expect(invitableRoles("administrator")).toContain("oversight");
  });

  it("M. Manager (practitioner) permissions remain unchanged", () => {
    expect(canInviteMembers("practitioner")).toBe(false);
    expect(canManageAssignments("practitioner")).toBe(false);
    expect(hasPermission("practitioner", "coaching_content.view")).toBe(true);
    expect(hasPermission("practitioner", "intelligence.organisation.read")).toBe(
      false
    );
    expect(
      canAccessCoachingContent({
        role: "practitioner",
        assignmentRole: "primary",
      })
    ).toBe(true);
  });

  it("N. Owner Lead invitation still creates role=oversight", () => {
    const lib = read("lib/owner/invite-organisation-member.ts");
    expect(lib).toContain('role: "oversight"');
    expect(lib).toContain("inviteOrganisationLead");
    expect(lib).toContain("professionalRole: null");
    expect(canAssignRole("owner", "oversight")).toBe(true);
  });

  it("O. organisation isolation remains enforced (permission helper is org-scoped)", () => {
    const migration = read(
      "supabase/migrations/20260814120000_oversight_lead_administration.sql"
    );
    expect(migration).toContain("m.organisation_id = p_organisation_id");
    expect(migration).toContain("m.user_id = p_user_id");
    expect(migration).toContain("m.status = 'active'");
    expect(migration).toContain(
      "members.invite' and m.role in ('owner', 'administrator', 'oversight')"
    );
    expect(migration).toContain(
      "assignments.manage' and m.role in ('owner', 'administrator', 'oversight')"
    );
    expect(migration).toContain(
      "coaching_content.view' and m.role in ('practitioner', 'owner', 'administrator')"
    );
    expect(migration).not.toMatch(
      /coaching_content\.view' and m\.role in \([^)]*oversight/
    );
  });

  it("migration file is present and idempotent (create or replace)", () => {
    const migrations = readdirSync(join(root, "supabase/migrations"));
    expect(migrations).toContain(
      "20260814120000_oversight_lead_administration.sql"
    );
    const sql = read(
      "supabase/migrations/20260814120000_oversight_lead_administration.sql"
    );
    expect(sql).toContain("create or replace function public.has_organisation_permission");
  });

  it("Lead Members UX uses Manager terminology without delete-user language", () => {
    const page = read("app/organisation/members/page.tsx");
    expect(page).toContain("Invite Manager");
    expect(page).toContain("Remove Manager access");
    expect(page).toContain("Revoke invitation");
    expect(page).not.toContain("Delete user");
    expect(page).toContain("Auth account is not deleted");
  });
});

describe("Lead Invite Manager role control UX", () => {
  it("Lead sees no Membership role <select> and a fixed Role: Manager label", () => {
    const modal = read("components/organisation/invite-member-modal.tsx");
    expect(modal).toContain('variant?: "member" | "manager"');
    expect(modal).toContain("isManagerInvite");
    expect(modal).toContain("Role: Manager");
    expect(modal).toContain("organisation-field-readonly");
    // Manager branch must not render the Membership role select.
    const managerBranch = modal.slice(
      modal.indexOf("{isManagerInvite ? ("),
      modal.indexOf(") : (")
    );
    expect(managerBranch).toContain("Role: Manager");
    expect(managerBranch).not.toContain("<select");
    expect(managerBranch).not.toContain("Membership role");
  });

  it("Lead invite still submits practitioner + manager", () => {
    const modal = read("components/organisation/invite-member-modal.tsx");
    expect(modal).toContain('role: isManagerInvite ? "practitioner" : role');
    expect(modal).toContain('? "manager"');
    const page = read("app/organisation/members/page.tsx");
    expect(page).toContain('const role = isLeadAdmin ? "practitioner" : input.role');
    expect(page).toContain(
      'const professionalRole = isLeadAdmin ? "manager" : input.professionalRole'
    );
  });

  it("Lead cannot invite owner/admin/oversight/viewer", () => {
    expect(invitableRoles("oversight")).toEqual(["practitioner"]);
    expect(canAssignRole("oversight", "owner")).toBe(false);
    expect(canAssignRole("oversight", "administrator")).toBe(false);
    expect(canAssignRole("oversight", "oversight")).toBe(false);
    expect(canAssignRole("oversight", "viewer")).toBe(false);
  });

  it("owner/admin generic invite behaviour retains Membership role <select>", () => {
    const modal = read("components/organisation/invite-member-modal.tsx");
    expect(modal).toContain("<span>Membership role</span>");
    expect(modal).toContain("MEMBERSHIP_ROLE_LABELS[option]");
    expect(invitableRoles("owner")).toEqual([
      "administrator",
      "oversight",
      "practitioner",
      "viewer",
    ]);
    expect(invitableRoles("administrator")).toEqual([
      "oversight",
      "practitioner",
      "viewer",
    ]);
  });

  it("loading state does not transiently expose generic role controls to Lead", () => {
    const page = read("app/organisation/members/page.tsx");
    expect(page).toContain("useState<MembershipRole | null>(null)");
    expect(page).toContain("roleResolved");
    expect(page).toContain("canInvite = canManage && roleResolved");
    expect(page).toContain('variant={isLeadAdmin ? "manager" : "member"}');
    // Invite UI gated until role is known — never default actorRole to administrator.
    expect(page).not.toContain(
      'useState<MembershipRole>("administrator")'
    );
    expect(page).toContain("{canInvite ? (");
    expect(page).toContain("<InviteMemberModal");
  });
});
