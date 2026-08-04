import {
  ApiRequestError,
  logApiFailure,
  readSafeResponseBody,
} from "@/lib/api-failure";
import { AuthRequiredError, errorMessage, toError } from "@/lib/errors";
import { requireBrowserAuth } from "@/lib/auth/browser";

export type ApiJsonOptions = RequestInit & {
  /** When false, skip the browser-session pre-check (rare). Default true. */
  requireAuth?: boolean;
  /** Stable operation name for structured failure logs. */
  operation?: string;
  relationshipId?: string | null;
  sessionId?: string | null;
};

export type { ApiRequestError };

type ApiErrorPayload = {
  error?: unknown;
  message?: unknown;
  errorCode?: unknown;
  databaseMessage?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
  stage?: unknown;
};

const NETWORK_ERROR_MESSAGE =
  "Unable to reach the server. Please check your connection and try again.";

function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

export function serialiseError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const withExtras = error as ApiRequestError;
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause:
        error.cause === undefined
          ? undefined
          : error.cause instanceof Error
            ? {
                name: error.cause.name,
                message: error.cause.message,
              }
            : typeof Event !== "undefined" && error.cause instanceof Event
              ? `Unexpected browser event (${error.cause.type || "unknown"})`
              : errorMessage(error.cause),
      status: withExtras.status ?? null,
      code: withExtras.code ?? null,
    };
  }

  if (typeof Event !== "undefined" && error instanceof Event) {
    return {
      message: `Unexpected browser event (${error.type || "unknown"})`,
    };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  return {
    message: errorMessage(error),
  };
}

function readErrorCode(body: ApiErrorPayload): string | null {
  if (typeof body.errorCode === "string" && body.errorCode.trim()) {
    return body.errorCode.trim();
  }
  if (typeof body.code === "string" && body.code.trim()) {
    return body.code.trim();
  }
  return null;
}

/** True only for genuine browser/transport connectivity failures. */
export function isNetworkFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const name = error.name.toLowerCase();
  const message = error.message.toLowerCase();
  const causeMessage =
    error.cause instanceof Error ? error.cause.message.toLowerCase() : "";

  if (name === "aborterror") return false;

  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror when attempting to fetch") ||
    message.includes("network request failed") ||
    message.includes("load failed") ||
    message.includes("fetch failed") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    causeMessage.includes("econnrefused") ||
    causeMessage.includes("enotfound") ||
    causeMessage.includes("econnreset") ||
    causeMessage.includes("etimedout") ||
    (name === "typeerror" && message.includes("network"))
  );
}

export function fallbackMessageForHttpStatus(
  status: number,
  statusText = ""
): string {
  if (status >= 500) {
    return "The server encountered an error. Please try again.";
  }
  if (status === 404) {
    return "The requested resource was not found.";
  }
  if (status === 403) {
    return "You do not have permission to perform this action.";
  }
  if (status === 409) {
    return "This action conflicts with the current state. Please refresh and try again.";
  }
  if (status === 400 || status === 422) {
    return "The request could not be processed.";
  }

  const label = statusText.trim();
  return label
    ? `Request failed (${status} ${label}). Please try again.`
    : `Request failed (${status}). Please try again.`;
}

function messageFromPayload(payload: unknown, fallback: string): string {
  if (typeof payload === "string") {
    const text = payload.trim();
    if (!text) return fallback;
    // Never surface HTML error documents as user-facing copy.
    if (/^(<!doctype html|<html[\s>])/i.test(text)) return fallback;
    if (text.length <= 280 && !text.includes("\n")) return text;
    return fallback;
  }

  if (!payload || typeof payload !== "object") return fallback;
  const body = payload as ApiErrorPayload;
  const databaseMessage =
    typeof body.databaseMessage === "string" && body.databaseMessage.trim()
      ? body.databaseMessage.trim()
      : "";
  const apiMessage =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim()
      : "";
  const apiError =
    typeof body.error === "string" && body.error.trim() ? body.error.trim() : "";
  return databaseMessage || apiMessage || apiError || fallback;
}

/**
 * Authenticated JSON fetch for coaching APIs.
 * - Confirms a browser Auth user before calling protected routes
 * - Maps 401 to AuthRequiredError (expected sign-in redirect — not a console Error)
 * - Never rethrows browser Event objects
 * - Logs structured request/response failure details (never sensitive notes)
 * - Uses the network-unreachable message only for genuine connectivity failures
 */
export async function apiJson<T>(input: string, init?: ApiJsonOptions): Promise<T> {
  const {
    requireAuth = true,
    operation,
    relationshipId = null,
    sessionId = null,
    ...requestInit
  } = init ?? {};
  const method = (requestInit.method ?? "GET").toUpperCase();
  const resolvedOperation =
    operation?.trim() || `${method.toLowerCase()}_${input.split("?")[0]}`;

  try {
    if (requireAuth) {
      await requireBrowserAuth();
    }

    const response = await fetch(input, {
      ...requestInit,
      cache: requestInit.cache ?? "no-store",
      credentials: "same-origin",
    });

    if (response.status === 401) {
      throw new AuthRequiredError("Your session has expired. Please sign in again.");
    }

    if (!response.ok) {
      const responseBody = await readSafeResponseBody(response);
      const message = messageFromPayload(
        responseBody,
        fallbackMessageForHttpStatus(response.status, response.statusText)
      );
      const errorCode =
        responseBody && typeof responseBody === "object"
          ? readErrorCode(responseBody as ApiErrorPayload)
          : null;

      logApiFailure({
        operation: resolvedOperation,
        method,
        url: response.url || input,
        status: response.status,
        statusText: response.statusText,
        message,
        responseBody,
        relationshipId,
        sessionId,
        requestId: response.headers.get("x-request-id"),
      });

      throw new ApiRequestError({
        message,
        status: response.status,
        responseBody,
        code: errorCode,
      });
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      if (!text.trim()) return null as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        logApiFailure({
          operation: resolvedOperation,
          method,
          url: response.url || input,
          status: response.status,
          statusText: response.statusText,
          message: "Malformed JSON response.",
          responseBody: text.slice(0, 2000),
          relationshipId,
          sessionId,
          requestId: response.headers.get("x-request-id"),
        });
        throw new ApiRequestError({
          message: "The server returned an unexpected response.",
          status: response.status,
          responseBody: text.slice(0, 2000),
        });
      }
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AuthRequiredError) throw error;
    if (error instanceof ApiRequestError) throw error;

    if (isDevelopment() || isNetworkFetchError(error)) {
      logApiFailure({
        operation: resolvedOperation,
        method,
        url: input,
        errorName: error instanceof Error ? error.name : typeof error,
        message: errorMessage(error),
        relationshipId,
        sessionId,
      });
    }

    if (isNetworkFetchError(error)) {
      throw new ApiRequestError({
        message: NETWORK_ERROR_MESSAGE,
      });
    }

    throw toError(error, errorMessage(error));
  }
}

export { AuthRequiredError, errorMessage, toError, NETWORK_ERROR_MESSAGE };
