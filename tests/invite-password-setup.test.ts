import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeNextPath } from "@/lib/auth/email-link";
import {
  PASSWORD_SETUP_PATH,
  PASSWORD_SETUP_REQUIRED_KEY,
  buildPasswordSetupHref,
  isPasswordSetupAllowedPath,
  resolvePostInvitationAcceptDestination,
  userRequiresPasswordSetup,
} from "@/lib/auth/password-setup";
import { deliverOrganisationInvitationAuthEmail } from "@/lib/organisations/invitation-auth-delivery";
import { resolveInvitationAcceptLanding } from "@/lib/organisations/invitation-landing";
import { PILOT_PRODUCTION_ORIGIN } from "@/lib/supabase/project-env";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("Invited user first-time password setup", () => {
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

  it("A. new Lead invite stamps password_setup_required", async () => {
    const inviteUserByEmail = vi.fn().mockResolvedValue({
      data: { user: { id: "lead-user-1" } },
      error: null,
    });
    const updateUserById = vi.fn();
    const signInWithOtp = vi.fn();

    await deliverOrganisationInvitationAuthEmail({
      service: {
        auth: { admin: { inviteUserByEmail, updateUserById }, signInWithOtp },
        from: () => ({ update: vi.fn() }),
      } as never,
      email: "lead@example.com",
      invitationId: "inv-lead",
      invitationToken: "lead-token",
      userMetadata: { full_name: "Sam Lead", professional_title: "Lead" },
    });

    expect(inviteUserByEmail.mock.calls[0][1].data.password_setup_required).toBe(
      true
    );
    expect(updateUserById).not.toHaveBeenCalled();
    expect(signInWithOtp).not.toHaveBeenCalled();

    const owner = read("lib/owner/invite-organisation-member.ts");
    expect(owner).toContain("deliverOrganisationInvitationAuthEmail");
  });

  it("B. new Manager invite stamps password_setup_required", async () => {
    const inviteUserByEmail = vi.fn().mockResolvedValue({
      data: { user: { id: "mgr-user-1" } },
      error: null,
    });
    const updateUserById = vi.fn();

    await deliverOrganisationInvitationAuthEmail({
      service: {
        auth: {
          admin: { inviteUserByEmail, updateUserById },
          signInWithOtp: vi.fn(),
        },
        from: () => ({ update: vi.fn() }),
      } as never,
      email: "manager@example.com",
      invitationId: "inv-mgr",
      invitationToken: "mgr-token",
      userMetadata: { professional_title: "Manager" },
    });

    expect(inviteUserByEmail.mock.calls[0][1].data).toMatchObject({
      password_setup_required: true,
      professional_title: "Manager",
    });
    expect(updateUserById).not.toHaveBeenCalled();

    const route = read("app/api/organisations/invitations/route.ts");
    expect(route).toContain("deliverOrganisationInvitationAuthEmail");
  });

  it("C. existing-user magic-link invite does not stamp flag", async () => {
    const inviteUserByEmail = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "User already registered" },
    });
    const updateUserById = vi.fn();
    const signInWithOtp = vi.fn().mockResolvedValue({ data: {}, error: null });

    const result = await deliverOrganisationInvitationAuthEmail({
      service: {
        auth: { admin: { inviteUserByEmail, updateUserById }, signInWithOtp },
        from: () => ({ update: vi.fn() }),
      } as never,
      email: "existing@example.com",
      invitationId: "inv-existing",
      invitationToken: "existing-token",
    });

    expect(result.authDelivery).toBe("magiclink_existing_user");
    // inviteUserByEmail is attempted first (and fails); the durable flag must not
    // be applied via a successful invite or admin metadata update for existing users.
    expect(inviteUserByEmail).toHaveBeenCalledOnce();
    expect(updateUserById).not.toHaveBeenCalled();
    expect(signInWithOtp).toHaveBeenCalled();
  });

  it("D. accepted new Lead routes to setup-password", () => {
    const roleLanding = resolveInvitationAcceptLanding({
      role: "oversight",
      professionalRole: null,
    });
    expect(roleLanding).toBe("/organisation");

    const destination = resolvePostInvitationAcceptDestination({
      user: {
        id: "u1",
        user_metadata: { [PASSWORD_SETUP_REQUIRED_KEY]: true },
      } as never,
      roleLanding,
    });

    expect(destination).toBe(
      `${PASSWORD_SETUP_PATH}?next=${encodeURIComponent("/organisation")}`
    );

    const page = read("app/organisation/invitations/accept/page.tsx");
    expect(page).toContain("resolvePostInvitationAcceptDestination");
  });

  it("E. accepted new Manager routes to setup-password", () => {
    const roleLanding = resolveInvitationAcceptLanding({
      role: "practitioner",
      professionalRole: "manager",
    });
    expect(roleLanding).toBe("/?view=dashboard");

    const destination = resolvePostInvitationAcceptDestination({
      user: {
        id: "u2",
        user_metadata: { password_setup_required: true },
      } as never,
      roleLanding,
    });

    expect(destination).toContain(PASSWORD_SETUP_PATH);
    expect(destination).toContain(encodeURIComponent("/?view=dashboard"));
  });

  it("F. accepted existing user bypasses setup-password", () => {
    const roleLanding = resolveInvitationAcceptLanding({
      role: "practitioner",
      professionalRole: "manager",
    });
    const destination = resolvePostInvitationAcceptDestination({
      user: {
        id: "u3",
        user_metadata: { password_setup_required: false },
      } as never,
      roleLanding,
    });
    expect(destination).toBe("/?view=dashboard");
    expect(
      resolvePostInvitationAcceptDestination({
        user: { id: "u4", user_metadata: {} } as never,
        roleLanding: "/organisation",
      })
    ).toBe("/organisation");
  });

  it("G. setup route requires authenticated session", () => {
    const middleware = read("middleware.ts");
    expect(middleware).toContain('"/auth/setup-password"');
    expect(middleware).toContain("PASSWORD_SETUP_PATH");
    expect(middleware).toContain("passwordSetupRequired");
    expect(middleware).toContain("buildSafeSignInNext(PASSWORD_SETUP_PATH");

    const form = read("components/auth/setup-password-form.tsx");
    expect(form).toContain("getUser");
    expect(form).toContain("/auth/sign-in?next=");
    expect(form).toContain("userRequiresPasswordSetup");
  });

  it("H. valid password updates Auth user", () => {
    const form = read("components/auth/setup-password-form.tsx");
    expect(form).toContain("updateUser({");
    expect(form).toContain("password");
    expect(form).toContain("Create your password");
    expect(form).toContain("Confirm password");
    expect(form).toContain("password.length < 8");
    expect(form).not.toContain("resetPasswordForEmail");
    expect(form).not.toContain("verifyOtp");
    expect(form).not.toContain("PASSWORD_RECOVERY");
    expect(form).not.toContain("type: \"recovery\"");
  });

  it("I. setup flag clears only after successful password update", () => {
    const form = read("components/auth/setup-password-form.tsx");
    expect(form).toContain("[PASSWORD_SETUP_REQUIRED_KEY]: false");
    expect(form).toContain("PASSWORD_SETUP_REQUIRED_KEY");
    // Clear is inside the same updateUser call as password — only runs on success path after error check.
    const updateIdx = form.indexOf("updateUser({");
    const errorIdx = form.indexOf("if (updateError)");
    const successIdx = form.indexOf("setSuccess(true)");
    expect(updateIdx).toBeGreaterThan(-1);
    expect(errorIdx).toBeGreaterThan(updateIdx);
    expect(successIdx).toBeGreaterThan(errorIdx);
  });

  it("J. failed password update leaves flag intact", () => {
    const form = read("components/auth/setup-password-form.tsx");
    expect(form).toContain("if (updateError)");
    expect(form).toContain("setError(mapped.userMessage)");
    expect(form).toContain("return;");
    // On error we return before setSuccess / location.assign — flag clear is only in updateUser payload which failed.
    const errorReturnBlock = form.slice(
      form.indexOf("if (updateError)"),
      form.indexOf("setSuccess(true)")
    );
    expect(errorReturnBlock).toContain("return;");
    expect(errorReturnBlock).not.toContain("window.location.assign");
  });

  it("K. safe internal next preserved", () => {
    expect(buildPasswordSetupHref("/organisation")).toBe(
      `/auth/setup-password?next=${encodeURIComponent("/organisation")}`
    );
    expect(buildPasswordSetupHref("/?view=dashboard")).toBe(
      `/auth/setup-password?next=${encodeURIComponent("/?view=dashboard")}`
    );
    expect(sanitizeNextPath("/organisation")).toBe("/organisation");
    expect(sanitizeNextPath("/?view=dashboard")).toBe("/?view=dashboard");
  });

  it("L. external/malformed next rejected", () => {
    expect(buildPasswordSetupHref("https://evil.example/phish")).toBe(
      `/auth/setup-password?next=${encodeURIComponent("/")}`
    );
    expect(buildPasswordSetupHref("//evil.example")).toBe(
      `/auth/setup-password?next=${encodeURIComponent("/")}`
    );
    expect(sanitizeNextPath("javascript:alert(1)")).toBe("/");
    expect(
      resolvePostInvitationAcceptDestination({
        user: {
          id: "u5",
          user_metadata: { password_setup_required: true },
        } as never,
        roleLanding: "https://evil.example",
      })
    ).toBe(`/auth/setup-password?next=${encodeURIComponent("/")}`);
  });

  it("M. normal returning login with email+password works after setup", () => {
    const signIn = read("components/auth/sign-in-form.tsx");
    expect(signIn).toContain("signInWithPassword");
    expect(signIn).toContain('name="password"');
    expect(signIn).not.toContain("password_setup_required");

    expect(userRequiresPasswordSetup({
      id: "done",
      user_metadata: { password_setup_required: false },
    } as never)).toBe(false);
  });

  it("N. forgot/reset-password flow remains unchanged", () => {
    const reset = read("components/auth/reset-password-form.tsx");
    expect(reset).toContain("PASSWORD_RECOVERY");
    expect(reset).toContain('type: "recovery"');
    expect(reset).toContain("updateUser({ password })");
    expect(reset).not.toContain("password_setup_required");
    expect(reset).not.toContain("setup-password");

    const forgot = read("components/auth/forgot-password-form.tsx");
    expect(forgot).toContain("resetPasswordForEmail");

    const middleware = read("middleware.ts");
    expect(middleware).toContain('pathname !== "/auth/reset-password"');
  });

  it("O. invitation acceptance ownership/security remains unchanged", () => {
    const acceptAuth = read("lib/organisations/invitation-accept-auth.ts");
    expect(acceptAuth).toContain("hasInboundAuthCallback");
    expect(acceptAuth).toContain("consumeInboundAuthSession");
    expect(acceptAuth).toContain("invitationEmailsMatch");

    const invitations = read("lib/organisations/invitations.ts");
    expect(invitations).toContain("accept_organisation_invitation");
    expect(invitations).toContain("INVITATION_EMAIL_MISMATCH");

    const page = read("app/organisation/invitations/accept/page.tsx");
    expect(page).toContain('action: "accept"');
    expect(page).toContain("ensureInvitationAcceptSession");
  });

  it("middleware allows setup while required and blocks alternate use when not", () => {
    const middleware = read("middleware.ts");
    expect(middleware).toContain("isPasswordSetupAllowedPath");
    expect(middleware).toContain("!passwordSetupRequired");
    expect(isPasswordSetupAllowedPath(PASSWORD_SETUP_PATH)).toBe(true);
    expect(isPasswordSetupAllowedPath("/organisation/invitations/accept")).toBe(
      true
    );
    expect(isPasswordSetupAllowedPath("/organisation")).toBe(false);
    expect(isPasswordSetupAllowedPath("/")).toBe(false);
  });
});
