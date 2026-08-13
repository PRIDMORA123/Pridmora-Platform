import { sanitizeNextPath } from "@/lib/auth/email-link";
import {
  assertProductionAuthSiteOrigin,
  getCanonicalSiteOrigin,
  isNonProductionSiteOrigin,
  resolveDeclaredAuthEnvironment,
} from "@/lib/supabase/project-env";

export const PASSWORD_RESET_PATH = "/auth/reset-password";

/**
 * Canonical redirectTo for password recovery emails.
 * Points at the password-change page (scanner-safe token_hash landing).
 * The Reset Password email template appends `?token_hash=…&type=recovery`.
 * Legacy PKCE links that still hit `/auth/callback` remain supported separately.
 */
export function buildPasswordRecoveryRedirectTo(siteOrigin: string): string {
  const origin = siteOrigin.trim().replace(/\/$/, "");
  const environment = resolveDeclaredAuthEnvironment();
  const productionCheck = assertProductionAuthSiteOrigin(origin, {
    environment,
  });
  if (!productionCheck.ok) {
    const expected =
      getCanonicalSiteOrigin(environment, "production") ??
      "the canonical production origin for this environment";
    throw new Error(
      productionCheck.message ??
        `Production recovery origin must be ${expected}.`
    );
  }
  return `${origin}${PASSWORD_RESET_PATH}`;
}

/**
 * Resolve browser/server site origin for auth email redirects.
 * Prefers NEXT_PUBLIC_SITE_URL in production so emails do not depend on
 * whichever host happened to serve the forgot-password form.
 *
 * In production, never falls back to localhost / LAN / preview hosts.
 * Pilot → https://pilot.pridmora.com; Identity → https://platform.pridmora.com.
 */
export function resolveAuthSiteOrigin(fallbackOrigin?: string): string {
  const environment = resolveDeclaredAuthEnvironment();
  const canonical = getCanonicalSiteOrigin(environment);
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configured) {
    const origin = configured.replace(/\/$/, "");
    if (process.env.NODE_ENV === "production") {
      if (isNonProductionSiteOrigin(origin)) {
        throw new Error(
          `Production NEXT_PUBLIC_SITE_URL must be ${canonical ?? "the canonical production origin"}, not a local or preview URL.`
        );
      }
      const productionCheck = assertProductionAuthSiteOrigin(origin, {
        environment,
      });
      if (!productionCheck.ok) {
        throw new Error(
          productionCheck.message ??
            `Production NEXT_PUBLIC_SITE_URL must be ${canonical}.`
        );
      }
    }
    return origin;
  }

  if (process.env.NODE_ENV === "production") {
    if (canonical) return canonical;
    throw new Error(
      "Production NEXT_PUBLIC_SITE_URL is missing and auth environment is unknown."
    );
  }

  if (fallbackOrigin?.trim()) return fallbackOrigin.trim().replace(/\/$/, "");
  return "";
}

function isHomePath(path: string): boolean {
  return path === "/" || path.startsWith("/?");
}

/**
 * Post-auth destination for `/auth/callback`.
 * Recovery must reach `/auth/reset-password` even when Supabase strips `next`
 * or only provides `type=recovery`.
 */
export function resolveAuthCallbackNext(input: {
  next: string | null | undefined;
  type: string | null | undefined;
}): string {
  const isRecovery = input.type === "recovery";
  const fallback = isRecovery ? PASSWORD_RESET_PATH : "/";
  const sanitized = sanitizeNextPath(input.next, fallback);

  if (isRecovery && isHomePath(sanitized)) {
    return PASSWORD_RESET_PATH;
  }

  return sanitized;
}
