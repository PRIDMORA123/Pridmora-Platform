import {
  IDENTITY_PRODUCTION_ORIGIN,
  PILOT_PRODUCTION_ORIGIN,
  getCanonicalSiteOrigin,
  isNonProductionSiteOrigin,
  resolveDeclaredAuthEnvironment,
  type AuthEnvironmentName,
} from "@/lib/supabase/project-env";

/**
 * Explicit server-side origin for customer-facing invitation emails.
 * Local Pilot NEXT_PUBLIC_SITE_URL (127.0.0.1) must never be used here.
 */
export const CUSTOMER_INVITE_ORIGIN_ENV = "CUSTOMER_INVITE_ORIGIN";

export const CUSTOMER_INVITE_ORIGIN_UNAVAILABLE_MESSAGE =
  "Customer invitations are unavailable because a public invitation URL is not configured.";

export type CustomerInviteOriginResult =
  | { ok: true; origin: string }
  | { ok: false; message: string };

function isRejectedPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]"
  ) {
    return true;
  }
  if (
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan") ||
    host.endsWith(".home")
  ) {
    return true;
  }
  return false;
}

function assertMatchesDeclaredEnvironment(
  origin: string,
  environment: AuthEnvironmentName
): CustomerInviteOriginResult {
  if (environment === "pilot") {
    if (origin === IDENTITY_PRODUCTION_ORIGIN) {
      return { ok: false, message: CUSTOMER_INVITE_ORIGIN_UNAVAILABLE_MESSAGE };
    }
    if (origin !== PILOT_PRODUCTION_ORIGIN) {
      return { ok: false, message: CUSTOMER_INVITE_ORIGIN_UNAVAILABLE_MESSAGE };
    }
    return { ok: true, origin };
  }

  if (environment === "identity") {
    if (origin === PILOT_PRODUCTION_ORIGIN) {
      return { ok: false, message: CUSTOMER_INVITE_ORIGIN_UNAVAILABLE_MESSAGE };
    }
    const expected = getCanonicalSiteOrigin("identity", "production");
    if (expected && origin !== expected) {
      return { ok: false, message: CUSTOMER_INVITE_ORIGIN_UNAVAILABLE_MESSAGE };
    }
    return { ok: true, origin };
  }

  // Unknown environment: accept any valid public HTTPS (not loopback / LAN).
  return { ok: true, origin };
}

/**
 * Public HTTPS application origin only — never loopback, LAN, or preview hosts.
 * When PRIDMORA_ENV / expected ref declares Pilot or Identity, the origin must
 * match that environment's public production host.
 */
export function assertPublicCustomerInviteOrigin(
  raw: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): CustomerInviteOriginResult {
  if (!raw?.trim()) {
    return { ok: false, message: CUSTOMER_INVITE_ORIGIN_UNAVAILABLE_MESSAGE };
  }

  let origin: string;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "https:") {
      return { ok: false, message: CUSTOMER_INVITE_ORIGIN_UNAVAILABLE_MESSAGE };
    }
    if (isRejectedPrivateHostname(parsed.hostname)) {
      return { ok: false, message: CUSTOMER_INVITE_ORIGIN_UNAVAILABLE_MESSAGE };
    }
    origin = `${parsed.protocol}//${parsed.host}`.replace(/\/$/, "");
  } catch {
    return { ok: false, message: CUSTOMER_INVITE_ORIGIN_UNAVAILABLE_MESSAGE };
  }

  if (isNonProductionSiteOrigin(origin)) {
    return { ok: false, message: CUSTOMER_INVITE_ORIGIN_UNAVAILABLE_MESSAGE };
  }

  return assertMatchesDeclaredEnvironment(
    origin,
    resolveDeclaredAuthEnvironment(env)
  );
}

/**
 * Resolve the origin used for inviteUserByEmail / magic-link redirectTo.
 * Prefers CUSTOMER_INVITE_ORIGIN. May use NEXT_PUBLIC_SITE_URL / APP_URL only
 * when those values are already valid public HTTPS origins — never loopback.
 */
export function resolveCustomerInviteOrigin(
  env: NodeJS.ProcessEnv = process.env
): CustomerInviteOriginResult {
  const explicit = env[CUSTOMER_INVITE_ORIGIN_ENV]?.trim();
  if (explicit) {
    return assertPublicCustomerInviteOrigin(explicit, env);
  }

  for (const key of ["NEXT_PUBLIC_SITE_URL", "APP_URL"] as const) {
    const candidate = env[key]?.trim();
    if (!candidate) continue;
    const result = assertPublicCustomerInviteOrigin(candidate, env);
    if (result.ok) return result;
  }

  return { ok: false, message: CUSTOMER_INVITE_ORIGIN_UNAVAILABLE_MESSAGE };
}
