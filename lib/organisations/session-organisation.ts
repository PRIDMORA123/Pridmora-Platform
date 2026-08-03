/**
 * Secure organisation ownership for coaching sessions.
 * Organisation IDs must come from stored relationship data — never the browser.
 */

export const RELATIONSHIP_ORGANISATION_MISSING =
  "RELATIONSHIP_ORGANISATION_MISSING" as const;

export const CREATE_CONVERSATION_USER_ERROR =
  "We couldn’t create this conversation. Please try again.";

export class RelationshipOrganisationMissingError extends Error {
  readonly code = RELATIONSHIP_ORGANISATION_MISSING;

  constructor(
    message = "This relationship is missing organisation ownership and cannot create a conversation."
  ) {
    super(message);
    this.name = "RelationshipOrganisationMissingError";
  }
}

/** Derive session organisation_id from the stored client row only. */
export function resolveSessionOrganisationId(
  clientOrganisationId: string | null | undefined
): string {
  const organisationId =
    typeof clientOrganisationId === "string" ? clientOrganisationId.trim() : "";
  if (!organisationId) {
    throw new RelationshipOrganisationMissingError();
  }
  return organisationId;
}

/** True when an error message looks like a raw Postgres / PostgREST constraint leak. */
export function isRawDatabaseConstraintMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("violates not-null") ||
    lower.includes("null value in column") ||
    lower.includes("violates foreign key") ||
    lower.includes("duplicate key") ||
    lower.includes("row-level security") ||
    lower.includes("schema cache") ||
    /pgrst\d+/i.test(message) ||
    (lower.includes("organisation_id") && lower.includes("null"))
  );
}

/**
 * User-facing create-conversation failure copy.
 * Never surfaces raw database constraint text.
 */
export function safeCreateConversationErrorMessage(error: unknown): string {
  if (error instanceof RelationshipOrganisationMissingError) {
    return CREATE_CONVERSATION_USER_ERROR;
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === RELATIONSHIP_ORGANISATION_MISSING
  ) {
    return CREATE_CONVERSATION_USER_ERROR;
  }

  const message =
    error instanceof Error
      ? error.message.trim()
      : typeof error === "string"
        ? error.trim()
        : "";

  if (!message || isRawDatabaseConstraintMessage(message)) {
    return CREATE_CONVERSATION_USER_ERROR;
  }

  // Keep short, non-technical product messages (auth, archive, validation).
  if (
    /archived|sign in|permission|required|not found|unable to reach|try again|select a client|refresh and try again/i.test(
      message
    ) &&
    !isRawDatabaseConstraintMessage(message)
  ) {
    return message;
  }

  return CREATE_CONVERSATION_USER_ERROR;
}
