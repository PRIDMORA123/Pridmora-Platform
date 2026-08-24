/**
 * Evidence text sanitisation before AI use.
 * Delegates contact/identifier redaction to the shared person-level boundary.
 */

import type { PrivateIdentityFields } from "@/lib/relationship-identity";
import {
  minimiseForExternalAi,
  redactContactIdentifiers as redactContactIdentifiersShared,
  type ExternalAiKnownIdentities,
} from "@/lib/ai/minimise-for-external";

export function redactContactIdentifiers(text: string): string {
  return redactContactIdentifiersShared(text);
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
  privateIdentity?: Partial<PrivateIdentityFields> | null,
  knownIdentities?: ExternalAiKnownIdentities
): string {
  const withoutPrivate = redactPrivateIdentityValues(text, privateIdentity);
  return minimiseForExternalAi(withoutPrivate, knownIdentities ?? {}).text.trim();
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
