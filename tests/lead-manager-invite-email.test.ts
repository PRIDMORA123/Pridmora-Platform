import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildOrganisationInviteRedirectTo,
  deliverOrganisationInvitationAuthEmail,
  isAlreadyRegisteredAuthError,
} from "@/lib/organisations/invitation-auth-delivery";
import { resolveInvitationAcceptLanding } from "@/lib/organisations/invitation-landing";
import { CUSTOMER_INVITE_ORIGIN_ENV } from "@/lib/owner/customer-invite-origin";
import { PILOT_PRODUCTION_ORIGIN } from "@/lib/supabase/project-env";
import { invitableRoles, canAssignRole } from "@/lib/organisations/permissions";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("Lead → Manager invitation Auth email delivery", () => {
  const originalCustomer = process.env.CUSTOMER_INVITE_ORIGIN;
  const originalEnvName = process.env.PRIDMORA_ENV;
  const originalExpected = process.env.PRIDMORA_EXPECTED_SUPABASE_REF;
  const originalAuthExpected = process.env.AUTH_EXPECTED_PROJECT_REF;

  beforeEach(() => {
    process.env.CUSTOMER_INVITE_ORIGIN = PILOT_PRODUCTION_ORIGIN;
    process.env.PRIDMORA_ENV = "pilot";
    process.env.PRIDMORA_EXPECTED_SUPABASE_REF = "jfcxnkmflfzzxqovkuqw";
    process.env.AUTH_EXPECTED_PROJECT_REF = "jfcxnkmflfzzxqovkuqw";
  });

  afterEach(() => {
    if (originalCustomer === undefined) delete process.env.CUSTOMER_INVITE_ORIGIN;
    else process.env.CUSTOMER_INVITE_ORIGIN = originalCustomer;
    if (originalEnvName === undefined) delete process.env.PRIDMORA_ENV;
    else process.env.PRIDMORA_ENV = originalEnvName;
    if (originalExpected === undefined) {
      delete process.env.PRIDMORA_EXPECTED_SUPABASE_REF;
    } else {
      process.env.PRIDMORA_EXPECTED_SUPABASE_REF = originalExpected;
    }
    if (originalAuthExpected === undefined) {
      delete process.env.AUTH_EXPECTED_PROJECT_REF;
    } else {
      process.env.AUTH_EXPECTED_PROJECT_REF = originalAuthExpected;
    }
  });

  it("A. Lead invite route triggers shared Auth email delivery", () => {
    const route = read("app/api/organisations/invitations/route.ts");
    expect(route).toContain("deliverOrganisationInvitationAuthEmail");
    expect(route).toContain("getSupabaseServiceClient");
    expect(route).toContain("authEmailSent: true");
    expect(route).toContain("createOrganisationInvitation");
  });

  it("B. new Auth user uses invite email path", async () => {
    const inviteUserByEmail = vi.fn().mockResolvedValue({
      data: { user: { id: "new-user-1" } },
      error: null,
    });
    const signInWithOtp = vi.fn();
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const result = await deliverOrganisationInvitationAuthEmail({
      service: {
        auth: { admin: { inviteUserByEmail }, signInWithOtp },
        from: () => ({ update }),
      } as never,
      email: "manager@example.com",
      invitationId: "inv-1",
      invitationToken: "token-abc",
      userMetadata: { professional_title: "Manager" },
    });

    expect(result.authDelivery).toBe("invite");
    expect(inviteUserByEmail).toHaveBeenCalledOnce();
    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(inviteUserByEmail.mock.calls[0][1].redirectTo).toContain(
      "token=token-abc"
    );
    expect(inviteUserByEmail.mock.calls[0][1].data.password_setup_required).toBe(
      true
    );
  });

  it("C. existing Auth user uses magic-link path (not recovery)", async () => {
    const inviteUserByEmail = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "User already registered" },
    });
    const signInWithOtp = vi.fn().mockResolvedValue({ data: {}, error: null });

    const result = await deliverOrganisationInvitationAuthEmail({
      service: {
        auth: { admin: { inviteUserByEmail }, signInWithOtp },
        from: () => ({ update: vi.fn() }),
      } as never,
      email: "existing@example.com",
      invitationId: "inv-2",
      invitationToken: "token-xyz",
    });

    expect(result.authDelivery).toBe("magiclink_existing_user");
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "existing@example.com",
      options: {
        shouldCreateUser: false,
        emailRedirectTo: expect.stringContaining(
          "/organisation/invitations/accept?token=token-xyz"
        ),
      },
    });
    expect(isAlreadyRegisteredAuthError("User already registered")).toBe(true);
  });

  it("D. correct public accept URL contains the organisation invitation token", () => {
    const redirectTo = buildOrganisationInviteRedirectTo(
      PILOT_PRODUCTION_ORIGIN,
      "org-invite-token"
    );
    expect(redirectTo).toBe(
      `${PILOT_PRODUCTION_ORIGIN}/organisation/invitations/accept?token=org-invite-token`
    );
    expect(redirectTo).not.toContain("127.0.0.1");
    expect(redirectTo).not.toContain("localhost");
    expect(redirectTo).not.toContain("platform.pridmora.com");
    expect(CUSTOMER_INVITE_ORIGIN_ENV).toBe("CUSTOMER_INVITE_ORIGIN");
  });

  it("E. seat-limit failure sends no email (enforced before delivery)", () => {
    const invitations = read("lib/organisations/invitations.ts");
    expect(invitations).toContain("assertPractitionerSeatAvailable");
    const route = read("app/api/organisations/invitations/route.ts");
    expect(route).toMatch(
      /createOrganisationInvitation[\s\S]*deliverOrganisationInvitationAuthEmail/
    );
  });

  it("F. Auth email failure revokes the newly-created pending invitation", async () => {
    const eqPending = vi.fn().mockResolvedValue({ error: null });
    const eqId = vi.fn().mockReturnValue({ eq: eqPending });
    const update = vi.fn().mockReturnValue({ eq: eqId });
    const from = vi.fn().mockReturnValue({ update });

    const inviteUserByEmail = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "SMTP unavailable" },
    });

    await expect(
      deliverOrganisationInvitationAuthEmail({
        service: {
          auth: {
            admin: { inviteUserByEmail },
            signInWithOtp: vi.fn(),
          },
          from,
        } as never,
        email: "manager@example.com",
        invitationId: "inv-fail",
        invitationToken: "token-fail",
      })
    ).rejects.toThrow(/invitation email could not be sent/i);

    expect(from).toHaveBeenCalledWith("organisation_invitations");
    expect(update).toHaveBeenCalledWith({ status: "revoked" });
    expect(eqId).toHaveBeenCalledWith("id", "inv-fail");
    expect(eqPending).toHaveBeenCalledWith("status", "pending");
  });

  it("G. UI does not claim sent if Auth initiation failed", () => {
    const modal = read("components/organisation/invite-member-modal.tsx");
    expect(modal).toContain("Manager invitation sent");
    expect(modal).toContain("Invitation email sent");
    expect(modal).not.toContain("Invitation created");
    expect(modal).toContain("authEmailSent");
    expect(modal).toContain("Invitation could not be sent.");
    const page = read("app/organisation/members/page.tsx");
    expect(page).toContain("authEmailSent");
    expect(page).toContain("The invitation email could not be sent.");
  });

  it("H. repeated invite supersedes prior pending invitation cleanly", () => {
    const invitations = read("lib/organisations/invitations.ts");
    expect(invitations).toContain('update({ status: "revoked" })');
    expect(invitations).toContain('.eq("status", "pending")');
    expect(invitations).toContain('.ilike("email", email)');
  });

  it("I. Owner → Lead invitation still uses shared Auth delivery", () => {
    const owner = read("lib/owner/invite-organisation-member.ts");
    expect(owner).toContain("deliverOrganisationInvitationAuthEmail");
    expect(owner).toContain('kind: "lead"');
    expect(owner).toContain('role: "oversight"');
    expect(owner).toContain("inviteOrganisationLead");
  });

  it("J. Manager acceptance still lands Manager at /?view=dashboard", () => {
    expect(
      resolveInvitationAcceptLanding({
        role: "practitioner",
        professionalRole: "manager",
      })
    ).toBe("/?view=dashboard");
  });

  it("K. invitation email ownership check remains enforced", () => {
    const sql = read(
      "supabase/migrations/20260809130000_owner_invite_manager.sql"
    );
    expect(sql).toContain("INVITATION_EMAIL_MISMATCH");
    expect(sql).toContain("where token_hash = v_token_hash");
    expect(invitableRoles("oversight")).toEqual(["practitioner"]);
    expect(canAssignRole("oversight", "administrator")).toBe(false);
  });
});
