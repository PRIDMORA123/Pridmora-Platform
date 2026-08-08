import { sanitizeNextPath } from "@/lib/auth/email-link";

export const PASSWORD_RESET_PATH = "/auth/reset-password";

/**
 * Canonical redirectTo for password recovery emails.
 * Lands on the PKCE callback with an explicit next path so recovery never
 * falls through to the marketing homepage (`/`).
 */
export function buildPasswordRecoveryRedirectTo(siteOrigin: string): string {
  const origin = siteOrigin.trim().replace(/\/$/, "");
  return `${origin}/auth/callback?next=${encodeURIComponent(PASSWORD_RESET_PATH)}`;
}

/**
 * Resolve browser/server site origin for auth email redirects.
 * Prefers NEXT_PUBLIC_SITE_URL in production so emails do not depend on
 * whichever host happened to serve the forgot-password form.
 */
export function resolveAuthSiteOrigin(fallbackOrigin?: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
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
