import {
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

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const type = requestUrl.searchParams.get("type");
  const next = resolveAuthCallbackNext({
    next: requestUrl.searchParams.get("next"),
    type,
  });
  const errorDescription = requestUrl.searchParams.get("error_description");
  const errorCode = requestUrl.searchParams.get("error");

  if (errorCode || errorDescription) {
    logAuthRouteEvent("callback", {
      outcome: "failure",
      errorName: errorCode,
      errorCode: errorCode,
      category: "provider_error",
    });
    return authErrorRedirect(
      requestUrl.origin,
      userFacingAuthErrorMessage("provider_error")
    );
  }

  if (!code) {
    logAuthRouteEvent("callback", {
      outcome: "failure",
      category: "missing_code",
    });
    return authErrorRedirect(
      requestUrl.origin,
      userFacingAuthErrorMessage("missing_code")
    );
  }

  const { supabase, configured, applyCookies } = createAuthRouteClient(request);

  if (!configured) {
    logAuthRouteEvent("callback", {
      outcome: "failure",
      category: "not_configured",
    });
    return authErrorRedirect(
      requestUrl.origin,
      userFacingAuthErrorMessage("not_configured")
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const category = categorizeAuthError(error);
    logAuthRouteEvent("callback", {
      outcome: "failure",
      errorName: error.name,
      errorCode: error.code ?? null,
      category: category === "unknown" ? "exchange_failed" : category,
    });
    return authErrorRedirect(
      requestUrl.origin,
      userFacingAuthErrorMessage(
        category === "unknown" ? "exchange_failed" : category
      ),
      applyCookies
    );
  }

  logAuthRouteEvent("callback", {
    outcome: "success",
    category: "ok",
  });
  return authSuccessRedirect(requestUrl.origin, next, applyCookies);
}
