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

/**
 * Person-centred overview: who this person is as a professional in development,
 * grounded in evidence — never inferred from existence alone.
 */
export function buildPersonSummary(input: {
  name: string;
  currentPosition?: string | null;
  strengths?: string[];
  priorities?: string[];
  direction?: string | null;
  completedConversationCount?: number;
}): string {
  const firstName = input.name.trim().split(/\s+/)[0] || "This person";
  const count = input.completedConversationCount ?? 0;
  const strengths = (input.strengths ?? [])
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 2);
  const priorities = (input.priorities ?? [])
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 2);
  const hasPosition = Boolean(input.currentPosition?.trim());
  const hasDirection = Boolean(input.direction?.trim());
  const hasEvidenceSignals =
    count > 0 ||
    hasPosition ||
    hasDirection ||
    strengths.length > 0 ||
    priorities.length > 0;

  // NO EVIDENCE = NO CLAIMS
  if (!hasEvidenceSignals) {
    return "There isn’t enough development evidence yet to describe a pattern.";
  }

  const opener =
    count >= 4
      ? `Across the development history, a consistent picture of ${firstName} is emerging.`
      : count >= 2
        ? `Evidence from recent conversations indicates how ${firstName} is developing.`
        : `Current evidence suggests how ${firstName} is developing.`;

  const position = limitSentences(
    input.currentPosition?.trim() ||
      input.direction?.trim() ||
      "",
    2
  );

  const positionLine = position;

  const strengthLine =
    strengths.length > 0
      ? `Notable strengths include ${joinUk(strengths)}.`
      : "";
  const priorityLine =
    priorities.length > 0
      ? `Development attention is currently useful around ${joinUk(priorities)}.`
      : "";

  const text = [opener, positionLine, strengthLine, priorityLine]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  // Soft word budget ~100–120 words.
  const words = text.split(/\s+/);
  if (words.length <= 120) return text;
  return `${words.slice(0, 120).join(" ").replace(/[,:;]?$/, "")}.`;
}

function joinUk(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
