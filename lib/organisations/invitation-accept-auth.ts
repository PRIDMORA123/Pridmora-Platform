import type { SupabaseClient, User } from "@supabase/supabase-js";
import { buildSafeSignInNext } from "@/lib/auth/email-link";

export const ORGANISATION_INVITATION_ACCEPT_PATH =
  "/organisation/invitations/accept";

/**
 * Relative accept URL for a specific invitation token.
 * Used as invite/magic-link redirectTo and as sign-in `next`.
 */
export function buildOrganisationInviteAcceptNext(token: string): string {
  return `${ORGANISATION_INVITATION_ACCEPT_PATH}?token=${encodeURIComponent(token)}`;
}

export function readInvitationTokenFromSearch(
  searchParams: URLSearchParams | { get(name: string): string | null }
): string {
  return (searchParams.get("token") || "").trim();
}

function parseHashParams(hash: string): URLSearchParams {
  const hashRaw = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(hashRaw);
}

function parseSearchParams(search: string): URLSearchParams {
  return new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
}

/**
 * True when the browser URL carries inbound Supabase auth material that must
 * be consumed before reading any pre-existing cookie session.
 */
export function hasInboundAuthCallback(input: {
  search: string;
  hash: string;
}): boolean {
  const hashParams = parseHashParams(input.hash);
  if (hashParams.get("access_token") || hashParams.get("refresh_token")) {
    return true;
  }

  const search = parseSearchParams(input.search);
  const type = (search.get("type") || "").toLowerCase();
  if (search.get("code")) {
    if (
      !type ||
      type === "invite" ||
      type === "magiclink" ||
      type === "email" ||
      type === "signup"
    ) {
      return true;
    }
  }
  return false;
}

export function buildInvitationAcceptSignInHref(token: string): string {
  const next = buildSafeSignInNext(
    ORGANISATION_INVITATION_ACCEPT_PATH,
    `?token=${encodeURIComponent(token)}`
  );
  return `/auth/sign-in?next=${encodeURIComponent(next)}`;
}

/**
 * Consume invite/magic-link auth from the URL.
 * Never treats an existing cookie getSession() user as success while inbound
 * material is present — that race caused Owner cookies to accept under the
 * wrong identity in production.
 */
async function consumeInboundAuthSession(
  supabase: SupabaseClient,
  input: { search: string; hash: string }
): Promise<User | null> {
  const hashParams = parseHashParams(input.hash);
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error || !data.session?.user) {
      return null;
    }
    return data.session.user;
  }

  const search = parseSearchParams(input.search);
  const code = search.get("code");
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.session?.user) {
      return null;
    }
    return data.session.user;
  }

  // Inbound was detected (e.g. access_token without refresh_token) but cannot
  // be consumed safely — do not fall back to a stale cookie identity.
  return null;
}

/**
 * Ensure the session used for invitation acceptance is the invitee session.
 * When the URL carries inbound auth tokens, consume them explicitly rather
 * than accepting under a stale cookie session (e.g. Platform Owner still signed in).
 */
export async function ensureInvitationAcceptSession(
  supabase: SupabaseClient,
  input: { search: string; hash: string; timeoutMs?: number }
): Promise<{ ok: true; user: User } | { ok: false; reason: "unauthenticated" }> {
  void input.timeoutMs;
  const inbound = hasInboundAuthCallback(input);

  if (inbound) {
    const user = await consumeInboundAuthSession(supabase, input);
    if (!user) {
      return { ok: false, reason: "unauthenticated" };
    }
    return { ok: true, user };
  }

  // Cookie/session is only eligible when there is no inbound auth material.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false, reason: "unauthenticated" };
  }
  return { ok: true, user: data.user };
}

/**
 * Strict ownership helper used by tests and accept pre-checks.
 * Does not weaken server RPC matching — trim + lowercase only.
 */
export function invitationEmailsMatch(
  invitationEmail: string,
  authenticatedEmail: string
): boolean {
  return (
    invitationEmail.trim().toLowerCase() ===
    authenticatedEmail.trim().toLowerCase()
  );
}
