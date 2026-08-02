const REPLACEMENTS: Array<[RegExp, string]> = [
  [
    /\bEvidence suggests current situation appears to\b/gi,
    "Current evidence indicates",
  ],
  [
    /\bCurrent evidence suggests\b/gi,
    "The available evidence suggests",
  ],
  [
    /\bThe notes do not provide enough evidence to describe\b/gi,
    "There is not yet enough evidence to describe",
  ],
  [
    /\bNo clearly evidenced strengths were identified in these notes\.?/gi,
    "Strengths are still emerging and have not yet been confidently evidenced.",
  ],
  [
    /\bNo actions were explicitly agreed in the notes\.?/gi,
    "No specific commitment has yet been agreed.",
  ],
  [/\bEvidence suggests\b/gi, "The available evidence indicates"],
];

export function cleanJourneyLanguage(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value
  )
    .replace(/\s{2,}/g, " ")
    .trim();
}
