/**
 * Safe, non-sensitive OpenAI / provider error metadata for production diagnostics.
 * Never include prompts, keys, person identifiers, or request bodies.
 */

export type SafeOpenAiErrorMetadata = {
  status: number | null;
  code: string | null;
  type: string | null;
  /** Short provider message only when it passes a conservative safety filter. */
  message: string | null;
};

const MAX_SAFE_MESSAGE_LENGTH = 160;

const UNSAFE_MESSAGE_PATTERN =
  /sk-[a-z0-9]|api[_-]?key|authorization|bearer\s|cookie|set-cookie|person context|coaching purpose|instructions:|\"topicsToExplore\"|relationshipId|conversationId|clientId|sessionId|prep_private|private notes|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readStatus(error: Record<string, unknown>): number | null {
  const status = error.status;
  if (typeof status === "number" && Number.isFinite(status)) return status;
  return null;
}

function readNestedError(error: Record<string, unknown>): Record<string, unknown> | null {
  return asRecord(error.error);
}

/**
 * Allow short, generic provider messages (auth, quota, model access).
 * Drop anything that could contain prompt / identity / secret material.
 */
export function sanitiseProviderErrorMessage(raw: unknown): string | null {
  const message = readString(raw);
  if (!message) return null;
  if (message.length > MAX_SAFE_MESSAGE_LENGTH) return null;
  if (UNSAFE_MESSAGE_PATTERN.test(message)) return null;
  // Reject multi-line / JSON-looking payloads.
  if (message.includes("\n") || message.includes("{") || message.includes("}")) {
    return null;
  }
  return message;
}

export function extractSafeOpenAiErrorMetadata(
  error: unknown
): SafeOpenAiErrorMetadata {
  const record = asRecord(error);
  if (!record) {
    return { status: null, code: null, type: null, message: null };
  }

  const nested = readNestedError(record);
  const status = readStatus(record);
  const code =
    readString(record.code) ??
    (nested ? readString(nested.code) : null);
  const type =
    readString(record.type) ??
    (nested ? readString(nested.type) : null);
  const message = sanitiseProviderErrorMessage(
    readString(record.message) ?? (nested ? nested.message : null)
  );

  return { status, code, type, message };
}

/** True when the error looks like an OpenAI SDK / HTTP provider failure. */
export function isOpenAiProviderError(error: unknown): boolean {
  const meta = extractSafeOpenAiErrorMetadata(error);
  if (meta.status !== null || meta.code !== null || meta.type !== null) {
    return true;
  }
  if (!error || typeof error !== "object") return false;
  const name = readString((error as { name?: unknown }).name)?.toLowerCase() ?? "";
  return (
    name.includes("apierror") ||
    name.includes("authenticationerror") ||
    name.includes("permissiondenied") ||
    name.includes("ratelimit") ||
    name.includes("apiconnection") ||
    name.includes("internalservererror") ||
    name.includes("notfounderror")
  );
}

export function isPreparationRelationshipAccessError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.trim();
  return (
    message === "RELATIONSHIP_NOT_FOUND" ||
    error.name === "OwnershipError" ||
    /relationship not found/i.test(message)
  );
}
