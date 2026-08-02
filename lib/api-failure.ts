export type ApiFailureDetails = {
  operation: string;
  method?: string;
  url?: string;
  status?: number;
  statusText?: string;
  errorName?: string;
  message?: string;
  responseBody?: unknown;
  requestId?: string | null;
  relationshipId?: string | null;
  sessionId?: string | null;
};

/**
 * Structured API failure logging for diagnosis.
 * Never pass session notes, private notes, tokens, or confidential evidence.
 */
export function logApiFailure(details: ApiFailureDetails): void {
  console.error("[API] Request failed", {
    operation: details.operation,
    method: details.method,
    url: details.url,
    status: details.status,
    statusText: details.statusText,
    errorName: details.errorName,
    message: details.message,
    responseBody: sanitiseLoggedBody(details.responseBody),
    requestId: details.requestId ?? null,
    relationshipId: details.relationshipId ?? null,
    sessionId: details.sessionId ?? null,
  });
}

/** Read a failed response body once, without throwing. */
export async function readSafeResponseBody(
  response: Response
): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      return await response.json();
    }

    const text = await response.text();
    return text.slice(0, 2000);
  } catch {
    return null;
  }
}

const SENSITIVE_BODY_KEYS = new Set([
  "notes",
  "privateNotes",
  "private_notes",
  "prepPrivateNotes",
  "prep_private_notes",
  "reflectPrivate",
  "reflect_private",
  "reflection",
  "password",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "cookie",
  "cookies",
]);

function sanitiseLoggedBody(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "string") {
    return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(item => sanitiseLoggedBody(item));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_BODY_KEYS.has(key)) {
        result[key] = "[redacted]";
        continue;
      }
      result[key] = sanitiseLoggedBody(entry);
    }
    return result;
  }
  return value;
}

export class ApiRequestError extends Error {
  status?: number;
  responseBody?: unknown;
  code?: string | null;

  constructor(input: {
    message: string;
    status?: number;
    responseBody?: unknown;
    code?: string | null;
  }) {
    super(input.message);
    this.name = "ApiRequestError";
    this.status = input.status;
    this.responseBody = input.responseBody;
    this.code = input.code ?? null;
  }
}
