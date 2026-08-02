/**
 * Display-only normalisation for Prepare briefing content.
 * Does not mutate stored preparation output.
 */

export type NormalisedPreparationBrief = {
  primaryFocus: string;
  areasToExplore: string[];
  questions: string[];
  previousCommitment?: string | null;
  relevantPatterns: Array<{
    title: string;
    description: string;
    evidenceLabel?: string | null;
  }>;
  developmentDirection?: string | null;
  historicalContext: Array<{
    title: string;
    detail: string;
  }>;
};

export type NormalisePreparationBriefInput = {
  primaryFocus?: string | null;
  areasToExplore?: string[] | string | null;
  questions?: string[] | string | null;
  previousCommitment?: string | null;
  relevantPatterns?: Array<{
    title?: string | null;
    description?: string | null;
    basis?: string | null;
    evidenceLabel?: string | null;
  }> | null;
  developmentDirection?: string | null;
  historicalContext?: Array<{
    title?: string | null;
    detail?: string | null;
  }> | null;
  coachingPurpose?: string | null;
  clientFirstName?: string | null;
  mode?: "manual" | "assisted" | "comprehensive";
  isFirstSession?: boolean;
  hasApprovedEvidence?: boolean;
};

const PRIMARY_FOCUS_MAX_WORDS = 70;
const DEVELOPMENT_MAX_WORDS = 60;
const MAX_AREAS = 3;
const MAX_QUESTIONS = 4;
const MAX_PATTERNS = 2;
const MAX_HISTORICAL = 3;
const STRONG_OVERLAP = 0.72;

const GENERIC_PURPOSE_PREFIXES = [
  /^given the stated coaching purpose[,:]?\s*/i,
  /^based on the (?:stated )?coaching purpose[,:]?\s*/i,
  /^in light of the (?:stated )?coaching purpose[,:]?\s*/i,
  /^given the coaching purpose[,:]?\s*/i,
];

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripListPrefix(value: string): string {
  return value
    .replace(/^[-*•–—]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
}

function comparisonKey(value: string): string {
  return collapseSpaces(value)
    .toLocaleLowerCase("en-GB")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(
    comparisonKey(value)
      .split(" ")
      .filter(token => token.length > 2)
  );
}

function wordCount(value: string): number {
  return collapseSpaces(value).split(" ").filter(Boolean).length;
}

function trimToWordLimit(value: string, maxWords: number): string {
  const words = collapseSpaces(value).split(" ").filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");

  // Prefer a complete sentence within the limit.
  const sentences = collapseSpaces(value).match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [
    value,
  ];
  let built = "";
  for (const sentence of sentences) {
    const next = collapseSpaces(`${built} ${sentence}`);
    if (wordCount(next) > maxWords) break;
    built = next;
  }
  if (built && /[.!?]$/.test(built)) return built;

  // Fall back to whole words ending on a sentence boundary if possible.
  const sliced = words.slice(0, maxWords).join(" ");
  const lastStop = Math.max(
    sliced.lastIndexOf("."),
    sliced.lastIndexOf("!"),
    sliced.lastIndexOf("?")
  );
  if (lastStop > Math.floor(sliced.length * 0.45)) {
    return sliced.slice(0, lastStop + 1).trim();
  }
  return sliced;
}

function removeIncompleteTrailingFragment(value: string): string {
  let text = collapseSpaces(value);
  if (!text) return "";

  // Drop trailing ellipsis / cut-off markers.
  text = text.replace(/\u2026+$/g, "").replace(/\.{2,}$/g, "").trim();

  // Incomplete trailing token like "accountability p" or "the session"
  if (/[.!?]$/.test(text)) return text;

  const words = text.split(" ");
  const last = words[words.length - 1] ?? "";
  if (last.length <= 2 && words.length > 1) {
    words.pop();
    text = words.join(" ");
  }

  // If still unfinished and long, keep the last complete sentence.
  if (!/[.!?]$/.test(text)) {
    const match = text.match(/^(.+[.!?])(?:\s+\S+)*$/);
    if (match?.[1] && wordCount(match[1]) >= 4) {
      return match[1].trim();
    }
  }

  return text;
}

function stripGenericPurposePreamble(value: string): string {
  let text = collapseSpaces(value);
  for (const pattern of GENERIC_PURPOSE_PREFIXES) {
    text = text.replace(pattern, "");
  }
  // Capitalise the remainder if we stripped a preamble.
  if (text && text[0] === text[0].toLocaleLowerCase("en-GB")) {
    text = text[0].toLocaleUpperCase("en-GB") + text.slice(1);
  }
  return text;
}

function firstCompleteSentence(value: string): string {
  const normalised = collapseSpaces(value);
  if (!normalised) return "";
  const match = normalised.match(/^(.+?[.!?])(?:\s|$)/);
  return (match?.[1] ?? normalised).trim();
}

function splitItems(value: string[] | string | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap(item => splitItems(item));
  }

  const raw = value.replace(/\r\n/g, "\n").trim();
  if (!raw) return [];

  const byParagraph = raw
    .split(/\n\s*\n/)
    .map(item => item.trim())
    .filter(Boolean);

  const expand = (block: string): string[] => {
    const lines = block
      .split(/\n|;/)
      .map(line => stripListPrefix(collapseSpaces(line)))
      .filter(Boolean);
    if (lines.length > 1) return lines;
    return [stripListPrefix(collapseSpaces(block))];
  };

  if (byParagraph.length > 1) {
    return byParagraph.flatMap(expand);
  }

  return expand(raw);
}

function dedupeExact(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = comparisonKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

export function isStrongDuplicate(a: string, b: string): boolean {
  const left = comparisonKey(a);
  const right = comparisonKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) {
    const shorter = Math.min(left.length, right.length);
    const longer = Math.max(left.length, right.length);
    if (shorter / longer >= 0.85) return true;
  }

  const aTokens = tokenSet(a);
  const bTokens = tokenSet(b);
  if (aTokens.size === 0 || bTokens.size === 0) return false;

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  const ratio = overlap / Math.min(aTokens.size, bTokens.size);
  return ratio >= STRONG_OVERLAP;
}

function replaceClientPlaceholder(
  value: string,
  clientFirstName?: string | null
): string {
  const firstName = clientFirstName?.trim();
  if (!firstName) return value;
  if (!/\bthe client\b/i.test(value)) return value;
  if (value.toLocaleLowerCase("en-GB").includes(firstName.toLocaleLowerCase("en-GB"))) {
    return value;
  }
  return value.replace(/\bthe client\b/gi, firstName);
}

function cleanSentence(
  value: string,
  options?: { maxWords?: number; stripPurposePreamble?: boolean }
): string {
  let text = collapseSpaces(value);
  if (!text) return "";
  if (options?.stripPurposePreamble !== false) {
    text = stripGenericPurposePreamble(text);
  }
  text = removeIncompleteTrailingFragment(text);
  text = collapseSpaces(text);
  if (options?.maxWords) {
    text = trimToWordLimit(text, options.maxWords);
  }
  return text;
}

function filterAgainst(
  items: string[],
  rivals: string[],
  options?: { max?: number }
): string[] {
  const max = options?.max ?? items.length;
  const result: string[] = [];
  for (const item of items) {
    if (result.length >= max) break;
    if (rivals.some(rival => isStrongDuplicate(item, rival))) continue;
    if (result.some(existing => isStrongDuplicate(item, existing))) continue;
    result.push(item);
  }
  return result;
}

function defaultFirstSessionFocus(clientFirstName?: string | null): string {
  const name = clientFirstName?.trim() || "the coachee";
  return `Clarify what ${name} wants to change in their approach.`;
}

function defaultFirstSessionAreas(clientFirstName?: string | null): string[] {
  const name = clientFirstName?.trim();
  const subject = name || "they";
  const managers = name ? `${name}'s managers` : "their managers";
  return [
    `How ${subject} currently leads when performance is under pressure.`,
    `Decisions that should increasingly remain with ${managers}.`,
    "What makes stepping back difficult.",
  ];
}

function defaultFirstSessionQuestions(): string[] {
  return [
    "What would make this conversation useful today?",
    "Where does your involvement currently add the most value?",
    "Where might it unintentionally limit management ownership?",
    "What would you like to do differently after this conversation?",
  ];
}

/**
 * Build a display-ready preparation brief without mutating stored source data.
 */
export function normalisePreparationBrief(
  input: NormalisePreparationBriefInput
): NormalisedPreparationBrief {
  const mode = input.mode ?? "assisted";
  const purpose = cleanSentence(input.coachingPurpose ?? "", {
    stripPurposePreamble: false,
  });

  let primaryFocus = cleanSentence(
    input.primaryFocus ||
      (input.isFirstSession ? defaultFirstSessionFocus(input.clientFirstName) : "") ||
      purpose,
    { maxWords: PRIMARY_FOCUS_MAX_WORDS }
  );
  primaryFocus = replaceClientPlaceholder(primaryFocus, input.clientFirstName);
  if (!primaryFocus) {
    primaryFocus = input.isFirstSession
      ? defaultFirstSessionFocus(input.clientFirstName)
      : "Support the conversation with clear attention to what matters most.";
  }
  // Prefer a single complete sentence for primary focus.
  primaryFocus = firstCompleteSentence(primaryFocus) || primaryFocus;
  primaryFocus = replaceClientPlaceholder(primaryFocus, input.clientFirstName);

  const rawAreas = dedupeExact(
    splitItems(input.areasToExplore).map(item =>
      replaceClientPlaceholder(
        cleanSentence(item, { stripPurposePreamble: true }),
        input.clientFirstName
      )
    )
  ).filter(Boolean);

  let areasToExplore = filterAgainst(rawAreas, [primaryFocus, purpose], {
    max: MAX_AREAS,
  });

  if (areasToExplore.length === 0 && input.isFirstSession) {
    areasToExplore = defaultFirstSessionAreas(input.clientFirstName);
  }

  const rawQuestions = dedupeExact(
    splitItems(input.questions).map(item => {
      let question = cleanSentence(item, { stripPurposePreamble: true });
      question = replaceClientPlaceholder(question, input.clientFirstName);
      if (question && !/[?]$/.test(question) && /^(what|how|why|when|where|who|which|could|would|can|do|does|did|is|are|will)\b/i.test(question)) {
        question = `${question}?`;
      }
      return question;
    })
  ).filter(Boolean);

  let previousCommitment = input.previousCommitment?.trim()
    ? cleanSentence(input.previousCommitment, { stripPurposePreamble: true })
    : null;
  if (previousCommitment && isStrongDuplicate(previousCommitment, primaryFocus)) {
    previousCommitment = null;
  }

  let questions = filterAgainst(
    rawQuestions,
    [primaryFocus, purpose, previousCommitment ?? "", ...areasToExplore],
    { max: MAX_QUESTIONS }
  );

  if (questions.length === 0 && input.isFirstSession) {
    questions = defaultFirstSessionQuestions();
  }

  // Areas must not duplicate questions.
  areasToExplore = filterAgainst(areasToExplore, questions, { max: MAX_AREAS });

  const patternsSource = (input.relevantPatterns ?? [])
    .map(pattern => {
      const title = cleanSentence(pattern.title ?? "", {
        stripPurposePreamble: true,
      });
      const description = cleanSentence(
        pattern.description || pattern.basis || "",
        { stripPurposePreamble: true }
      );
      if (!title && !description) return null;
      return {
        title: title || "Relevant pattern",
        description,
        evidenceLabel: pattern.evidenceLabel?.trim() || null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  let developmentDirection = input.developmentDirection?.trim()
    ? cleanSentence(input.developmentDirection, {
        maxWords: DEVELOPMENT_MAX_WORDS,
        stripPurposePreamble: true,
      })
    : null;

  const relevantPatterns: NormalisedPreparationBrief["relevantPatterns"] = [];
  for (const pattern of patternsSource) {
    if (relevantPatterns.length >= MAX_PATTERNS) break;
    if (isStrongDuplicate(pattern.description || pattern.title, primaryFocus)) {
      continue;
    }
    if (
      developmentDirection &&
      isStrongDuplicate(pattern.description || pattern.title, developmentDirection)
    ) {
      continue;
    }
    if (
      relevantPatterns.some(
        existing =>
          isStrongDuplicate(existing.title, pattern.title) ||
          isStrongDuplicate(
            existing.description || existing.title,
            pattern.description || pattern.title
          )
      )
    ) {
      continue;
    }
    relevantPatterns.push(pattern);
  }

  if (
    developmentDirection &&
    (isStrongDuplicate(developmentDirection, primaryFocus) ||
      relevantPatterns.some(pattern =>
        isStrongDuplicate(
          pattern.description || pattern.title,
          developmentDirection!
        )
      ))
  ) {
    developmentDirection = null;
  }

  const historicalContext = (input.historicalContext ?? [])
    .map(item => {
      const title = cleanSentence(item.title ?? "", { stripPurposePreamble: true });
      const detail = cleanSentence(item.detail ?? "", {
        stripPurposePreamble: true,
      });
      if (!title && !detail) return null;
      return {
        title: title || "Earlier context",
        detail,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter(
      item =>
        !isStrongDuplicate(item.detail || item.title, primaryFocus) &&
        !isStrongDuplicate(item.detail || item.title, purpose)
    )
    .slice(0, MAX_HISTORICAL);

  if (mode === "manual") {
    return {
      primaryFocus: "",
      areasToExplore: [],
      questions: [],
      previousCommitment: previousCommitment,
      relevantPatterns: [],
      developmentDirection: null,
      historicalContext: [],
    };
  }

  return {
    primaryFocus,
    areasToExplore,
    questions,
    previousCommitment: previousCommitment || null,
    relevantPatterns: mode === "comprehensive" ? relevantPatterns : [],
    developmentDirection:
      mode === "comprehensive" ? developmentDirection : null,
    historicalContext: mode === "comprehensive" ? historicalContext : [],
  };
}
