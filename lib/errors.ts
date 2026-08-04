/**
 * Normalize unknown thrown values into real Error instances.
 * Prevents React console noise like "[object Event]".
 */
export function toError(value: unknown, fallback = "Something went wrong. Please try again."): Error {
  if (value instanceof Error) {
    const message = value.message.trim();
    if (!message || /^\[object [\w]*Event\]$/.test(message)) {
      return new Error(fallback);
    }
    return value;
  }

  // Never rethrow or surface browser Event objects (React shows "[object Event]").
  if (typeof Event !== "undefined" && value instanceof Event) {
    return new Error(fallback);
  }

  if (typeof value === "string" && value.trim()) {
    const message = value.trim();
    if (/^\[object [\w]*Event\]$/.test(message)) {
      return new Error(fallback);
    }
    return new Error(message);
  }

  if (value && typeof value === "object" && "message" in value) {
    // React SyntheticEvent / DOM Event-like objects can own incidental fields;
    // never treat them as application errors.
    if ("nativeEvent" in value || "currentTarget" in value || "target" in value) {
      if ("preventDefault" in value || "stopPropagation" in value) {
        return new Error(fallback);
      }
    }
    const message = String((value as { message: unknown }).message || "").trim();
    if (message && !/^\[object [\w]*Event\]$/.test(message)) {
      return new Error(message);
    }
  }

  return new Error(fallback);
}

export function errorMessage(
  value: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  return toError(value, fallback).message;
}

/**
 * Expected when the coach must sign in again. Treat as a redirect signal,
 * not an unexpected console failure.
 */
export class AuthRequiredError extends Error {
  constructor(message = "Authentication required. Please sign in.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

/**
 * Prefer this over `throw event` or rethrowing unknown catch values.
 */
export function rethrowAsError(
  value: unknown,
  fallback = "Something went wrong. Please try again."
): never {
  throw toError(value, fallback);
}
