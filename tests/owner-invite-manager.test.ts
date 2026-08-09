import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inviteManagerSchema } from "@/lib/owner/invite-manager-schema";
import {
  buildManagerInviteAcceptNext,
  buildManagerInviteRedirectTo,
} from "@/lib/owner/invite-manager";
import { canInviteMembers, permissionsForRole } from "@/lib/organisations/permissions";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

const MIGRATION =
  "supabase/migrations/20260809130000_owner_invite_manager.sql";

describe("Slice 2 — owner invite first manager", () => {
  it("ships invitation display columns and preserves accept RPC security boundary", () => {
    expect(existsSync(join(root, MIGRATION))).toBe(true);
    const sql = read(MIGRATION);
    expect(sql).toContain("add column if not exists full_name");
    expect(sql).toContain("add column if not exists job_title");
    expect(sql).toContain("accept_organisation_invitation");
    expect(sql).toContain("professional_role");
    expect(sql).toContain("v_invite.role");
    expect(sql).toContain("member_joined");
    expect(sql).not.toContain("'owner'");
    expect(sql).not.toContain("inviteUserByEmail");
  });

  it("exposes Owner Console invite API gated by platform owner", () => {
    const route = read(
      "app/api/owner/organisations/[id]/invitations/route.ts"
    );
    expect(route).toContain("export async function GET");
    expect(route).toContain("export async function POST");
    expect(route).toContain("requirePlatformOwner");
    expect(route).toContain("inviteOrganisationManager");
    expect(route).toContain("manager.invitation_created");
    expect(route).toContain("writePlatformAudit");
    expect(route).toContain("getSupabaseServiceClient");
  });

  it("creates manager invitations as practitioner + professional_role manager only", () => {
    const lib = read("lib/owner/invite-manager.ts");
    expect(lib).toContain('role: "practitioner"');
    expect(lib).toContain('professional_role: "manager"');
    expect(lib).toContain("inviteUserByEmail");
    expect(lib).toContain("assertPractitionerSeatAvailable");
    expect(lib).toContain("countPendingPractitionerInvites");
    expect(lib).toContain("buildManagerInviteRedirectTo");
    expect(lib).not.toContain('role: "owner"');
    expect(lib).not.toContain('role: "administrator"');
  });

  it("validates invite form fields and does not accept organisation selection", () => {
    const ok = inviteManagerSchema.safeParse({
      fullName: "  Alex Manager  ",
      email: "  Alex@Example.com ",
      jobTitle: "  People Lead  ",
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.fullName).toBe("Alex Manager");
      expect(ok.data.email).toBe("alex@example.com");
      expect(ok.data.jobTitle).toBe("People Lead");
    }

    expect(
      inviteManagerSchema.safeParse({
        fullName: "",
        email: "alex@example.com",
      }).success
    ).toBe(false);

    expect(
      inviteManagerSchema.safeParse({
        fullName: "Alex",
        email: "not-an-email",
      }).success
    ).toBe(false);

    const schemaSource = read("lib/owner/invite-manager-schema.ts");
    expect(schemaSource).not.toContain("organisationId");
  });

  it("builds invite RedirectTo as accept URL without PKCE callback", () => {
    const acceptNext = buildManagerInviteAcceptNext("token-value");
    expect(acceptNext).toBe(
      "/organisation/invitations/accept?token=token-value"
    );

    const redirect = buildManagerInviteRedirectTo(
      "https://platform.pridmora.com",
      "token-value"
    );
    expect(redirect).toBe(
      "https://platform.pridmora.com/organisation/invitations/accept?token=token-value"
    );
    expect(redirect).not.toContain("/auth/callback");
    expect(redirect).not.toContain("code=");
  });

  it("wires Invite manager UI on organisation detail without Lead hierarchy", () => {
    const page = read("app/owner/organisations/[id]/page.tsx");
    expect(page).toContain("Invite manager");
    expect(page).toContain("owner-invite-manager-name");
    expect(page).toContain("owner-invite-manager-email");
    expect(page).toContain("owner-invite-manager-title");
    expect(page).toContain("/invitations");
    expect(page).toContain("Manager invitations");
    expect(page).not.toContain("Organisation Lead");
    expect(page).not.toContain("Invite team member");
  });

  it("accept landing remains manager workspace home, not owner or organisation admin", () => {
    const accept = read("app/organisation/invitations/accept/page.tsx");
    expect(accept).toContain('window.location.assign("/?view=dashboard")');
    expect(accept).not.toContain('"/owner"');
    expect(accept).not.toContain('"/organisation"');
  });

  it("does not grant manager organisation-owner or Owner Console permissions", () => {
    expect(canInviteMembers("practitioner")).toBe(false);
    const permissions = permissionsForRole("practitioner");
    expect(permissions).not.toContain("members.invite");
    expect(permissions).not.toContain("members.manage");
    expect(permissions).not.toContain("billing.manage");
    expect(permissions).not.toContain("organisation.manage");

    const permissionsSource = read("lib/organisations/permissions.ts");
    expect(permissionsSource).not.toContain("canInviteTeamMembers");
    expect(permissionsSource).not.toContain("canManageOwnTeam");
  });

  it("keeps Slice 1 create-org path free of invitation side effects", () => {
    const createRoute = read("app/api/owner/organisations/route.ts");
    expect(createRoute).not.toContain("inviteOrganisationManager");
    expect(createRoute).not.toContain("inviteUserByEmail");
  });
});
