import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSafeSignInNext } from "@/lib/auth/email-link";
import {
  buildInvitationAcceptSignInHref,
  buildOrganisationInviteAcceptNext,
  ensureInvitationAcceptSession,
  hasInboundAuthCallback,
  invitationEmailsMatch,
  readInvitationTokenFromSearch,
} from "@/lib/organisations/invitation-accept-auth";
import {
  acceptOrganisationInvitation,
  hashInvitationToken,
  InvitationAcceptError,
} from "@/lib/organisations/invitations";
import { buildOrganisationInviteRedirectTo } from "@/lib/owner/invite-organisation-member";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("Organisation invitation accept flow — identity preservation", () => {
  it("A. correct invitation token is looked up by hash only (not by org/email list)", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        organisation_id: "org-1",
        membership_id: "mem-1",
        role: "oversight",
        professional_role: null,
      },
      error: null,
    });

    const token = "invite-token-A";
    await acceptOrganisationInvitation({
      supabase: { rpc } as never,
      token,
      userId: "user-a",
      userEmail: "personA@example.com",
    });

    expect(rpc).toHaveBeenCalledWith("accept_organisation_invitation", {
      invitation_token: token,
    });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("organisation_id");
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("email");
  });

  it("B. correct invitation + different authenticated email is rejected", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: false, code: "INVITATION_EMAIL_MISMATCH" },
      error: null,
    });

    await expect(
      acceptOrganisationInvitation({
        supabase: { rpc } as never,
        token: "invite-token-A",
        userId: "user-b",
        userEmail: "personB@example.com",
      })
    ).rejects.toMatchObject({
      name: "InvitationAcceptError",
      code: "INVITATION_EMAIL_MISMATCH",
    });
  });

  it("C. two pending invitations keep distinct tokens and accept URLs", () => {
    const tokenA = "token-person-a";
    const tokenB = "token-person-b";
    expect(hashInvitationToken(tokenA)).not.toBe(hashInvitationToken(tokenB));

    const urlA = buildOrganisationInviteRedirectTo(
      "https://pilot.pridmora.com",
      tokenA
    );
    const urlB = buildOrganisationInviteRedirectTo(
      "https://pilot.pridmora.com",
      tokenB
    );

    expect(urlA).toContain(`token=${encodeURIComponent(tokenA)}`);
    expect(urlB).toContain(`token=${encodeURIComponent(tokenB)}`);
    expect(urlA).not.toContain(encodeURIComponent(tokenB));
    expect(urlB).not.toContain(encodeURIComponent(tokenA));

    expect(
      readInvitationTokenFromSearch(new URL(urlA).searchParams)
    ).toBe(tokenA);
    expect(
      readInvitationTokenFromSearch(new URL(urlB).searchParams)
    ).toBe(tokenB);
  });

  it("D. revoked invitation cannot be accepted", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: false, code: "INVITATION_ALREADY_USED" },
      error: null,
    });

    await expect(
      acceptOrganisationInvitation({
        supabase: { rpc } as never,
        token: "revoked-token",
        userId: "user-a",
        userEmail: "personA@example.com",
      })
    ).rejects.toMatchObject({ code: "INVITATION_ALREADY_USED" });
  });

  it("E. expired invitation cannot be accepted", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: false, code: "INVITATION_EXPIRED" },
      error: null,
    });

    await expect(
      acceptOrganisationInvitation({
        supabase: { rpc } as never,
        token: "expired-token",
        userId: "user-a",
        userEmail: "personA@example.com",
      })
    ).rejects.toMatchObject({ code: "INVITATION_EXPIRED" });
  });

  it("F. authentication redirect preserves the original invitation token", () => {
    const token = "preserve-me-token";
    const acceptNext = buildOrganisationInviteAcceptNext(token);
    const signInNext = buildSafeSignInNext(
      "/organisation/invitations/accept",
      `?token=${encodeURIComponent(token)}`
    );
    expect(signInNext).toBe(acceptNext);
    expect(signInNext).toContain(`token=${encodeURIComponent(token)}`);

    const href = buildInvitationAcceptSignInHref(token);
    expect(href.startsWith("/auth/sign-in?next=")).toBe(true);
    const next = new URL(href, "https://pilot.pridmora.com").searchParams.get(
      "next"
    );
    expect(next).toBe(acceptNext);

    const middleware = read("middleware.ts");
    expect(middleware).toContain('"/organisation/invitations/accept"');
    expect(middleware).toContain("buildSafeSignInNext");
  });

  it("G. existing authenticated matching user can accept (RPC success path)", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        organisation_id: "org-1",
        membership_id: "mem-1",
        role: "oversight",
        professional_role: null,
      },
      error: null,
    });

    const result = await acceptOrganisationInvitation({
      supabase: { rpc } as never,
      token: "invite-token-A",
      userId: "user-a",
      userEmail: "personA@example.com",
    });

    expect(result.organisationId).toBe("org-1");
    expect(result.role).toBe("oversight");
  });

  it("H. existing authenticated non-matching user is rejected", async () => {
    await expect(
      acceptOrganisationInvitation({
        supabase: {
          rpc: vi.fn().mockResolvedValue({
            data: { ok: false, code: "INVITATION_EMAIL_MISMATCH" },
            error: null,
          }),
        } as never,
        token: "invite-token-A",
        userId: "owner-1",
        userEmail: "owner@example.com",
      })
    ).rejects.toBeInstanceOf(InvitationAcceptError);
  });

  it("I. historical/revoked invitations do not share token identity with a new pending invite", () => {
    const revoked = "old-revoked-token";
    const pending = "new-pending-token";
    expect(hashInvitationToken(revoked)).not.toBe(hashInvitationToken(pending));
    expect(buildOrganisationInviteAcceptNext(pending)).not.toContain(
      encodeURIComponent(revoked)
    );
  });

  it("J. email casing/whitespace does not cause a false mismatch", () => {
    expect(
      invitationEmailsMatch("  PersonA@Example.com ", "persona@example.com")
    ).toBe(true);
    expect(
      invitationEmailsMatch("persona@example.com", "personb@example.com")
    ).toBe(false);

    const sql = read(
      "supabase/migrations/20260809130000_owner_invite_manager.sql"
    );
    expect(sql).toContain(
      "lower(btrim(v_invite.email)) is distinct from lower(btrim(v_email))"
    );
  });

  it("accept page waits for inbound auth session before accepting", () => {
    const page = read("app/organisation/invitations/accept/page.tsx");
    expect(page).toContain("ensureInvitationAcceptSession");
    expect(page).toContain("buildInvitationAcceptSignInHref");
    expect(page).toContain('action: "accept"');
    expect(page).toContain("token");
  });

  it("organisation workspace auth gate does not wrap invitation accept", () => {
    const layout = read("app/organisation/layout.tsx");
    expect(layout).toContain("ORGANISATION_INVITATION_ACCEPT_PATH");
    expect(layout).toContain("isInvitationAcceptPath");
    expect(layout).toContain("x-pathname");
    // Accept path skips getSessionUser redirect; other org routes still gate.
    expect(layout).toContain("getSessionUser");
    expect(layout).toContain('redirect("/auth/sign-in?next=/organisation")');
  });

  it("inbound auth callback detection prefers invite hash over stale cookies", async () => {
    expect(
      hasInboundAuthCallback({
        search: "?token=invite-token-A",
        hash: "#access_token=abc&refresh_token=def&type=magiclink",
      })
    ).toBe(true);

    expect(
      hasInboundAuthCallback({
        search: "?token=invite-token-A",
        hash: "",
      })
    ).toBe(false);

    const user = { id: "user-a", email: "persona@example.com" };
    const getSession = vi.fn().mockResolvedValue({
      data: { session: { user } },
      error: null,
    });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "stale-owner", email: "owner@example.com" } },
      error: null,
    });
    const onAuthStateChange = vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    }));

    const result = await ensureInvitationAcceptSession(
      { auth: { getSession, getUser, onAuthStateChange } } as never,
      {
        search: "?token=invite-token-A",
        hash: "#access_token=abc&refresh_token=def",
        timeoutMs: 50,
      }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.email).toBe("persona@example.com");
    }
    // Must not fall through to stale cookie user when inbound hash is present.
    expect(getSession).toHaveBeenCalled();
  });

  it("RPC SQL still selects by token_hash and enforces email ownership", () => {
    const sql = read(
      "supabase/migrations/20260809130000_owner_invite_manager.sql"
    );
    expect(sql).toContain("where token_hash = v_token_hash");
    expect(sql).toContain("INVITATION_EMAIL_MISMATCH");
    expect(sql).toContain("status = 'pending'");
    expect(sql).not.toMatch(
      /from public\.organisation_invitations[\s\S]{0,120}order by created_at/
    );
  });
});
