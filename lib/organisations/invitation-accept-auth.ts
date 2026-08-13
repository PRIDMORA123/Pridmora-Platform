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

/**
 * True when the browser URL carries inbound Supabase auth material that must
 * be consumed before reading any pre-existing cookie session.
 */
export function hasInboundAuthCallback(input: {
  search: string;
  hash: string;
}): boolean {
  const hashRaw = input.hash.startsWith("#") ? input.hash.slice(1) : input.hash;
  const hashParams = new URLSearchParams(hashRaw);
  if (hashParams.get("access_token") || hashParams.get("refresh_token")) {
    return true;
  }

  const search = new URLSearchParams(
    input.search.startsWith("?") ? input.search.slice(1) : input.search
  );
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
 * Ensure the session used for invitation acceptance is the invitee session.
 * When the URL carries inbound auth tokens, wait for that session rather than
 * accepting under a stale cookie session (e.g. Platform Owner still signed in).
 */
export async function ensureInvitationAcceptSession(
  supabase: SupabaseClient,
  input: { search: string; hash: string; timeoutMs?: number }
): Promise<{ ok: true; user: User } | { ok: false; reason: "unauthenticated" }> {
  const timeoutMs = input.timeoutMs ?? 10_000;
  const inbound = hasInboundAuthCallback(input);

  if (!inbound) {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return { ok: false, reason: "unauthenticated" };
    }
    return { ok: true, user: data.user };
  }

  const user = await new Promise<User | null>(resolve => {
    let settled = false;
    const finish = (value: User | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timer = setTimeout(() => {
      void supabase.auth.getUser().then(({ data }) => {
        finish(data.user ?? null);
      });
    }, timeoutMs);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        session?.user &&
        (event === "SIGNED_IN" ||
          event === "INITIAL_SESSION" ||
          event === "TOKEN_REFRESHED")
      ) {
        clearTimeout(timer);
        subscription.unsubscribe();
        finish(session.user);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        clearTimeout(timer);
        subscription.unsubscribe();
        finish(data.session.user);
      }
    });
  });

  if (!user) {
    return { ok: false, reason: "unauthenticated" };
  }
  return { ok: true, user };
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
