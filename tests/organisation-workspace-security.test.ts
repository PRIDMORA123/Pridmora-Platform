import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canInviteMembers,
  canManageOrganisation,
  canManageAssignments,
  hasPermission,
} from "@/lib/organisations/permissions";
import {
  generateInvitationToken,
  hashInvitationToken,
} from "@/lib/organisations/invitations";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("organisation premium UI security & permission regressions", () => {
  it("does not log or persist plain invitation tokens", () => {
    const invitations = read("lib/organisations/invitations.ts");
    const route = read("app/api/organisations/invitations/route.ts");
    const members = read("app/organisation/members/page.tsx");
    const modal = read("components/organisation/invite-member-modal.tsx");

    expect(invitations).toContain("token_hash");
    expect(invitations).not.toContain("plain_token");
    expect(invitations).not.toMatch(/console\.(log|info|debug).*token/i);
    expect(route).not.toMatch(/console\.(log|info|debug).*token/i);
    expect(members).not.toContain("<code>{inviteLink}</code>");
    expect(modal).toContain("Copy invitation link");
    expect(modal).not.toContain("Share this single-use link");
  });

  it("keeps invitation token hashed", () => {
    const { token, tokenHash } = generateInvitationToken();
    expect(tokenHash).toBe(hashInvitationToken(token));
    expect(tokenHash).not.toBe(token);
  });

  it("prevents unauthorised roles from inviting or changing settings/assignments", () => {
    expect(canInviteMembers("viewer")).toBe(false);
    expect(canInviteMembers("practitioner")).toBe(false);
    expect(canInviteMembers("oversight")).toBe(false);
    expect(canManageOrganisation("viewer")).toBe(false);
    expect(canManageOrganisation("practitioner")).toBe(false);
    expect(canManageAssignments("viewer")).toBe(false);
    expect(canManageAssignments("practitioner")).toBe(false);
    expect(hasPermission("viewer", "organisation.manage")).toBe(false);
    expect(hasPermission("oversight", "members.invite")).toBe(false);
  });

  it("does not expose confidential coaching content in organisation UI pages", () => {
    for (const path of [
      "app/organisation/page.tsx",
      "app/organisation/usage/page.tsx",
      "app/organisation/members/page.tsx",
      "app/organisation/assignments/page.tsx",
      "app/organisation/settings/page.tsx",
    ]) {
      const source = read(path);
      expect(source).not.toMatch(/privateNotes|private_notes|summaryText/i);
      expect(source).not.toMatch(/coaching themes/i);
    }
  });

  it("does not change membership role values or schema in this pass", () => {
    const types = read("lib/organisations/types.ts");
    expect(types).toContain('"owner"');
    expect(types).toContain('"administrator"');
    expect(types).toContain('"oversight"');
    expect(types).toContain('"practitioner"');
    expect(types).toContain('"viewer"');
    expect(types).not.toContain('"coach" as MembershipRole');
  });

  it("accept flow uses auth-only context and structured invitation error codes", () => {
    const route = read("app/api/organisations/invitations/route.ts");
    expect(route).toContain("requireAuthenticatedUser");
    expect(route).toContain("InvitationAcceptError");
    expect(route).toContain("acceptOrganisationInvitation");
  });
});
