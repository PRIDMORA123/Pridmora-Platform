/**
 * Confidential Coaching — relationship identity mode.
 *
 * Public client rows hold display labels and confidential references.
 * Private identity (real name, email, phone, notes) lives separately and
 * must never reach AI, org-wide views, or default reports.
 */

export const IDENTITY_MODES = ["standard", "confidential"] as const;

export type IdentityMode = (typeof IDENTITY_MODES)[number];

export const DEFAULT_CONFIDENTIAL_DISPLAY_LABEL = "Confidential relationship";

export type PrivateIdentityFields = {
  realName: string;
  email: string;
  phone: string;
  privateNotes: string;
};

export type PrivateIdentityRecord = PrivateIdentityFields & {
  id: string;
  clientId: string;
  organisationId: string;
  coachId: string;
  createdAt: string;
  updatedAt: string;
};

/** Safe public identity surface for UI, search results, and reports. */
export type RelationshipPublicIdentity = {
  identityMode: IdentityMode;
  /** Stable public display string (never private real name in confidential mode). */
  displayName: string;
  displayLabel: string;
  confidentialReference: string | null;
  role: string;
  organisation: string;
  aiNameAllowed: boolean;
  /** Initials derived from the public display name only. */
  initials: string;
};

export type RelationshipAiContext = {
  identityMode: IdentityMode;
  /** Name/label permitted in AI prompts — never private real name. */
  aiDisplayName: string;
  confidentialReference: string | null;
  displayLabel: string;
  role: string;
  /** Employer/org string only when already present on the public client. */
  organisation: string;
  /** Isolation allow-list for relationship-scope checks. */
  allowedClientName: string;
};

export function isIdentityMode(value: unknown): value is IdentityMode {
  return value === "standard" || value === "confidential";
}

export function parseIdentityMode(value: unknown): IdentityMode {
  return isIdentityMode(value) ? value : "standard";
}

export function hasAnyPrivateIdentityField(
  fields: Partial<PrivateIdentityFields> | null | undefined
): boolean {
  if (!fields) return false;
  return Boolean(
    fields.realName?.trim() ||
      fields.email?.trim() ||
      fields.phone?.trim() ||
      fields.privateNotes?.trim()
  );
}

/**
 * Alphabet excluding ambiguous characters (0/O, 1/I/L).
 * Format: C-XXXXXX (6 chars) — short, non-sequential, non-identifying.
 */
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Generate a confidential relationship reference server-side.
 * Never accept a browser-supplied value.
 */
export function generateConfidentialReference(
  randomBytes: (size: number) => Uint8Array = defaultRandomBytes
): string {
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += REFERENCE_ALPHABET[bytes[i]! % REFERENCE_ALPHABET.length];
  }
  return `C-${code}`;
}

function defaultRandomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("Secure random generation is unavailable.");
  }
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function isConfidentialReferenceFormat(value: string): boolean {
  return /^C-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/.test(value.trim());
}

export function resolveConfidentialDisplayLabel(input: {
  displayLabel?: string | null;
  role?: string | null;
}): string {
  const label = input.displayLabel?.trim() ?? "";
  if (label) return label;
  const role = input.role?.trim() ?? "";
  if (role) return role;
  return DEFAULT_CONFIDENTIAL_DISPLAY_LABEL;
}

/**
 * Public name stored on clients.name for backward compatibility.
 * Confidential mode must never store the private real name here.
 */
export function resolvePublicClientName(input: {
  identityMode: IdentityMode;
  name?: string | null;
  displayLabel?: string | null;
  role?: string | null;
  confidentialReference?: string | null;
}): string {
  if (input.identityMode === "confidential") {
    const label = resolveConfidentialDisplayLabel({
      displayLabel: input.displayLabel,
      role: input.role,
    });
    if (label !== DEFAULT_CONFIDENTIAL_DISPLAY_LABEL) return label;
    return input.confidentialReference?.trim() || label;
  }
  return (input.name?.trim() || input.displayLabel?.trim() || "").trim();
}

export function relationshipPublicIdentity(
  client: {
    name: string;
    role?: string | null;
    organisation?: string | null;
    initials?: string | null;
    identityMode?: IdentityMode | string | null;
    displayLabel?: string | null;
    confidentialReference?: string | null;
    aiNameAllowed?: boolean | null;
  }
): RelationshipPublicIdentity {
  const identityMode = parseIdentityMode(client.identityMode);
  const displayLabel =
    client.displayLabel?.trim() ||
    (identityMode === "confidential"
      ? resolveConfidentialDisplayLabel({
          displayLabel: client.displayLabel,
          role: client.role,
        })
      : client.name.trim());

  const displayName =
    identityMode === "confidential"
      ? displayLabel ||
        client.confidentialReference?.trim() ||
        DEFAULT_CONFIDENTIAL_DISPLAY_LABEL
      : client.name.trim() || displayLabel;

  return {
    identityMode,
    displayName,
    displayLabel,
    confidentialReference: client.confidentialReference?.trim() || null,
    role: client.role?.trim() || "",
    organisation: client.organisation?.trim() || "",
    aiNameAllowed: Boolean(client.aiNameAllowed),
    initials: client.initials?.trim() || initialsFromDisplay(displayName),
  };
}

/** Coach-facing public display name for titles, lists, and breadcrumbs. */
export function getRelationshipDisplayName(
  client: Parameters<typeof relationshipPublicIdentity>[0]
): string {
  return relationshipPublicIdentity(client).displayName;
}

function initialsFromDisplay(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CR";
  return parts
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Canonical AI identity context. All generative routes must use this helper.
 * Private identity fields are never included, even when supplied.
 */
export function buildRelationshipAiContext(
  client: {
    name: string;
    role?: string | null;
    organisation?: string | null;
    identityMode?: IdentityMode | string | null;
    displayLabel?: string | null;
    confidentialReference?: string | null;
    aiNameAllowed?: boolean | null;
  },
  _privateIdentity?: Partial<PrivateIdentityFields> | null
): RelationshipAiContext {
  // Explicitly ignore private identity — callers may pass it by mistake.
  void _privateIdentity;

  const publicIdentity = relationshipPublicIdentity(client);
  const { identityMode, displayLabel, confidentialReference, role, organisation } =
    publicIdentity;

  if (identityMode === "confidential") {
    const aiDisplayName =
      displayLabel ||
      confidentialReference ||
      DEFAULT_CONFIDENTIAL_DISPLAY_LABEL;
    return {
      identityMode,
      aiDisplayName,
      confidentialReference,
      displayLabel,
      role,
      organisation,
      allowedClientName: aiDisplayName,
    };
  }

  const preferredName = client.name.trim() || displayLabel;
  const safeDisplayLabel = displayLabel || preferredName || "Client";
  const aiDisplayName = client.aiNameAllowed ? preferredName : safeDisplayLabel;

  return {
    identityMode,
    aiDisplayName,
    confidentialReference: null,
    displayLabel: safeDisplayLabel,
    role,
    organisation,
    allowedClientName: aiDisplayName,
  };
}

/**
 * Build the person-context lines commonly prepended to AI prompts.
 * Never includes email, phone, real name, or private notes.
 */
export function formatRelationshipAiPersonContext(
  context: RelationshipAiContext,
  options?: { includeOrganisation?: boolean }
): string[] {
  const lines: string[] = [];

  if (context.identityMode === "confidential") {
    if (context.confidentialReference) {
      lines.push(`Confidential reference: ${context.confidentialReference}`);
    }
    lines.push(`Display label: ${context.aiDisplayName}`);
  } else {
    lines.push(`Name: ${context.aiDisplayName}`);
  }

  if (context.role) {
    lines.push(`Role: ${context.role}`);
  }

  if (options?.includeOrganisation !== false && context.organisation) {
    lines.push(`Organisation: ${context.organisation}`);
  }

  return lines;
}

/** Assert a serialised AI payload contains no private identity values. */
export function assertAiPayloadExcludesPrivateIdentity(
  payload: string,
  privateIdentity: Partial<PrivateIdentityFields>
): void {
  const checks: Array<{ label: string; value: string }> = [
    { label: "realName", value: privateIdentity.realName?.trim() ?? "" },
    { label: "email", value: privateIdentity.email?.trim() ?? "" },
    { label: "phone", value: privateIdentity.phone?.trim() ?? "" },
    { label: "privateNotes", value: privateIdentity.privateNotes?.trim() ?? "" },
  ];

  for (const check of checks) {
    if (!check.value) continue;
    if (payload.toLowerCase().includes(check.value.toLowerCase())) {
      throw new Error(
        `AI payload must not include private identity field: ${check.label}`
      );
    }
  }
}

export type CreateRelationshipIdentityInput = {
  identityMode?: unknown;
  name?: unknown;
  displayLabel?: unknown;
  role?: unknown;
  organisation?: unknown;
  currentFocus?: unknown;
  email?: unknown;
  aiNameAllowed?: unknown;
  privateRealName?: unknown;
  privateEmail?: unknown;
  privatePhone?: unknown;
  privateNotes?: unknown;
  /** Browser must never supply this — rejected if present. */
  confidentialReference?: unknown;
  /** Browser must never supply this — rejected if present. */
  organisationId?: unknown;
  organisation_id?: unknown;
  /** Browser must never supply this — rejected if present. */
  coachId?: unknown;
  coach_id?: unknown;
};

export type ValidatedRelationshipIdentity = {
  identityMode: IdentityMode;
  /** Public clients.name value. */
  name: string;
  displayLabel: string;
  role: string;
  organisation: string;
  currentFocus: string;
  /** Standard-mode optional public email (not private identity). */
  email: string;
  aiNameAllowed: boolean;
  confidentialReference: string | null;
  privateIdentity: PrivateIdentityFields | null;
};

export type IdentityValidationError = {
  status: 400;
  error: string;
};

function asOptionalTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Validate browser-submitted create payload.
 * Generates confidential_reference only when mode is confidential (caller supplies generator).
 */
export function validateCreateRelationshipIdentity(
  input: CreateRelationshipIdentityInput,
  options: {
    generateReference: () => string;
  }
): ValidatedRelationshipIdentity | IdentityValidationError {
  if (
    (input.organisationId !== undefined &&
      input.organisationId !== null &&
      String(input.organisationId).trim() !== "") ||
    (input.organisation_id !== undefined &&
      input.organisation_id !== null &&
      String(input.organisation_id).trim() !== "")
  ) {
    return {
      status: 400,
      error: "Organisation ownership is derived server-side and cannot be supplied.",
    };
  }

  if (
    (input.coachId !== undefined &&
      input.coachId !== null &&
      String(input.coachId).trim() !== "") ||
    (input.coach_id !== undefined &&
      input.coach_id !== null &&
      String(input.coach_id).trim() !== "")
  ) {
    return {
      status: 400,
      error: "Coach ownership is derived server-side and cannot be supplied.",
    };
  }

  if (
    input.confidentialReference !== undefined &&
    input.confidentialReference !== null &&
    String(input.confidentialReference).trim() !== ""
  ) {
    return {
      status: 400,
      error: "Confidential reference is generated by the server and cannot be supplied.",
    };
  }

  const identityMode = parseIdentityMode(
    input.identityMode === undefined || input.identityMode === null
      ? "standard"
      : input.identityMode
  );

  if (
    input.identityMode !== undefined &&
    input.identityMode !== null &&
    !isIdentityMode(input.identityMode)
  ) {
    return { status: 400, error: "identityMode must be standard or confidential." };
  }

  const role = asOptionalTrimmed(input.role);
  const organisation = asOptionalTrimmed(input.organisation);
  const currentFocus = asOptionalTrimmed(input.currentFocus);
  const displayLabelInput = asOptionalTrimmed(input.displayLabel);
  const nameInput = asOptionalTrimmed(input.name);
  const email = asOptionalTrimmed(input.email);
  const aiNameAllowed = Boolean(input.aiNameAllowed);

  const privateIdentity: PrivateIdentityFields = {
    realName: asOptionalTrimmed(input.privateRealName),
    email: asOptionalTrimmed(input.privateEmail),
    phone: asOptionalTrimmed(input.privatePhone),
    privateNotes: asOptionalTrimmed(input.privateNotes),
  };
  const privateRow = hasAnyPrivateIdentityField(privateIdentity)
    ? privateIdentity
    : null;

  if (identityMode === "standard") {
    if (!nameInput) {
      return { status: 400, error: "Client name is required." };
    }
    return {
      identityMode,
      name: nameInput,
      displayLabel: displayLabelInput || nameInput,
      role,
      organisation,
      currentFocus,
      email,
      aiNameAllowed,
      confidentialReference: null,
      privateIdentity: privateRow,
    };
  }

  // Confidential mode
  if (!displayLabelInput && !role) {
    return {
      status: 400,
      error: "Confidential relationships require a display label or role.",
    };
  }

  const confidentialReference = options.generateReference();
  const displayLabel = resolveConfidentialDisplayLabel({
    displayLabel: displayLabelInput,
    role,
  });
  const publicName = resolvePublicClientName({
    identityMode: "confidential",
    displayLabel,
    role,
    confidentialReference,
  });

  return {
    identityMode,
    name: publicName,
    displayLabel,
    role,
    organisation,
    currentFocus,
    email: "", // public email unused in confidential mode
    aiNameAllowed: false,
    confidentialReference,
    privateIdentity: privateRow,
  };
}
