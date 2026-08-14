/**
 * Relationship data isolation helpers.
 *
 * In Identity, a coaching relationship is a `clients` row.
 * `relationshipId` is therefore the same UUID as `clientId`.
 */

export type RelationshipScope = {
  coachId: string;
  relationshipId: string;
  /** Organisation tenancy — required for multi-user isolation. */
  organisationId?: string;
};

export type RelationshipOwnedRecord = {
  relationshipId: string;
};

export class RelationshipScopeIntegrityError extends Error {
  readonly code = "RELATIONSHIP_SCOPE_INTEGRITY" as const;

  constructor(message = "Relationship-scoped data integrity check failed.") {
    super(message);
    this.name = "RelationshipScopeIntegrityError";
  }
}

/** Normalise a clientId-bearing record to the relationship ownership shape. */
export function asRelationshipOwned(
  record: { clientId?: string; relationshipId?: string }
): RelationshipOwnedRecord {
  const relationshipId = record.relationshipId ?? record.clientId ?? "";
  return { relationshipId };
}

/**
 * Before building relationship view models, confirm every source record
 * belongs to the active coaching relationship. Never silently display mixed data.
 */
export function assertRelationshipOwnership(
  relationshipId: string,
  records: Array<{ relationshipId?: string; clientId?: string }>
): void {
  const invalidRecord = records.find(record => {
    const ownedId = record.relationshipId ?? record.clientId ?? "";
    return ownedId !== relationshipId;
  });

  if (invalidRecord) {
    throw new RelationshipScopeIntegrityError();
  }
}

/** Minimum token length considered for person-name matching. */
const MIN_NAME_TOKEN_LENGTH = 4;

/**
 * Common given names — alone these are ambiguous and must not hard-block saves.
 * Keep conservative: prefer possible_match over definite.
 */
const COMMON_FIRST_NAMES = new Set([
  "adam",
  "alex",
  "alexander",
  "alice",
  "amy",
  "andrew",
  "anna",
  "anne",
  "benjamin",
  "beth",
  "brian",
  "carol",
  "catherine",
  "charles",
  "chris",
  "christian",
  "christine",
  "christopher",
  "claire",
  "daniel",
  "david",
  "deborah",
  "donna",
  "edward",
  "elizabeth",
  "emily",
  "emma",
  "eric",
  "gary",
  "george",
  "helen",
  "jackson",
  "jacob",
  "james",
  "jane",
  "jason",
  "jennifer",
  "jessica",
  "john",
  "jonathan",
  "joseph",
  "joshua",
  "julie",
  "karen",
  "kate",
  "katherine",
  "kevin",
  "laura",
  "lisa",
  "lucy",
  "margaret",
  "maria",
  "mark",
  "martin",
  "mary",
  "matthew",
  "michael",
  "michelle",
  "nancy",
  "nathan",
  "nicholas",
  "nicole",
  "oliver",
  "patricia",
  "paul",
  "peter",
  "rachel",
  "rebecca",
  "richard",
  "robert",
  "robin",
  "ryan",
  "samuel",
  "sandra",
  "sarah",
  "sharon",
  "simon",
  "stephen",
  "steven",
  "susan",
  "thomas",
  "timothy",
  "victoria",
  "william",
]);

/**
 * Tokens that look like surnames but are ordinary English words / very common
 * surnames. Whole-word hits alone are possible matches, not definite.
 */
const AMBIGUOUS_SURNAME_OR_DICTIONARY = new Set([
  "baker",
  "black",
  "brown",
  "carter",
  "clark",
  "cook",
  "cooper",
  "ford",
  "green",
  "hall",
  "hill",
  "hunt",
  "jones",
  "king",
  "lee",
  "long",
  "martin",
  "mason",
  "may",
  "miller",
  "moore",
  "morris",
  "park",
  "porter",
  "price",
  "reed",
  "rich",
  "rose",
  "ross",
  "scott",
  "smith",
  "stone",
  "taylor",
  "ward",
  "west",
  "white",
  "wood",
  "young",
]);

export type IsolationMatchType =
  | "full_name"
  | "alias"
  | "uncommon_surname"
  | "common_surname"
  | "common_first_name"
  | "short_token";

export type IsolationStatus =
  | "pass"
  | "definite_cross_client"
  | "possible_cross_client";

export type RelationshipIsolationResult = {
  status: IsolationStatus;
  matchType?: IsolationMatchType;
  fieldName?: string;
  /** Dev/test only — never log confidential content in production. */
  diagnosticSnippet?: string;
};

export type RelationshipIsolationContext = {
  allowedClientName: string;
  knownOtherNames: string[];
  coachName?: string;
  organisationName?: string;
  /** Explicitly authorised names (e.g. evidence-source authors). */
  authorisedNames?: string[];
  /** Extra aliases treated as other-client names. */
  otherNameAliases?: string[];
  /** Optional per-field texts for safer field attribution. */
  fieldTexts?: Record<string, string | null | undefined>;
};

/**
 * Normalise person-name / free text for token comparison:
 * lower case, Unicode NFKC, punctuation removed, possessives stripped,
 * repeated spaces collapsed.
 */
export function normalisePersonNameText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    // Straighten common apostrophe-like characters (including Unicode ’ / ‘).
    .replace(/[\u2019\u2018\u0060\u00B4\u02BC']/g, "'")
    // Strip possessive suffixes before punctuation removal.
    .replace(/'s\b/g, "")
    .replace(/s'\b/g, "s")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/[-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function personNameTokens(value: string): string[] {
  if (!value?.trim()) return [];
  return normalisePersonNameText(value)
    .split(" ")
    .map(token => token.trim())
    .filter(Boolean);
}

function significantTokens(value: string): string[] {
  return personNameTokens(value).filter(
    token => token.length >= MIN_NAME_TOKEN_LENGTH
  );
}

function containsContiguousTokens(
  haystackTokens: string[],
  needleTokens: string[]
): boolean {
  if (needleTokens.length === 0) return false;
  if (needleTokens.length === 1) {
    return haystackTokens.includes(needleTokens[0]!);
  }
  outer: for (let i = 0; i <= haystackTokens.length - needleTokens.length; i++) {
    for (let j = 0; j < needleTokens.length; j++) {
      if (haystackTokens[i + j] !== needleTokens[j]) continue outer;
    }
    return true;
  }
  return false;
}

function classifySingleToken(token: string): IsolationMatchType {
  if (token.length < MIN_NAME_TOKEN_LENGTH) return "short_token";
  if (COMMON_FIRST_NAMES.has(token)) return "common_first_name";
  if (AMBIGUOUS_SURNAME_OR_DICTIONARY.has(token)) return "common_surname";
  if (token.length >= 5) return "uncommon_surname";
  return "common_surname";
}

function statusForMatchType(matchType: IsolationMatchType): IsolationStatus {
  switch (matchType) {
    case "full_name":
    case "alias":
    case "uncommon_surname":
      return "definite_cross_client";
    case "common_surname":
    case "common_first_name":
    case "short_token":
      return "possible_cross_client";
    default:
      return "possible_cross_client";
  }
}

function safeDiagnosticSnippet(text: string, token: string): string {
  const normalised = normalisePersonNameText(text);
  const idx = normalised.indexOf(token);
  if (idx < 0) return "";
  const start = Math.max(0, idx - 16);
  const end = Math.min(normalised.length, idx + token.length + 16);
  return normalised.slice(start, end).trim();
}

function buildAuthorisedTokenSet(context: RelationshipIsolationContext): Set<string> {
  const authorised = new Set<string>();
  const sources = [
    context.allowedClientName,
    context.coachName ?? "",
    context.organisationName ?? "",
    ...(context.authorisedNames ?? []),
  ];
  for (const source of sources) {
    for (const token of personNameTokens(source)) {
      authorised.add(token);
    }
  }
  return authorised;
}

function collectCandidateNames(context: RelationshipIsolationContext): string[] {
  const allowed = normalisePersonNameText(context.allowedClientName);
  const names = [
    ...context.knownOtherNames,
    ...(context.otherNameAliases ?? []),
  ];
  return names.filter(name => {
    const normalised = normalisePersonNameText(name);
    return Boolean(normalised) && normalised !== allowed;
  });
}

function textsToScan(
  generatedText: string,
  fieldTexts?: RelationshipIsolationContext["fieldTexts"]
): Array<{ fieldName: string; text: string }> {
  if (fieldTexts) {
    const entries = Object.entries(fieldTexts)
      .map(([fieldName, text]) => ({
        fieldName,
        text: typeof text === "string" ? text : "",
      }))
      .filter(entry => entry.text.trim());
    if (entries.length > 0) return entries;
  }
  return [{ fieldName: "raw_output", text: generatedText }];
}

/**
 * Graded relationship-isolation check.
 * Only `definite_cross_client` should hard-block without retry.
 * `possible_cross_client` may trigger one stricter retry before failing.
 */
export function validateRelationshipIsolation(
  generatedText: string,
  context: RelationshipIsolationContext
): RelationshipIsolationResult {
  if (!generatedText?.trim()) {
    return { status: "pass" };
  }

  const authorisedTokens = buildAuthorisedTokenSet(context);
  const candidates = collectCandidateNames(context);
  if (candidates.length === 0) {
    return { status: "pass" };
  }

  let bestPossible: RelationshipIsolationResult | null = null;

  for (const { fieldName, text } of textsToScan(generatedText, context.fieldTexts)) {
    const haystackTokens = personNameTokens(text);
    if (haystackTokens.length === 0) continue;

    for (const candidate of candidates) {
      const candidateTokens = personNameTokens(candidate);
      if (candidateTokens.length === 0) continue;

      const significant = candidateTokens.filter(
        token =>
          token.length >= MIN_NAME_TOKEN_LENGTH && !authorisedTokens.has(token)
      );

      // Full multi-token name (or remaining significant multi-token form).
      if (
        candidateTokens.length >= 2 &&
        containsContiguousTokens(haystackTokens, candidateTokens)
      ) {
        // Skip when every significant token is already authorised (e.g. grounded
        // in current-relationship evidence). Preserve blocking when any
        // significant token is not authorised.
        const ungrounded = candidateTokens.filter(
          token =>
            token.length >= MIN_NAME_TOKEN_LENGTH &&
            !authorisedTokens.has(token)
        );
        if (ungrounded.length === 0) {
          continue;
        }
        const matchType: IsolationMatchType =
          context.otherNameAliases?.includes(candidate) ? "alias" : "full_name";
        return {
          status: "definite_cross_client",
          matchType,
          fieldName,
          diagnosticSnippet:
            process.env.NODE_ENV === "production"
              ? undefined
              : safeDiagnosticSnippet(text, candidateTokens.join(" ")),
        };
      }

      if (
        significant.length >= 2 &&
        containsContiguousTokens(haystackTokens, significant)
      ) {
        return {
          status: "definite_cross_client",
          matchType: "full_name",
          fieldName,
          diagnosticSnippet:
            process.env.NODE_ENV === "production"
              ? undefined
              : safeDiagnosticSnippet(text, significant.join(" ")),
        };
      }

      for (const token of significant) {
        if (!haystackTokens.includes(token)) continue;

        const matchType = classifySingleToken(token);
        const status = statusForMatchType(matchType);
        const result: RelationshipIsolationResult = {
          status,
          matchType,
          fieldName,
          diagnosticSnippet:
            process.env.NODE_ENV === "production"
              ? undefined
              : safeDiagnosticSnippet(text, token),
        };

        if (status === "definite_cross_client") {
          return result;
        }
        if (!bestPossible) {
          bestPossible = result;
        }
      }
    }
  }

  return bestPossible ?? { status: "pass" };
}

/**
 * Backward-compatible boolean guard.
 * True for definite or possible matches (conservative for non-retry callers).
 */
export function containsUnexpectedPersonName(
  generatedText: string,
  allowedName: string,
  knownOtherNames: string[]
): boolean {
  const result = validateRelationshipIsolation(generatedText, {
    allowedClientName: allowedName,
    knownOtherNames,
  });
  return result.status !== "pass";
}

export function validateGeneratedJourney(input: {
  coacheeName: string;
  text: string;
  knownOtherNames?: string[];
}): { valid: true } | { valid: false; reason: string } {
  const others = input.knownOtherNames ?? [];
  if (
    containsUnexpectedPersonName(input.text, input.coacheeName, others)
  ) {
    return {
      valid: false,
      reason: "Generated text refers to a person outside the active relationship.",
    };
  }
  return { valid: true };
}

/** Extract string fields from a preparation-style JSON payload for field attribution. */
export function preparationOutputFieldTexts(
  outputText: string
): Record<string, string> {
  const fields: Record<string, string> = {};
  try {
    const start = outputText.indexOf("{");
    const end = outputText.lastIndexOf("}");
    if (start < 0 || end <= start) {
      return { raw_output: outputText };
    }
    const parsed = JSON.parse(outputText.slice(start, end + 1)) as Record<
      string,
      unknown
    >;
    const assign = (key: string, value: unknown) => {
      if (typeof value === "string" && value.trim()) {
        fields[key] = value;
      } else if (Array.isArray(value)) {
        const joined = value
          .filter((item): item is string => typeof item === "string")
          .join("\n");
        if (joined.trim()) fields[key] = joined;
      }
    };
    assign("previousConversation", parsed.previousConversation);
    assign("outstandingActions", parsed.outstandingActions);
    assign("possibleFocus", parsed.possibleFocus);
    assign("purposeSuggestion", parsed.purposeSuggestion);
    assign("topicsToExplore", parsed.topicsToExplore);
    assign("suggestedQuestions", parsed.suggestedQuestions);
    assign("desiredOutcomeSuggestion", parsed.desiredOutcomeSuggestion);
    if (
      parsed.coachingGuidance &&
      typeof parsed.coachingGuidance === "object" &&
      !Array.isArray(parsed.coachingGuidance)
    ) {
      const guidance = parsed.coachingGuidance as Record<string, unknown>;
      assign("coachingGuidance.framework", guidance.framework);
      assign("coachingGuidance.considerations", guidance.considerations);
    }
  } catch {
    return { raw_output: outputText };
  }
  if (Object.keys(fields).length === 0) {
    return { raw_output: outputText };
  }
  return fields;
}

export function logRelationshipIsolationRejection(input: {
  coachId: string;
  relationshipId: string;
  sessionId: string;
  attempt: number;
  matchType?: IsolationMatchType;
  fieldName?: string;
  retryAttempted: boolean;
  requestId?: string | null;
  diagnosticSnippet?: string;
  /** Safe ops flag — never log the token value itself in production. */
  tokenInAuthorisedEvidence?: boolean;
}): void {
  const payload: Record<string, unknown> = {
    event: "relationship_isolation_rejection",
    operation: "prepare_coaching_intelligence",
    coachId: input.coachId,
    relationshipId: input.relationshipId,
    sessionId: input.sessionId,
    attempt: input.attempt,
    matchType: input.matchType ?? null,
    fieldName: input.fieldName ?? null,
    retryAttempted: input.retryAttempted,
    requestId: input.requestId ?? null,
    tokenInAuthorisedEvidence: Boolean(input.tokenInAuthorisedEvidence),
  };

  if (process.env.NODE_ENV !== "production" && input.diagnosticSnippet) {
    payload.diagnosticSnippet = input.diagnosticSnippet;
  }

  console.error("[relationship-isolation]", payload);
}

/**
 * Cache / query keys — always include user, organisation, relationship,
 * and conversation/evidence revision where applicable.
 */
export function getJourneyQueryKey(
  coachId: string,
  relationshipId: string,
  organisationId = ""
): readonly ["journey", string, string, string] {
  return ["journey", coachId, organisationId, relationshipId] as const;
}

export function getPrepareQueryKey(
  coachId: string,
  relationshipId: string,
  conversationId: string,
  evidenceRevision = "",
  organisationId = ""
): readonly ["prepare", string, string, string, string, string] {
  return [
    "prepare",
    coachId,
    organisationId,
    relationshipId,
    conversationId,
    evidenceRevision,
  ] as const;
}

export function getDevelopmentQueryKey(
  coachId: string,
  relationshipId: string,
  organisationId = ""
): readonly ["development", string, string, string] {
  return ["development", coachId, organisationId, relationshipId] as const;
}

export function getHistoryQueryKey(
  coachId: string,
  relationshipId: string,
  organisationId = ""
): readonly ["history", string, string, string] {
  return ["history", coachId, organisationId, relationshipId] as const;
}

export function getReportsQueryKey(
  coachId: string,
  relationshipId: string,
  organisationId = ""
): readonly ["reports", string, string, string] {
  return ["reports", coachId, organisationId, relationshipId] as const;
}

export const RELATIONSHIP_ISOLATION_FAILSAFE_TITLE =
  "Journey temporarily unavailable";

export const RELATIONSHIP_ISOLATION_FAILSAFE_BODY =
  "Could not safely confirm that all development evidence belongs to this coaching relationship. No information has been displayed.";

export const RELATIONSHIP_AI_PROMPT_RULE = `Use only evidence supplied for the named coaching relationship.
Do not refer to any person not identified in the supplied relationship context.`;

export function buildRelationshipIsolationPromptBlock(
  clientDisplayName: string
): string {
  return [
    "RELATIONSHIP ISOLATION",
    "",
    "Use evidence only from the named coaching relationship.",
    "",
    "The client for this request is:",
    clientDisplayName,
    "",
    "Do not mention, compare with, refer to or infer information about any other person.",
    "",
    "Do not use names from examples, prior requests, other relationships, test data or general memory.",
    "",
    "If the supplied evidence contains another person’s name outside the authorised relationship context, omit it.",
    "",
    "Return no names other than the named client, the coach where explicitly required, or authorised organisational names.",
    "",
    "Do not include this block in user-visible output.",
  ].join("\n");
}

export function buildIsolationRetryPromptAddon(
  clientDisplayName: string
): string {
  return [
    "STRICT RELATIONSHIP-ISOLATION RETRY",
    "",
    `Refer only to the named client: ${clientDisplayName}.`,
    "Do not mention any other person.",
    "Do not introduce examples or names.",
    "Return structured JSON only.",
  ].join("\n");
}
