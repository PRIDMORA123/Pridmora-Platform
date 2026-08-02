/**
 * Pure display normalisation for session workspace UI.
 * Never mutates stored preparation or session content.
 */

const FOCUS_MAX = 180;
const TITLE_MAX = 70;
const TOPIC_LABEL_MAX = 48;

export function deduplicateDisplayValues(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    const trimmed = raw.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase("en-GB");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

export function isQuestionLikeValue(value: string): boolean {
  const cleaned = value.trim();
  if (!cleaned) return false;
  if (cleaned.endsWith("?")) return true;
  return /^(what|how|why|when|where|who|which|could|would|can|do|does|did|is|are|will)\b/i.test(
    cleaned
  );
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n|;/)
    .map(line => line.replace(/^[-*•]\s*/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

function firstCompleteSentence(text: string): string {
  const normalised = text.replace(/\s+/g, " ").trim();
  if (!normalised) return "";

  const match = normalised.match(/^(.+?[.!?])(?:\s|$)/);
  if (match?.[1]) return match[1].trim();
  return normalised;
}

function truncateAtWordBoundary(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;

  const slice = trimmed.slice(0, maxLength + 1);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace < Math.floor(maxLength * 0.5)) {
    return trimmed.slice(0, maxLength).trimEnd();
  }
  return slice.slice(0, lastSpace).trimEnd();
}

/**
 * One concise primary focus sentence for display.
 * Preserves meaning; does not invent facts; does not alter stored source.
 */
export function getConciseSessionFocus(input: {
  purpose?: string | null;
  focus?: string | null;
  exploration?: string | null;
  clientFirstName?: string | null;
}): string {
  const candidates = deduplicateDisplayValues([
    input.purpose ?? "",
    input.focus ?? "",
    input.exploration ?? "",
  ]).filter(value => !isQuestionLikeValue(value) || value.length < 120);

  if (candidates.length === 0) {
    return "Support the conversation with clear attention to what matters most.";
  }

  let focus = firstCompleteSentence(candidates[0]);

  // Prefer a purpose-like sentence over a long exploration paragraph.
  for (const candidate of candidates) {
    const sentence = firstCompleteSentence(candidate);
    if (sentence.length > 0 && sentence.length <= FOCUS_MAX) {
      focus = sentence;
      break;
    }
  }

  focus = truncateAtWordBoundary(focus, FOCUS_MAX);

  const firstName = input.clientFirstName?.trim();
  if (
    firstName &&
    focus.toLocaleLowerCase("en-GB").includes("the client") &&
    !focus.toLocaleLowerCase("en-GB").includes(firstName.toLocaleLowerCase("en-GB"))
  ) {
    focus = focus.replace(/\bthe client\b/gi, firstName);
  }

  return focus;
}

function toTopicLabel(value: string): string {
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (cleaned.length <= TOPIC_LABEL_MAX) return cleaned;

  // Prefer a short clause before punctuation.
  const clause = cleaned.split(/[:.—–-]/)[0]?.trim() ?? cleaned;
  if (clause.length > 0 && clause.length <= TOPIC_LABEL_MAX) return clause;

  return truncateAtWordBoundary(cleaned, TOPIC_LABEL_MAX);
}

/**
 * Up to three concise topic labels for the default brief.
 * Long stored topics remain unchanged in source; only labels are derived.
 */
export function getDisplayTopics(
  topics: string | string[] | null | undefined,
  options?: { max?: number; excludeQuestions?: boolean }
): Array<{ label: string; original: string }> {
  const max = options?.max ?? 3;
  const excludeQuestions = options?.excludeQuestions ?? true;
  const source = Array.isArray(topics)
    ? topics
    : splitLines(topics ?? "");

  const items = deduplicateDisplayValues(source)
    .filter(value => !(excludeQuestions && isQuestionLikeValue(value)))
    .map(original => ({
      label: toTopicLabel(original),
      original,
    }));

  // If filtering removed everything, fall back without question filter.
  if (items.length === 0 && source.length > 0) {
    return deduplicateDisplayValues(source)
      .slice(0, max)
      .map(original => ({
        label:
          original.length > TOPIC_LABEL_MAX
            ? "Current coaching focus"
            : original,
        original,
      }));
  }

  return items.slice(0, max).map(item => ({
    label:
      item.label.length === 0 ||
      (item.original.length > TOPIC_LABEL_MAX * 2 &&
        item.label === truncateAtWordBoundary(item.original, TOPIC_LABEL_MAX) &&
        !/[a-z]/i.test(item.label.slice(0, 3)))
        ? "Current coaching focus"
        : item.label || "Current coaching focus",
    original: item.original,
  }));
}

export function getDisplayQuestions(
  questions: string | string[] | null | undefined,
  options?: { max?: number }
): string[] {
  const max = options?.max ?? 3;
  const source = Array.isArray(questions)
    ? questions
    : (() => {
        const trimmed = (questions ?? "").trim();
        if (!trimmed) return [];

        const byParagraph = trimmed
          .split(/\n\s*\n/)
          .map(item => item.trim())
          .filter(Boolean);

        const expanded = byParagraph.flatMap(paragraph => {
          const lines = splitLines(paragraph);
          if (lines.length > 1 && lines.every(line => isQuestionLikeValue(line))) {
            return lines;
          }
          return [paragraph];
        });

        if (expanded.length > 1) return expanded;

        const byLine = splitLines(trimmed);
        if (byLine.length > 1) return byLine;
        return [trimmed];
      })();

  return deduplicateDisplayValues(source).slice(0, max);
}

export function getAllDisplayQuestions(
  questions: string | string[] | null | undefined
): string[] {
  return getDisplayQuestions(questions, { max: 100 });
}

export function getSessionSequenceLabel(input: {
  sessionNumber?: number | null;
  totalSessions?: number | null;
}): string {
  const number =
    typeof input.sessionNumber === "number" && input.sessionNumber > 0
      ? input.sessionNumber
      : null;
  const total =
    typeof input.totalSessions === "number" && input.totalSessions > 0
      ? input.totalSessions
      : null;

  if (number && total) return `Session ${number} of ${total}`;
  if (number) return `Session ${number}`;
  return "Current session";
}

/**
 * Short display-only session title. Does not persist.
 */
export function getSessionDisplayTitle(input: {
  title?: string | null;
  focus?: string | null;
  purpose?: string | null;
  sessionNumber?: number | null;
}): string {
  const explicit = input.title?.trim();
  if (explicit) {
    return truncateAtWordBoundary(explicit, TITLE_MAX);
  }

  const fromFocus = getConciseSessionFocus({
    purpose: input.purpose,
    focus: input.focus,
  });

  if (
    fromFocus &&
    fromFocus !==
      "Support the conversation with clear attention to what matters most."
  ) {
    return truncateAtWordBoundary(fromFocus, TITLE_MAX);
  }

  if (input.sessionNumber && input.sessionNumber > 0) {
    return `Development conversation ${input.sessionNumber}`;
  }

  return "Current session";
}

export function getClientFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first || fullName.trim();
}

export function formatSessionDateLabel(
  date?: string | null,
  time?: string | null
): string {
  const dateValue = (date ?? "").trim();
  const timeValue = (time ?? "").trim();

  if (!dateValue || /not scheduled|schedule/i.test(dateValue)) {
    return "Date not set";
  }

  const timeMatch = timeValue.match(/^(\d{1,2}):(\d{2})$/);
  const candidate = timeMatch
    ? `${dateValue}T${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}:00`
    : /^\d{4}-\d{2}-\d{2}/.test(dateValue)
      ? `${dateValue.slice(0, 10)}T00:00:00`
      : dateValue;

  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    return timeValue ? `${dateValue} · ${timeValue}` : dateValue;
  }

  const datePart = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);

  if (!timeMatch) return datePart;

  const timePart = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);

  return `${datePart} · ${timePart}`;
}
