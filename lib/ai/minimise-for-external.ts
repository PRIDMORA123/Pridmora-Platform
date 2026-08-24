/**
 * Person-level external-AI privacy boundary.
 *
 * Operates on a copy of AI-bound text. Never writes back to source records.
 * Request-scoped person tokens are not persisted. Third-party names are never
 * restored into AI-derived output.
 */

import { AI_SUBJECT_REFERENCE } from "@/lib/relationship-identity";

export { AI_SUBJECT_REFERENCE };
export const REDACTED_EMAIL = "[redacted-email]";
export const REDACTED_PHONE = "[redacted-phone]";
export const REDACTED_ID = "[redacted-id]";

export type ExternalAiKnownIdentities = {
  /** Public clients.name in standard mode. Null for confidential (vault stays out). */
  subjectLegalName?: string | null;
  /** Explicit opt-in to send the preferred name. */
  subjectNameAllowed?: boolean;
  displayLabel?: string | null;
  organisation?: string | null;
  role?: string | null;
  /** Other public person names already in-request (not vault). */
  otherPersonNames?: string[];
};

export type ExternalAiPersonSlot = {
  index: number;
  token: string;
  originals: string[];
  firstName: string | null;
};

export type ExternalAiNameMapping = {
  subjectOriginals: string[];
  people: ExternalAiPersonSlot[];
};

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}\b/g;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

/** Two-or-more capitalised name tokens on the same line, including hyphen/apostrophe parts. */
const NAME_PART = "[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?";
const FULL_NAME_PATTERN = new RegExp(
  `\\b${NAME_PART}(?:[ \\t]+${NAME_PART})+\\b`,
  "g"
);

const SKIP_NAME_TOKENS = new Set([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "january",
  "february",
  "march",
  "april",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "pridmora",
  "aurelia",
  "identity",
  "development",
  "intelligence",
  "coaching",
  "session",
  "summary",
  "manager",
  "report",
  "organisation",
  "organization",
  "british",
  "english",
  "united",
  "kingdom",
  "personal",
  "professional",
  "conversation",
  "reflection",
  "evidence",
  "pattern",
  "journey",
  "prepare",
  "update",
  "later",
  "then",
  "after",
  "before",
  "during",
  "while",
  "however",
  "therefore",
  "finally",
  "next",
  "last",
  "first",
  "when",
  "although",
  "because",
  "perhaps",
  "today",
  "yesterday",
  "please",
  "following",
  "regarding",
  "currently",
  "recently",
  "previously",
  "active",
  "current",
  "selected",
]);

function personToken(index: number): string {
  return `[PERSON ${index}]`;
}

export function createExternalAiNameMapping(): ExternalAiNameMapping {
  return { subjectOriginals: [], people: [] };
}

function trimName(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function namesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordBoundaryPattern(value: string): RegExp {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(part => escapeRegExp(part));
  const possessive = "(?:['’]s)?";
  return new RegExp(`\\b${parts.join("[ \\t]+")}${possessive}\\b`, "gi");
}

function firstToken(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean)[0] ?? "";
}

function lastToken(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/** O' / Mc / Mac / D' style prefixes attached to a known last name. */
const KNOWN_SURNAME_PREFIX = "(?:O['’]|Mc|Mac|D['’])?";

/**
 * Replace obvious textual variants of a known two-or-more-token identity
 * (hyphenation, Irish/Scottish surname prefixes) without a first-name split
 * that would leave the last name behind.
 */
function replaceKnownIdentityVariants(
  text: string,
  fullName: string,
  replacement: string
): string {
  const first = firstToken(fullName);
  const last = lastToken(fullName);
  if (first.length < 2 || last.length < 2 || namesEqual(first, last)) {
    return text;
  }
  const firstRe = escapeRegExp(first);
  const lastRe = escapeRegExp(last);
  const possessive = "(?:['’]s)?";
  const variant = new RegExp(
    `\\b${firstRe}(?:[ \\t]*-[ \\t]*|[ \\t]+${KNOWN_SURNAME_PREFIX})${lastRe}${possessive}\\b`,
    "gi"
  );
  return text.replace(variant, replacement);
}

function stripSubjectLastNameFragments(text: string, subjectName: string): string {
  const last = lastToken(subjectName);
  if (last.length < 2) return text;
  const lastRe = escapeRegExp(last);
  const possessive = "(?:['’]s)?";
  const fragment = new RegExp(
    `${escapeRegExp(AI_SUBJECT_REFERENCE)}(?:[ \\t]*-[ \\t]*|[ \\t]+${KNOWN_SURNAME_PREFIX})${lastRe}${possessive}\\b`,
    "gi"
  );
  return text.replace(fragment, AI_SUBJECT_REFERENCE);
}

function shouldSkipNameSpan(span: string, identities: ExternalAiKnownIdentities): boolean {
  const tokens = span.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return true;
  if (tokens.some(token => SKIP_NAME_TOKENS.has(token.toLowerCase()))) return true;
  const organisation = trimName(identities.organisation);
  const role = trimName(identities.role);
  const displayLabel = trimName(identities.displayLabel);
  if (organisation && namesEqual(span, organisation)) return true;
  if (role && namesEqual(span, role)) return true;
  if (displayLabel && namesEqual(span, displayLabel) && !isIdentifyingDisplayLabel(identities)) {
    return true;
  }
  return false;
}

export function isIdentifyingDisplayLabel(identities: {
  subjectLegalName?: string | null;
  displayLabel?: string | null;
}): boolean {
  const name = trimName(identities.subjectLegalName);
  const label = trimName(identities.displayLabel);
  if (!name || !label) return false;
  return namesEqual(name, label);
}

function replaceAllMapped(text: string, original: string, replacement: string): string {
  if (!original.trim() || original.trim().length < 2) return text;
  return text.replace(wordBoundaryPattern(original), replacement);
}

function registerPerson(
  mapping: ExternalAiNameMapping,
  original: string
): ExternalAiPersonSlot {
  const existing = mapping.people.find(slot =>
    slot.originals.some(value => namesEqual(value, original))
  );
  if (existing) {
    if (!existing.originals.some(value => namesEqual(value, original))) {
      existing.originals.push(original.trim());
    }
    return existing;
  }
  const index = mapping.people.length + 1;
  const slot: ExternalAiPersonSlot = {
    index,
    token: personToken(index),
    originals: [original.trim()],
    firstName: firstToken(original),
  };
  mapping.people.push(slot);
  return slot;
}

function applyKnownReplacements(
  text: string,
  identities: ExternalAiKnownIdentities,
  mapping: ExternalAiNameMapping
): string {
  let result = text;
  const subjectName = trimName(identities.subjectLegalName);
  const subjectAllowed = Boolean(identities.subjectNameAllowed);

  if (subjectName && !subjectAllowed) {
    if (!mapping.subjectOriginals.some(value => namesEqual(value, subjectName))) {
      mapping.subjectOriginals.push(subjectName);
    }
    result = replaceAllMapped(result, subjectName, AI_SUBJECT_REFERENCE);
    result = replaceKnownIdentityVariants(
      result,
      subjectName,
      AI_SUBJECT_REFERENCE
    );
  }

  const otherNames = [...(identities.otherPersonNames ?? [])]
    .map(trimName)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const other of otherNames) {
    if (subjectName && namesEqual(other, subjectName)) continue;
    const organisation = trimName(identities.organisation);
    if (organisation && namesEqual(other, organisation)) continue;
    const slot = registerPerson(mapping, other);
    result = replaceAllMapped(result, other, slot.token);
  }

  return result;
}

function applyHeuristicFullNames(
  text: string,
  identities: ExternalAiKnownIdentities,
  mapping: ExternalAiNameMapping
): string {
  return text.replace(FULL_NAME_PATTERN, match => {
    if (shouldSkipNameSpan(match, identities)) return match;
    if (match.includes("[") || match.includes("]")) return match;
    const subjectName = trimName(identities.subjectLegalName);
    if (subjectName && namesEqual(match, subjectName)) {
      if (identities.subjectNameAllowed) return match;
      if (!mapping.subjectOriginals.some(value => namesEqual(value, subjectName))) {
        mapping.subjectOriginals.push(subjectName);
      }
      return AI_SUBJECT_REFERENCE;
    }
    const slot = registerPerson(mapping, match);
    return slot.token;
  });
}

function standaloneFirstNamePattern(first: string): RegExp {
  const possessive = "(?:['’]s)?";
  return new RegExp(
    `\\b${escapeRegExp(first)}${possessive}\\b(?![-'][A-Za-z])`,
    "gi"
  );
}

function applyFirstNameAliases(
  text: string,
  mapping: ExternalAiNameMapping
): string {
  const firstNameOwners = new Map<string, ExternalAiPersonSlot[]>();
  for (const slot of mapping.people) {
    const first = slot.firstName?.trim();
    if (!first || first.length < 2) continue;
    const key = first.toLowerCase();
    const list = firstNameOwners.get(key) ?? [];
    list.push(slot);
    firstNameOwners.set(key, list);
  }

  let result = text;
  for (const [first, owners] of firstNameOwners) {
    if (owners.length !== 1) continue;
    const slot = owners[0]!;
    result = result.replace(standaloneFirstNamePattern(first), slot.token);
  }

  if (mapping.subjectOriginals.length === 1) {
    const subjectName = mapping.subjectOriginals[0]!;
    const first = firstToken(subjectName);
    if (first.length >= 2 && !firstNameOwners.has(first.toLowerCase())) {
      result = result.replace(
        standaloneFirstNamePattern(first),
        AI_SUBJECT_REFERENCE
      );
    }
    result = stripSubjectLastNameFragments(result, subjectName);
  }

  return result;
}

export function redactContactIdentifiers(text: string): string {
  return text
    .replace(EMAIL_PATTERN, REDACTED_EMAIL)
    .replace(UUID_PATTERN, REDACTED_ID)
    .replace(PHONE_PATTERN, REDACTED_PHONE);
}

export function minimiseForExternalAi(
  text: string,
  identities: ExternalAiKnownIdentities = {},
  mapping: ExternalAiNameMapping = createExternalAiNameMapping()
): { text: string; mapping: ExternalAiNameMapping } {
  let result = text;
  result = redactContactIdentifiers(result);
  result = applyKnownReplacements(result, identities, mapping);
  result = applyHeuristicFullNames(result, identities, mapping);
  result = applyFirstNameAliases(result, mapping);
  return { text: result, mapping };
}

export function appendPersonLevelPrivacyAddendum(instructions: string): string {
  const addendum = `PRIVACY PLACEHOLDERS
${AI_SUBJECT_REFERENCE} and [PERSON n] are privacy tokens, not names.
Do not repeat these tokens in your reply.
Do not invent or restore legal names.
Refer to ${AI_SUBJECT_REFERENCE} as the person this development record already concerns — usually omit a name.
Refer to each [PERSON n] with a short non-identifying phrase such as "a team member", "another colleague", or "another person". Keep different n distinct only when needed for sense.`;
  const trimmed = instructions.trim();
  if (!trimmed) return addendum;
  if (trimmed.includes("PRIVACY PLACEHOLDERS")) return trimmed;
  return `${trimmed}\n\n${addendum}`;
}

function neutralPhraseForPerson(index: number): string {
  if (index === 1) return "a team member";
  if (index === 2) return "another colleague";
  if (index === 3) return "another person";
  return "a further person";
}

function replaceToken(text: string, token: string, replacement: string): string {
  const escaped = escapeRegExp(token);
  return text.replace(new RegExp(escaped, "g"), replacement);
}

/**
 * Convert leftover privacy tokens and leaked mapped names into readable
 * identity-minimised wording. Never restores third-party legal names.
 */
export function cleanDerivedAiText(
  text: string,
  mapping: ExternalAiNameMapping
): string {
  let result = text;

  const peopleDesc = [...mapping.people].sort((a, b) => b.index - a.index);
  for (const slot of peopleDesc) {
    const phrase = neutralPhraseForPerson(slot.index);
    result = replaceToken(result, slot.token, phrase);
  }
  result = result.replace(/\[PERSON\s+(\d+)\]/gi, (_, raw: string) =>
    neutralPhraseForPerson(Number(raw))
  );
  result = replaceToken(result, AI_SUBJECT_REFERENCE, "the person");

  const originals: Array<{ original: string; replacement: string }> = [];
  for (const slot of mapping.people) {
    const phrase = neutralPhraseForPerson(slot.index);
    for (const original of slot.originals) {
      originals.push({ original, replacement: phrase });
    }
    if (slot.firstName) {
      originals.push({ original: slot.firstName, replacement: phrase });
    }
  }
  for (const original of mapping.subjectOriginals) {
    originals.push({ original, replacement: "the person" });
    const first = firstToken(original);
    if (first.length >= 2) {
      originals.push({ original: first, replacement: "the person" });
    }
  }
  originals.sort((a, b) => b.original.length - a.original.length);
  for (const item of originals) {
    result = replaceAllMapped(result, item.original, item.replacement);
  }

  return result;
}

export function cleanDerivedAiValue<T>(value: T, mapping: ExternalAiNameMapping): T {
  if (typeof value === "string") {
    return cleanDerivedAiText(value, mapping) as T;
  }
  if (Array.isArray(value)) {
    return value.map(item => cleanDerivedAiValue(item, mapping)) as T;
  }
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      next[key] = cleanDerivedAiValue(entry, mapping);
    }
    return next as T;
  }
  return value;
}

export function knownIdentitiesFromPublicClient(
  client: {
    name?: string | null;
    displayLabel?: string | null;
    organisation?: string | null;
    role?: string | null;
    identityMode?: string | null;
    aiNameAllowed?: boolean | null;
  },
  extra?: { otherPersonNames?: string[] }
): ExternalAiKnownIdentities {
  const confidential = client.identityMode === "confidential";
  return {
    subjectLegalName: confidential ? null : client.name ?? null,
    subjectNameAllowed: confidential ? false : Boolean(client.aiNameAllowed),
    displayLabel: client.displayLabel ?? null,
    organisation: client.organisation ?? null,
    role: client.role ?? null,
    otherPersonNames: extra?.otherPersonNames ?? [],
  };
}
