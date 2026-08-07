/**
 * Evidence text sanitisation before AI use.
 * Removes emails, phones, and known private identity fields.
 */

import type { PrivateIdentityFields } from "@/lib/relationship-identity";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}\b/g;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

export function redactContactIdentifiers(text: string): string {
  return text
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(PHONE_PATTERN, "[redacted-phone]")
    .replace(UUID_PATTERN, "[redacted-id]");
}

export function redactPrivateIdentityValues(
  text: string,
  privateIdentity?: Partial<PrivateIdentityFields> | null
): string {
  let result = text;
  if (!privateIdentity) return result;

  const values = [
    privateIdentity.realName,
    privateIdentity.email,
    privateIdentity.phone,
  ]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value && value.length >= 2));

  for (const value of values) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "gi"), "[redacted]");
  }

  return result;
}

/**
 * Canonical sanitiser for evidence text entering AI context.
 */
export function sanitizeEvidenceTextForAi(
  text: string,
  privateIdentity?: Partial<PrivateIdentityFields> | null
): string {
  const withoutPrivate = redactPrivateIdentityValues(text, privateIdentity);
  return redactContactIdentifiers(withoutPrivate).trim();
}

/** Forbidden field names that must never appear as prompt keys for private identity. */
export const FORBIDDEN_EVIDENCE_AI_FIELD_NAMES = [
  "realName",
  "real_name",
  "privateEmail",
  "private_email",
  "privatePhone",
  "private_phone",
  "privateNotes",
  "private_notes",
  "email",
  "phone",
  "accountId",
  "account_id",
  "authUserId",
  "auth_user_id",
] as const;

export function assertNoForbiddenEvidenceAiFields(
  payload: Record<string, unknown>
): void {
  for (const key of Object.keys(payload)) {
    if (
      (FORBIDDEN_EVIDENCE_AI_FIELD_NAMES as readonly string[]).includes(key)
    ) {
      throw new Error(
        `Evidence AI context must not include forbidden field: ${key}`
      );
    }
  }
}
