import type { EmailOtpType } from "@supabase/supabase-js";

/** Email OTP types accepted by `/auth/confirm`. */
export const ALLOWED_EMAIL_OTP_TYPES = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const satisfies readonly EmailOtpType[];

export type AllowedEmailOtpType = (typeof ALLOWED_EMAIL_OTP_TYPES)[number];

export type AuthErrorCategory =
  | "ok"
  | "pkce_verifier_missing"
  | "expired_or_invalid"
  | "missing_code"
  | "missing_token_hash"
  | "disallowed_type"
  | "not_configured"
  | "otp_verification_failed"
  | "exchange_failed"
  | "provider_error"
  | "unknown";

export type AuthRouteName = "callback" | "confirm";

const PROTOCOL_OR_SCHEME = /:|\\|\/\//;

/**
 * Restrict post-auth redirects to same-origin relative paths.
 * Rejects protocol-relative URLs, schemes, and other open-redirect vectors.
 */
export function sanitizeNextPath(
  raw: string | null | undefined,
  fallback = "/"
): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//")) return fallback;
  if (PROTOCOL_OR_SCHEME.test(trimmed.slice(1))) return fallback;
  if (/[\r\n\0]/.test(trimmed)) return fallback;
  return trimmed;
}

export function isAllowedEmailOtpType(value: string | null | undefined): value is AllowedEmailOtpType {
  return (
    typeof value === "string" &&
    (ALLOWED_EMAIL_OTP_TYPES as readonly string[]).includes(value)
  );
}

export function categorizeAuthError(
  error: { name?: string; message?: string; code?: string | null } | null | undefined
): AuthErrorCategory {
  if (!error) return "unknown";

  const code = String(error.code ?? "").toLowerCase();
  const name = String(error.name ?? "").toLowerCase();
  const message = String(error.message ?? "").toLowerCase();

  if (
    code === "pkce_code_verifier_not_found" ||
    name.includes("pkcecodeverifier") ||
    message.includes("code verifier")
  ) {
    return "pkce_verifier_missing";
  }

  if (
    /otp_expired|expired|invalid/.test(code) ||
    /expired|invalid|otp/.test(message)
  ) {
    return "expired_or_invalid";
  }

  return "unknown";
}

export function userFacingAuthErrorMessage(category: AuthErrorCategory): string {
  switch (category) {
    case "expired_or_invalid":
      return "This link has expired or is no longer valid. Please request a new one.";
    case "missing_code":
      return "Missing authentication code. Request a new email link.";
    case "missing_token_hash":
      return "This reset link is incomplete. Request a new password reset email.";
    case "disallowed_type":
      return "This authentication link is not valid for this action.";
    case "not_configured":
      return "Supabase is not configured.";
    case "pkce_verifier_missing":
      return "Unable to complete authentication. Please try again.";
    case "provider_error":
      return "Email confirmation or password reset failed.";
    default:
      return "Unable to complete authentication. Please try again.";
  }
}

/**
 * Structured auth-route logging. Never includes codes, tokens, cookies, emails, or secrets.
 */
export function logAuthRouteEvent(
  route: AuthRouteName,
  details: {
    outcome: "success" | "failure";
    errorName?: string | null;
    errorCode?: string | null;
    category: AuthErrorCategory;
  }
): void {
  console.info(
    JSON.stringify({
      source: "auth_route",
      route,
      outcome: details.outcome,
      errorName: details.errorName ?? null,
      errorCode: details.errorCode ?? null,
      category: details.category,
    })
  );
}
