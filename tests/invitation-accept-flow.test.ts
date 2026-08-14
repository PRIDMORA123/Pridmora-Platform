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

const ownerUser = { id: "owner-1", email: "owner@example.com" };
const inviteeUser = { id: "invitee-1", email: "barrypridmore@aol.com" };

function mockAuthClient(overrides: {
  getSession?: ReturnType<typeof vi.fn>;
  getUser?: ReturnType<typeof vi.fn>;
  setSession?: ReturnType<typeof vi.fn>;
  exchangeCodeForSession?: ReturnType<typeof vi.fn>;
}) {
  const getSession =
    overrides.getSession ??
    vi.fn().mockResolvedValue({
      data: { session: { user: ownerUser } },
      error: null,
    });
  const getUser =
    overrides.getUser ??
    vi.fn().mockResolvedValue({
      data: { user: ownerUser },
      error: null,
    });
  const setSession =
    overrides.setSession ??
    vi.fn().mockResolvedValue({
      data: { session: { user: inviteeUser } },
      error: null,
    });
  const exchangeCodeForSession =
    overrides.exchangeCodeForSession ??
    vi.fn().mockResolvedValue({
      data: { session: { user: inviteeUser } },
      error: null,
    });

  return {
    auth: {
      getSession,
      getUser,
      setSession,
      exchangeCodeForSession,
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  };
}

describe("Organisation invitation accept — inbound session consumption", () => {
  it("A. Owner cookie + invite hash: invitee wins; Owner getSession must not complete helper", async () => {
    const getSession = vi.fn().mockResolvedValue({
      data: { session: { user: ownerUser } },
      error: null,
    });
    const setSession = vi.fn().mockResolvedValue({
      data: { session: { user: inviteeUser } },
      error: null,
    });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: ownerUser },
      error: null,
    });

    const result = await ensureInvitationAcceptSession(
      mockAuthClient({ getSession, setSession, getUser }) as never,
      {
        search: "?token=invite-token-A",
        hash: "#access_token=invitee-access&refresh_token=invitee-refresh&type=invite",
      }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.email).toBe("barrypridmore@aol.com");
      expect(result.user.id).toBe("invitee-1");
    }
    expect(setSession).toHaveBeenCalledWith({
      access_token: "invitee-access",
      refresh_token: "invitee-refresh",
    });
    // Must not short-circuit on the stale Owner cookie session.
    expect(getSession).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("B. Owner cookie + PKCE code: code exchange returns invitee; invitee wins", async () => {
    const getSession = vi.fn().mockResolvedValue({
      data: { session: { user: ownerUser } },
      error: null,
    });
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { session: { user: inviteeUser } },
      error: null,
    });
    const setSession = vi.fn();
    const getUser = vi.fn().mockResolvedValue({
      data: { user: ownerUser },
      error: null,
    });

    const result = await ensureInvitationAcceptSession(
      mockAuthClient({
        getSession,
        exchangeCodeForSession,
        setSession,
        getUser,
      }) as never,
      {
        search: "?token=invite-token-A&code=pkce-invitee-code&type=invite",
        hash: "",
      }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.email).toBe("barrypridmore@aol.com");
    }
    expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce-invitee-code");
    expect(setSession).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("C. Logged-out + invite hash -> invitee session established", async () => {
    const getSession = vi.fn().mockResolvedValue({
      data: { session: null },
      error: null,
    });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: null,
    });
    const setSession = vi.fn().mockResolvedValue({
      data: { session: { user: inviteeUser } },
      error: null,
    });

    const result = await ensureInvitationAcceptSession(
      mockAuthClient({ getSession, getUser, setSession }) as never,
      {
        search: "?token=invite-token-A",
        hash: "#access_token=a&refresh_token=r&type=magiclink",
      }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.email).toBe("barrypridmore@aol.com");
    }
    expect(setSession).toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("D. Logged-out + PKCE code -> invitee session established", async () => {
    const getSession = vi.fn().mockResolvedValue({
      data: { session: null },
      error: null,
    });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: null,
    });
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { session: { user: inviteeUser } },
      error: null,
    });

    const result = await ensureInvitationAcceptSession(
      mockAuthClient({ getSession, getUser, exchangeCodeForSession }) as never,
      {
        search: "?token=invite-token-A&code=pkce-code&type=magiclink",
        hash: "",
      }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe("invitee-1");
    }
    expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("E. Existing cookie with NO inbound auth -> existing session may be used", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: inviteeUser },
      error: null,
    });
    const setSession = vi.fn();
    const exchangeCodeForSession = vi.fn();
    const getSession = vi.fn();

    const result = await ensureInvitationAcceptSession(
      mockAuthClient({
        getUser,
        setSession,
        exchangeCodeForSession,
        getSession,
      }) as never,
      {
        search: "?token=invite-token-A",
        hash: "",
      }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.email).toBe("barrypridmore@aol.com");
    }
    expect(getUser).toHaveBeenCalled();
    expect(setSession).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("F. Invalid inbound auth -> do not silently fall back to stale cookie identity", async () => {
    const getSession = vi.fn().mockResolvedValue({
      data: { session: { user: ownerUser } },
      error: null,
    });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: ownerUser },
      error: null,
    });
    const setSession = vi.fn().mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid JWT" },
    });

    const result = await ensureInvitationAcceptSession(
      mockAuthClient({ getSession, getUser, setSession }) as never,
      {
        search: "?token=invite-token-A",
        hash: "#access_token=bad&refresh_token=bad&type=invite",
      }
    );

    expect(result).toEqual({ ok: false, reason: "unauthenticated" });
    expect(setSession).toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("G. Wrong authenticated user without inbound auth remains rejected by RPC", async () => {
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
    ).rejects.toMatchObject({
      name: "InvitationAcceptError",
      code: "INVITATION_EMAIL_MISMATCH",
    });
  });

  it("H. Token/email ownership enforcement unchanged (token_hash + email match)", () => {
    const sql = read(
      "supabase/migrations/20260809130000_owner_invite_manager.sql"
    );
    expect(sql).toContain("where token_hash = v_token_hash");
    expect(sql).toContain("INVITATION_EMAIL_MISMATCH");
    expect(sql).toContain(
      "lower(btrim(v_invite.email)) is distinct from lower(btrim(v_email))"
    );
    expect(sql).toContain("status = 'pending'");
    expect(sql).not.toMatch(
      /from public\.organisation_invitations[\s\S]{0,120}order by created_at/
    );

    const helper = read("lib/organisations/invitation-accept-auth.ts");
    expect(helper).toContain("setSession");
    expect(helper).toContain("exchangeCodeForSession");
    expect(helper).not.toMatch(
      /inbound[\s\S]{0,400}getSession\(\)\.then/
    );
  });

  it("I. Two invitations cannot cross-accept (distinct tokens + URLs)", () => {
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
  });

  it("J. Failed mismatch leaves invitation pending/usable (RPC does not mutate on mismatch)", () => {
    const sql = read(
      "supabase/migrations/20260809130000_owner_invite_manager.sql"
    );
    // Email mismatch returns before status update / membership insert.
    const mismatchIdx = sql.indexOf("INVITATION_EMAIL_MISMATCH");
    const acceptUpdateIdx = sql.indexOf(
      "update public.organisation_invitations\n  set\n    status = 'accepted'"
    );
    expect(mismatchIdx).toBeGreaterThan(-1);
    expect(acceptUpdateIdx).toBeGreaterThan(mismatchIdx);

    // Client accept path redirects to sign-in on unauthenticated (preserves token).
    const page = read("app/organisation/invitations/accept/page.tsx");
    expect(page).toContain("buildInvitationAcceptSignInHref");
    expect(page).toContain("ensureInvitationAcceptSession");
  });
});

describe("Organisation invitation accept flow — identity preservation", () => {
  it("correct invitation token is looked up by hash only (not by org/email list)", async () => {
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

  it("revoked invitation cannot be accepted", async () => {
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

  it("expired invitation cannot be accepted", async () => {
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

  it("authentication redirect preserves the original invitation token", () => {
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

  it("matching authenticated user can accept (RPC success path)", async () => {
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

  it("email casing/whitespace does not cause a false mismatch", () => {
    expect(
      invitationEmailsMatch("  PersonA@Example.com ", "persona@example.com")
    ).toBe(true);
    expect(
      invitationEmailsMatch("persona@example.com", "personb@example.com")
    ).toBe(false);
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
    expect(layout).toContain("getSessionUser");
    expect(layout).toContain('redirect("/auth/sign-in?next=/organisation")');
  });

  it("hasInboundAuthCallback detects hash and invite PKCE code", () => {
    expect(
      hasInboundAuthCallback({
        search: "?token=invite-token-A",
        hash: "#access_token=abc&refresh_token=def&type=magiclink",
      })
    ).toBe(true);
    expect(
      hasInboundAuthCallback({
        search: "?token=invite-token-A&code=abc&type=invite",
        hash: "",
      })
    ).toBe(true);
    expect(
      hasInboundAuthCallback({
        search: "?token=invite-token-A",
        hash: "",
      })
    ).toBe(false);
  });

  it("failed PKCE exchange does not fall back to Owner cookie", async () => {
    const getSession = vi.fn().mockResolvedValue({
      data: { session: { user: ownerUser } },
      error: null,
    });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: ownerUser },
      error: null,
    });
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { session: null },
      error: { message: "invalid code" },
    });

    const result = await ensureInvitationAcceptSession(
      mockAuthClient({ getSession, getUser, exchangeCodeForSession }) as never,
      {
        search: "?token=t&code=bad&type=invite",
        hash: "",
      }
    );

    expect(result).toEqual({ ok: false, reason: "unauthenticated" });
    expect(getSession).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });
});
