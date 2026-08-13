import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ownerInvitePayloadSchema } from "@/lib/owner/invite-kind-schema";
import {
  canAccessCoachingContent,
  canInviteMembers,
  canReadOrganisationIntelligence,
  permissionsForRole,
} from "@/lib/organisations/permissions";
import {
  memberConsumesPractitionerSeat,
  wouldMembershipConsumeSeat,
} from "@/lib/organisations/licence";
import { resolveInvitationAcceptLanding } from "@/lib/organisations/invitation-landing";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("Owner Console — Invite Organisation Lead", () => {
  it("wires Invite Lead UI alongside Invite manager", () => {
    const page = read("app/owner/organisations/[id]/page.tsx");
    expect(page).toContain("Invite Lead");
    expect(page).toContain("Invite manager");
    expect(page).toContain("Organisation Leads");
    expect(page).toContain("Lead invitations");
    expect(page).toContain("Manager invitations");
    expect(page).toContain("owner-invite-lead-name");
    expect(page).toContain("owner-invite-lead-email");
    expect(page).toContain("owner-invite-manager-name");
    expect(page).toContain("inviteKind: \"lead\"");
    expect(page).toContain("inviteKind: \"manager\"");
    expect(page).toContain("Leads do not receive");
    expect(page).toContain("private Manager development content");
    expect(page).not.toContain("Invite team member");
    expect(page).not.toContain('professional_role = "lead"');
  });

  it("maps Lead invite server-side to oversight with null professional_role", () => {
    const lib = read("lib/owner/invite-organisation-member.ts");
    expect(lib).toContain('role: "oversight"');
    expect(lib).toContain("professionalRole: null");
    expect(lib).toContain("consumesPractitionerSeat: false");
    expect(lib).toContain("inviteOrganisationLead");
    expect(lib).toContain('kind: "lead"');
    expect(lib).not.toContain('professional_role: "lead"');
    expect(lib).not.toContain('professionalRole: "lead"');
  });

  it("preserves Manager invite as practitioner + manager with seat reservation", () => {
    const lib = read("lib/owner/invite-organisation-member.ts");
    expect(lib).toContain('role: "practitioner"');
    expect(lib).toContain('professionalRole: "manager"');
    expect(lib).toContain("consumesPractitionerSeat: true");
    expect(lib).toContain("assertPractitionerSeatAvailable");
    expect(lib).toContain("inviteOrganisationManager");
  });

  it("Owner invite API rejects client-supplied role / professional_role", () => {
    const route = read(
      "app/api/owner/organisations/[id]/invitations/route.ts"
    );
    expect(route).toContain("inviteOrganisationLead");
    expect(route).toContain("inviteOrganisationManager");
    expect(route).toContain("inviteKind");
    expect(route).toContain("lead.invitation_created");
    expect(route).toContain("manager.invitation_created");
    expect(route).toContain("cannot be supplied by the client");
    expect(route).toContain('"role" in body');
    expect(route).toContain('"professionalRole" in body');
    expect(route).toContain('"professional_role" in body');
  });

  it("inviteKind schema allows only lead|manager and ignores role injection via strict object", () => {
    const lead = ownerInvitePayloadSchema.safeParse({
      inviteKind: "lead",
      fullName: "Sam Lead",
      email: "sam@example.com",
      jobTitle: "Head of People",
    });
    expect(lead.success).toBe(true);
    if (lead.success) {
      expect(lead.data.inviteKind).toBe("lead");
      expect(lead.data).not.toHaveProperty("role");
      expect(lead.data).not.toHaveProperty("professionalRole");
    }

    const managerDefault = ownerInvitePayloadSchema.safeParse({
      fullName: "Alex Manager",
      email: "alex@example.com",
    });
    expect(managerDefault.success).toBe(true);
    if (managerDefault.success) {
      expect(managerDefault.data.inviteKind).toBe("manager");
    }

    expect(
      ownerInvitePayloadSchema.safeParse({
        inviteKind: "administrator",
        fullName: "Nope",
        email: "nope@example.com",
      }).success
    ).toBe(false);

    expect(
      ownerInvitePayloadSchema.safeParse({
        inviteKind: "lead",
        fullName: "Sam",
        email: "sam@example.com",
        role: "owner",
      }).success
    ).toBe(false);

    expect(
      ownerInvitePayloadSchema.safeParse({
        inviteKind: "lead",
        fullName: "Sam",
        email: "sam@example.com",
        professionalRole: "manager",
      }).success
    ).toBe(false);
  });

  it("Lead accept lands on /organisation; Manager accept lands on Manager Home", () => {
    expect(
      resolveInvitationAcceptLanding({
        role: "oversight",
        professionalRole: null,
      })
    ).toBe("/organisation");
    expect(
      resolveInvitationAcceptLanding({
        role: "practitioner",
        professionalRole: "manager",
      })
    ).toBe("/?view=dashboard");

    const accept = read("app/organisation/invitations/accept/page.tsx");
    expect(accept).toContain("resolveInvitationAcceptLanding");
    expect(accept).toContain('from "@/lib/organisations/invitation-landing"');
    expect(accept).not.toContain('from "@/lib/organisations/invitations"');
    expect(accept).toContain("result.role");
    expect(accept).toContain("result.professionalRole");
    expect(accept).not.toContain('"/owner"');
  });

  it("Lead/oversight has intelligence read and cannot invite or see private coaching content", () => {
    expect(canReadOrganisationIntelligence("oversight")).toBe(true);
    expect(canInviteMembers("oversight")).toBe(false);
    expect(permissionsForRole("oversight")).not.toContain("members.invite");
    expect(permissionsForRole("oversight")).not.toContain("members.manage");
    expect(
      canAccessCoachingContent({ role: "oversight", assignmentRole: "primary" })
    ).toBe(false);
    expect(
      canAccessCoachingContent({ role: "oversight", assignmentRole: null })
    ).toBe(false);
  });

  it("Manager practitioner cannot read organisation intelligence APIs by professional role alone", () => {
    expect(canReadOrganisationIntelligence("practitioner")).toBe(false);
    expect(permissionsForRole("practitioner")).not.toContain(
      "intelligence.organisation.read"
    );
  });

  it("pure Lead/oversight does not consume a practitioner seat; Manager does", () => {
    expect(
      memberConsumesPractitionerSeat({
        role: "oversight",
        status: "active",
        hasPractitionerAccess: false,
        hasActiveRelationshipAssignment: false,
      })
    ).toBe(false);
    expect(
      wouldMembershipConsumeSeat({
        role: "oversight",
        status: "active",
      })
    ).toBe(false);
    expect(
      memberConsumesPractitionerSeat({
        role: "practitioner",
        status: "active",
        hasPractitionerAccess: false,
        hasActiveRelationshipAssignment: false,
      })
    ).toBe(true);
  });

  it("create organisation still creates no membership or invitation", () => {
    const createRoute = read("app/api/owner/organisations/route.ts");
    expect(createRoute).not.toContain("inviteOrganisationManager");
    expect(createRoute).not.toContain("inviteOrganisationLead");
    expect(createRoute).not.toContain("inviteUserByEmail");

    const sql = read(
      "supabase/migrations/20260809120000_owner_create_customer_organisation.sql"
    );
    expect(sql).toContain("No invitations");
    expect(sql).not.toContain("organisation_memberships");
  });

  it("requires no new migration or professional_role lead enum", () => {
    const migrationsDir = join(root, "supabase/migrations");
    const migrations = readdirSync(migrationsDir).filter(name =>
      name.endsWith(".sql")
    );
    expect(
      migrations.some(name => name.includes("invite_lead") || name.includes("professional_role_lead"))
    ).toBe(false);

    const foundation = read(
      "supabase/migrations/20260802140000_organisation_foundation.sql"
    );
    expect(foundation).toContain("'oversight'");
    expect(foundation).not.toMatch(/professional_role[^\n]*'lead'/);

    expect(existsSync(join(root, "lib/owner/invite-organisation-member.ts"))).toBe(
      true
    );
  });

  it("password recovery correction files remain present", () => {
    const recovery = read("lib/auth/recovery.ts");
    expect(recovery.length).toBeGreaterThan(0);
    const forgot = read("components/auth/forgot-password-form.tsx");
    expect(forgot.length).toBeGreaterThan(0);
    const template = read("supabase/email-templates/recovery.html");
    expect(template.length).toBeGreaterThan(0);
  });
});
