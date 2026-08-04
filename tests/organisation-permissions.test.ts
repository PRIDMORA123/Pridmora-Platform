import { describe, expect, it } from "vitest";
import {
  canAccessCoachingContent,
  canAccessPrivateNotes,
  canAssignRole,
  canInviteMembers,
  canSeeOrganisationNav,
  hasPermission,
  invitableRoles,
} from "@/lib/organisations/permissions";
import {
  generateInvitationToken,
  hashInvitationToken,
} from "@/lib/organisations/invitations";

describe("organisation permissions", () => {
  it("does not grant confidential coaching content to administrators without assignment", () => {
    expect(
      canAccessCoachingContent({ role: "administrator", assignmentRole: null })
    ).toBe(false);
    expect(
      canAccessCoachingContent({ role: "owner", assignmentRole: null })
    ).toBe(false);
    expect(
      canAccessCoachingContent({ role: "oversight", assignmentRole: "primary" })
    ).toBe(false);
  });

  it("grants coaching content to assigned practitioners", () => {
    expect(
      canAccessCoachingContent({
        role: "practitioner",
        assignmentRole: "primary",
      })
    ).toBe(true);
    expect(
      canAccessCoachingContent({
        role: "practitioner",
        assignmentRole: "cover",
      })
    ).toBe(true);
    expect(
      canAccessCoachingContent({
        role: "practitioner",
        assignmentRole: "supervisor",
      })
    ).toBe(false);
  });

  it("restricts private notes after transfer to original owner or primary", () => {
    expect(
      canAccessPrivateNotes({
        role: "practitioner",
        assignmentRole: "primary",
        isOriginalPrivateNotesOwner: false,
      })
    ).toBe(true);

    expect(
      canAccessPrivateNotes({
        role: "practitioner",
        assignmentRole: "cover",
        isOriginalPrivateNotesOwner: false,
      })
    ).toBe(false);

    expect(
      canAccessPrivateNotes({
        role: "practitioner",
        assignmentRole: "cover",
        isOriginalPrivateNotesOwner: true,
      })
    ).toBe(true);
  });

  it("prevents role escalation for viewers and practitioners", () => {
    expect(canInviteMembers("viewer")).toBe(false);
    expect(canInviteMembers("practitioner")).toBe(false);
    expect(invitableRoles("administrator")).not.toContain("owner");
    expect(canAssignRole("administrator", "owner")).toBe(false);
    expect(canAssignRole("owner", "administrator")).toBe(true);
  });

  it("shows organisation navigation only for admin/oversight roles", () => {
    expect(canSeeOrganisationNav("owner")).toBe(true);
    expect(canSeeOrganisationNav("administrator")).toBe(true);
    expect(canSeeOrganisationNav("oversight")).toBe(true);
    expect(canSeeOrganisationNav("practitioner")).toBe(false);
    expect(canSeeOrganisationNav("viewer")).toBe(false);
  });

  it("grants sample organisation management to owners and administrators only", () => {
    expect(hasPermission("owner", "sample_organisation.manage")).toBe(true);
    expect(hasPermission("administrator", "sample_organisation.manage")).toBe(
      true
    );
    expect(hasPermission("practitioner", "sample_organisation.manage")).toBe(
      false
    );
    expect(hasPermission("oversight", "sample_organisation.manage")).toBe(false);
    expect(hasPermission("viewer", "sample_organisation.manage")).toBe(false);
  });

  it("keeps oversight away from private notes and coaching content permissions", () => {
    expect(hasPermission("oversight", "organisation.view_safe_oversight")).toBe(
      true
    );
    expect(hasPermission("oversight", "private_notes.view")).toBe(false);
    expect(hasPermission("oversight", "coaching_content.view")).toBe(false);
    expect(hasPermission("oversight", "members.invite")).toBe(false);
  });
});

describe("invitation tokens", () => {
  it("stores only hashed tokens", () => {
    const { token, tokenHash } = generateInvitationToken();
    expect(tokenHash).toBe(hashInvitationToken(token));
    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toHaveLength(64);
  });

  it("produces unique tokens", () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});
