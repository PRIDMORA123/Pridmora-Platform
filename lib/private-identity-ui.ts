import { ApiRequestError } from "@/lib/api-failure";

export type PrivateIdentityViewFields = {
  realName: string;
  email: string;
  phone: string;
  privateNotes: string;
  updatedAt?: string;
};

export const PRIVATE_IDENTITY_ACCESS_DENIED =
  "You do not have access to this private identity.";

export const PRIVATE_IDENTITY_MISSING =
  "No private identity details have been added.";

export const PRIVATE_IDENTITY_LOAD_FAILED =
  "We could not load the private identity. Please try again.";

export const PRIVATE_IDENTITY_SAVE_FAILED =
  "We could not save the private identity. Please try again.";

/** Map transport/API failures to safe coach-facing copy. Never surface RLS or DB text. */
export function mapPrivateIdentityLoadError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401 || error.status === 403 || error.status === 404) {
      return PRIVATE_IDENTITY_ACCESS_DENIED;
    }
  }
  return PRIVATE_IDENTITY_LOAD_FAILED;
}

export function mapPrivateIdentitySaveError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401 || error.status === 403 || error.status === 404) {
      return PRIVATE_IDENTITY_ACCESS_DENIED;
    }
  }
  return PRIVATE_IDENTITY_SAVE_FAILED;
}

/** Fields with content only — empty strings omitted from the view. */
export function privateIdentityVisibleFields(
  record: PrivateIdentityViewFields | null | undefined,
  confidentialReference?: string | null
): Array<{ label: string; value: string }> {
  const fields: Array<{ label: string; value: string }> = [];
  const reference = confidentialReference?.trim() ?? "";
  if (reference) {
    fields.push({ label: "Confidential reference", value: reference });
  }
  if (!record) return fields;

  const name = record.realName?.trim() ?? "";
  const email = record.email?.trim() ?? "";
  const phone = record.phone?.trim() ?? "";
  const note = record.privateNotes?.trim() ?? "";

  if (name) fields.push({ label: "Name", value: name });
  if (email) fields.push({ label: "Email", value: email });
  if (phone) fields.push({ label: "Phone", value: phone });
  if (note) fields.push({ label: "Private note", value: note });
  return fields;
}
