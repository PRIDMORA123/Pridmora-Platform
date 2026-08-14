/**
 * Safe Auth error mapping for browser forms.
 * Logs diagnostic codes in development; never surfaces secrets/tokens.
 */

export type AuthClientErrorKind =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "rate_limited"
  | "recovery_session_unavailable"
  | "reset_link_invalid"
  | "service_unavailable"
  | "network"
  | "auth_rejected"
  | "unknown";

export type MappedAuthClientError = {
  kind: AuthClientErrorKind;
  /** Stable support-facing code — never contains secrets. */
  publicCode: string;
  userMessage: string;
  code: string | null;
  status: number | null;
};

function readAuthErrorFields(error: unknown): {
  message: string;
  code: string | null;
  status: number | null;
  name: string | null;
} {
  if (!error || typeof error !== "object") {
    return { message: "", code: null, status: null, name: null };
  }
  const record = error as {
    message?: unknown;
    code?: unknown;
    status?: unknown;
    name?: unknown;
  };
  return {
    message: typeof record.message === "string" ? record.message : "",
    code: typeof record.code === "string" ? record.code : null,
    status: typeof record.status === "number" ? record.status : null,
    name: typeof record.name === "string" ? record.name : null,
  };
}

function publicCodeFor(kind: AuthClientErrorKind): string {
  switch (kind) {
    case "invalid_credentials":
      return "AUTH_INVALID_CREDENTIALS";
    case "email_not_confirmed":
      return "AUTH_EMAIL_NOT_CONFIRMED";
    case "rate_limited":
      return "AUTH_RATE_LIMITED";
    case "recovery_session_unavailable":
      return "AUTH_RECOVERY_SESSION_UNAVAILABLE";
    case "reset_link_invalid":
      return "AUTH_RESET_LINK_INVALID";
    case "service_unavailable":
      return "AUTH_SERVICE_UNAVAILABLE";
    case "network":
      return "AUTH_NETWORK";
    case "auth_rejected":
      return "AUTH_REJECTED";
    default:
      return "AUTH_UNKNOWN";
  }
}

export function mapAuthClientError(
  error: unknown,
  context:
    | "sign_in"
    | "sign_up"
    | "forgot_password"
    | "reset_password"
    | "verify_recovery"
    | "setup_password"
): MappedAuthClientError {
  const { message, code, status, name } = readAuthErrorFields(error);
  const lower = message.toLowerCase();
  const codeLower = (code ?? "").toLowerCase();

  const wrap = (
    kind: AuthClientErrorKind,
    userMessage: string
  ): MappedAuthClientError => ({
    kind,
    publicCode: publicCodeFor(kind),
    userMessage,
    code,
    status,
  });

  if (
    codeLower.includes("rate_limit") ||
    lower.includes("rate limit") ||
    lower.includes("security purposes") ||
    lower.includes("only request this after") ||
    status === 429
  ) {
    return wrap(
      "rate_limited",
      context === "forgot_password"
        ? "Too many reset requests. Please wait a moment and try again."
        : "Too many attempts. Please wait a moment and try again."
    );
  }

  if (
    lower.includes("email not confirmed") ||
    codeLower === "email_not_confirmed"
  ) {
    return wrap(
      "email_not_confirmed",
      "Please confirm your email address before signing in. Check your inbox for a verification link."
    );
  }

  // Credentials failures only — do NOT treat every HTTP 400 as wrong password.
  if (
    context === "sign_in" &&
    (codeLower === "invalid_credentials" ||
      lower.includes("invalid login") ||
      lower.includes("invalid credentials"))
  ) {
    return wrap(
      "invalid_credentials",
      "Unable to sign in. Check your email and password, then try again."
    );
  }

  if (context === "verify_recovery" || context === "reset_password") {
    if (
      codeLower.includes("expired") ||
      codeLower.includes("invalid") ||
      lower.includes("expired") ||
      lower.includes("invalid") ||
      lower.includes("otp")
    ) {
      return wrap(
        "reset_link_invalid",
        "This reset link has expired or is no longer valid. Request a new password reset email."
      );
    }
    if (lower.includes("session")) {
      return wrap(
        "recovery_session_unavailable",
        "This reset session is no longer available. Request a new password reset email."
      );
    }
  }

  if (status !== null && status >= 500) {
    return wrap(
      "service_unavailable",
      "Authentication is temporarily unavailable. Please try again shortly."
    );
  }

  if (context === "forgot_password") {
    return wrap(
      "unknown",
      "Unable to send a reset link right now. Please try again shortly."
    );
  }

  if (context === "sign_up") {
    if (lower.includes("already")) {
      return wrap(
        "unknown",
        "Unable to create this account. Try signing in, or use a different email address."
      );
    }
    return wrap(
      "unknown",
      "Unable to create your account. Please check your details and try again."
    );
  }

  if (context === "sign_in" && status !== null && status >= 400 && status < 500) {
    return wrap(
      "auth_rejected",
      "Unable to complete sign-in right now. Please try again shortly."
    );
  }

  void name;

  return wrap(
    "unknown",
    context === "reset_password" || context === "setup_password"
      ? "Unable to update your password. Please try again."
      : "Unable to sign in right now. Please try again shortly."
  );
}

/**
 * Development / server diagnostics only. Never includes email, password, or tokens.
 */
export function logAuthClientDiagnostic(
  context: string,
  mapped: MappedAuthClientError,
  error?: unknown
): void {
  if (process.env.NODE_ENV === "production") return;
  const fields = readAuthErrorFields(error);
  console.info(
    JSON.stringify({
      source: "auth_client",
      context,
      kind: mapped.kind,
      publicCode: mapped.publicCode,
      code: mapped.code ?? fields.code,
      status: mapped.status ?? fields.status,
      name: fields.name,
      // Safe truncated provider message for local diagnosis only.
      messagePreview: fields.message
        ? fields.message.slice(0, 160)
        : null,
    })
  );
}
