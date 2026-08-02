export class SupabaseUnavailableError extends Error {
  constructor(message = "Unable to reach Supabase. Please check your connection and try again.") {
    super(message);
    this.name = "SupabaseUnavailableError";
  }
}

/** Preserves the full PostgREST / Postgres error surface for debugging. */
export class SupabaseDbError extends Error {
  readonly code: string;
  readonly details: string;
  readonly hint: string;
  readonly status: number | null;
  readonly operation: string;

  constructor(input: {
    message: string;
    code?: string | null;
    details?: string | null;
    hint?: string | null;
    status?: number | null;
    operation?: string;
  }) {
    super(input.message);
    this.name = "SupabaseDbError";
    this.code = input.code ?? "";
    this.details = input.details ?? "";
    this.hint = input.hint ?? "";
    this.status = input.status ?? null;
    this.operation = input.operation ?? "";
  }
}

export type SupabaseErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

export function isSupabaseErrorLike(value: unknown): value is SupabaseErrorLike {
  return Boolean(value && typeof value === "object" && "message" in value);
}

export function toSupabaseDbError(
  error: unknown,
  options?: { status?: number | null; operation?: string }
): SupabaseDbError {
  if (error instanceof SupabaseDbError) {
    return error;
  }

  if (isSupabaseErrorLike(error)) {
    return new SupabaseDbError({
      message: String(error.message || "Supabase request failed."),
      code: error.code,
      details: error.details,
      hint: error.hint,
      status: options?.status ?? null,
      operation: options?.operation,
    });
  }

  if (error instanceof Error) {
    return new SupabaseDbError({
      message: error.message,
      status: options?.status ?? null,
      operation: options?.operation,
    });
  }

  return new SupabaseDbError({
    message: "Supabase request failed.",
    status: options?.status ?? null,
    operation: options?.operation,
  });
}

/** Log the complete Supabase error shape (status, code, message, details, hint). */
export function logSupabaseError(context: string, error: unknown, status?: number | null): void {
  const dbError = toSupabaseDbError(error, { status });
  console.error(`[Supabase] ${context}`, {
    status: dbError.status,
    code: dbError.code,
    message: dbError.message,
    details: dbError.details,
    hint: dbError.hint,
    operation: dbError.operation || undefined,
  });
}

function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * Build a JSON API error body.
 * In development, always include the original database message and fields.
 */
export function toSupabaseApiErrorBody(error: unknown): {
  error: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number | null;
  databaseMessage?: string;
} {
  const dbError = toSupabaseDbError(error);
  const userMessage = toUserFriendlySupabaseError(error);

  if (isDevelopment()) {
    return {
      error: dbError.message || userMessage,
      databaseMessage: dbError.message,
      code: dbError.code || undefined,
      details: dbError.details || undefined,
      hint: dbError.hint || undefined,
      status: dbError.status,
    };
  }

  return { error: userMessage };
}

export function supabaseErrorResponse(error: unknown, fallbackStatus = 503): Response {
  const dbError = toSupabaseDbError(error);
  logSupabaseError("API error response", dbError);
  const status =
    dbError.status && dbError.status >= 400 && dbError.status < 600
      ? dbError.status
      : fallbackStatus;
  return Response.json(toSupabaseApiErrorBody(dbError), { status });
}

export function toUserFriendlySupabaseError(error: unknown): string {
  if (error instanceof SupabaseDbError) {
    // Never hide the database message — it is the actionable signal.
    return error.message;
  }

  if (error instanceof SupabaseUnavailableError) {
    return error.message;
  }

  if (typeof Event !== "undefined" && error instanceof Event) {
    return "Something went wrong while saving or loading data. Please try again.";
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    const lower = message.toLowerCase();

    if (
      lower.includes("not configured") ||
      lower.includes("supabase url") ||
      lower.includes("anon key") ||
      lower.includes("service role")
    ) {
      return "Supabase is not configured. Add your project URL and keys to the environment, then try again.";
    }

    if (
      lower.includes("fetch failed") ||
      lower.includes("failed to fetch") ||
      lower.includes("networkerror") ||
      lower.includes("econnrefused") ||
      lower.includes("enotfound")
    ) {
      return "Unable to reach Supabase. Please check your connection and try again.";
    }

    if (lower.includes("authentication required") || lower.includes("session has expired")) {
      return message;
    }

    // Preserve PostgREST / Postgres / schema-cache messages instead of swallowing them.
    if (
      message &&
      (lower.includes("schema cache") ||
        lower.includes("could not find") ||
        lower.includes("does not exist") ||
        lower.includes("duplicate key") ||
        lower.includes("violates") ||
        lower.includes("permission denied") ||
        lower.includes("row-level security") ||
        lower.includes("pgrst") ||
        Boolean(error.name && error.name !== "Error"))
    ) {
      return message;
    }

    if (message) {
      return message;
    }
  }

  if (isSupabaseErrorLike(error) && error.message) {
    return String(error.message);
  }

  return "Something went wrong while saving or loading data. Please try again.";
}
