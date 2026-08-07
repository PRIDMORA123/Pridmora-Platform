/**
 * Display-only helpers for executive-length Development Intelligence copy.
 * Does not mutate stored evidence or intelligence records.
 */

export function limitSentences(text: string, maxSentences: number): string {
  const trimmed = text.trim();
  if (!trimmed || maxSentences <= 0) return trimmed;
  const parts = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!parts || parts.length <= maxSentences) return trimmed;
  return parts
    .slice(0, maxSentences)
    .map(part => part.trim())
    .join(" ")
    .trim();
}

export function limitToOneSentence(text: string): string {
  return limitSentences(text, 1);
}

/** Build a person-first overview summary from approved development signals. */
export function buildPersonSummary(input: {
  name: string;
  currentPosition?: string | null;
  strengths?: string[];
  priorities?: string[];
  direction?: string | null;
}): string {
  const firstName = input.name.trim().split(/\s+/)[0] || "This person";
  const position = limitSentences(
    input.currentPosition?.trim() ||
      input.direction?.trim() ||
      `${firstName} is in an active development relationship.`,
    2
  );
  const strengths = (input.strengths ?? [])
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 2);
  const priorities = (input.priorities ?? [])
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 2);

  const strengthLine =
    strengths.length > 0
      ? `Strengths currently evidenced include ${joinUk(strengths)}.`
      : "";
  const priorityLine =
    priorities.length > 0
      ? `Current development priorities include ${joinUk(priorities)}.`
      : "";
  const directionLine = input.direction?.trim()
    ? limitSentences(input.direction.trim(), 1)
    : "";

  return [position, strengthLine, priorityLine, directionLine]
    .filter(Boolean)
    .join(" ")
    .trim()
    .slice(0, 900);
}

function joinUk(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
