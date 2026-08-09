import type { EmailOtpType } from "@supabase/supabase-js";
import {
  isAllowedEmailOtpType,
  categorizeAuthError,
  logAuthRouteEvent,
  userFacingAuthErrorMessage,
} from "@/lib/auth/email-link";
import { resolveAuthCallbackNext } from "@/lib/auth/recovery";
import {
  authErrorRedirect,
  authSuccessRedirect,
  createAuthRouteClient,
} from "@/lib/auth/route-client";

export const runtime = "nodejs";

/**
 * Token-hash email confirmation / recovery.
 * Used by password-reset emails so recovery works across browsers
 * without a PKCE code-verifier cookie.
 *
 * Example:
 *   /auth/confirm?token_hash=...&type=recovery&next=/auth/reset-password
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const typeParam = requestUrl.searchParams.get("type");
  // Must match callback: recovery + next=/ (or missing next) must not land on marketing `/`.
  // Invite User templates may pass redirect_to={{ .RedirectTo }} (Supabase SSR docs).
  const next = resolveAuthCallbackNext({
    next:
      requestUrl.searchParams.get("next") ??
      requestUrl.searchParams.get("redirect_to"),
    type: typeParam,
  });

  if (!tokenHash) {
    logAuthRouteEvent("confirm", {
      outcome: "failure",
      category: "missing_token_hash",
    });
    return authErrorRedirect(
      requestUrl.origin,
      userFacingAuthErrorMessage("missing_token_hash")
    );
  }

  if (!isAllowedEmailOtpType(typeParam)) {
    logAuthRouteEvent("confirm", {
      outcome: "failure",
      category: "disallowed_type",
    });
    return authErrorRedirect(
      requestUrl.origin,
      userFacingAuthErrorMessage("disallowed_type")
    );
  }

  const { supabase, configured, applyCookies } = createAuthRouteClient(request);

  if (!configured) {
    logAuthRouteEvent("confirm", {
      outcome: "failure",
      category: "not_configured",
    });
    return authErrorRedirect(
      requestUrl.origin,
      userFacingAuthErrorMessage("not_configured")
    );
  }

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: typeParam as EmailOtpType,
  });

  if (error) {
    const category = categorizeAuthError(error);
    logAuthRouteEvent("confirm", {
      outcome: "failure",
      errorName: error.name,
      errorCode: error.code ?? null,
      category: category === "unknown" ? "otp_verification_failed" : category,
    });
    return authErrorRedirect(
      requestUrl.origin,
      userFacingAuthErrorMessage(
        category === "unknown" ? "otp_verification_failed" : category
      ),
      applyCookies
    );
  }

  logAuthRouteEvent("confirm", {
    outcome: "success",
    category: "ok",
  });
  return authSuccessRedirect(requestUrl.origin, next, applyCookies);
}
