export const DEVELOPMENT_UPDATE_SYSTEM_PROMPT = `You are assisting a qualified coach in maintaining a living development profile.

Do not generate a list of disconnected observations.

Compare the latest coaching conversation with the person’s existing development profile.

Suggest only meaningful changes that would improve preparation for future conversations.

Distinguish between:
- new information
- strengthened existing information
- information that should remain unchanged

Do not infer personality traits, diagnoses or fixed characteristics.

Use cautious, evidence-based British English.

Narrative quality:
- Write like an experienced UK leadership-development professional.
- Use complete sentences. Do not concatenate raw notes into prose.
- When a point is self-reported, say so. When evidence is uncertain, say so.
- Do not elevate one dramatic comment into the person’s identity.
- Rank themes by developmental significance and evidence strength across the history, not by emotional intensity alone.
- Prefer shorter clear sentences. Avoid em dashes as a writing habit.

Rules:
- Do not diagnose.
- Do not assign personality types.
- Do not make absolute statements.
- Do not invent unsupported psychological conclusions.
- Do not duplicate content already present in the living profile unless strengthening status.
- Do not propose the same developmental idea in more than one of currentFocus, emergingThemes, and growthAreas. Choose the single most appropriate field.
- Do not propose changes where evidence is weak.
- Prefer an empty proposedChanges object when nothing meaningful has changed.
- Use only evidence supplied for the named coaching relationship.
- Do not refer to any person not identified in the supplied relationship context.
- Use UK English spelling (organisation, behaviour, prioritise, recognise, analyse).
- Status values must be one of: emerging, supported, well_established.
- Put evidence status only in the status field. Never write [emerging], [supported] or [well_established] inside value/reason prose.
- emerging = early, single, or indirect evidence.
- supported = repeated, direct behavioural evidence across more than one occasion.
- well_established = sustained across conversations; do not downgrade it without clear contradictory evidence.
- Beliefs and other inferred internal constructs are more cautious than observed behaviour. Prefer emerging when the belief is implied by behaviour rather than directly stated. Do not mark a belief supported solely because behaviour could imply it.
- For proposedChanges add/update items use objects shaped as { "value": "...", "status": "emerging", "reason": "..." }.
- Do not use { "from": "...", "to": "..." } for profile updates — put the new wording in "value".
- Return valid JSON only.

Return ONLY valid JSON matching this shape:
{
  "conversationSummary": "short summary of the conversation",
  "hasMeaningfulChanges": true,
  "proposedChanges": {
    "currentFocus": {
      "action": "replace",
      "value": "...",
      "reason": "..."
    },
    "strengths": { "add": [], "update": [], "remove": [] },
    "values": { "add": [], "update": [], "remove": [] },
    "motivators": { "add": [], "update": [], "remove": [] },
    "emergingThemes": { "add": [], "update": [], "remove": [] },
    "growthAreas": { "add": [], "update": [], "remove": [] },
    "coachingPreferences": { "add": [], "update": [], "remove": [] },
    "beliefs": { "add": [], "update": [], "remove": [] },
    "patterns": { "add": [], "update": [], "remove": [] },
    "commitments": { "add": [], "complete": [], "remove": [] }
  },
  "evidence": [
    {
      "changeKey": "emergingThemes.add.0",
      "evidenceText": "...",
      "sourceExcerpt": "..."
    }
  ]
}

If there are no meaningful changes, return:
{
  "conversationSummary": "...",
  "hasMeaningfulChanges": false,
  "proposedChanges": {},
  "evidence": []
}`;

export function buildDevelopmentUpdateInput(input: {
  personContext: string;
  developmentProfile: string;
  previousSessions: string;
  sessionNotes: string;
  approvedSummary: string;
  commitments: string;
  coachReflection: string;
  approvedIntelligence: string;
}): string {
  return [
    "Person context:",
    input.personContext || "(none)",
    "",
    "Existing living development profile:",
    input.developmentProfile || "(empty profile)",
    "",
    "Relevant previous sessions:",
    input.previousSessions || "(none)",
    "",
    "Approved historic intelligence (for context only — do not re-propose as pending items):",
    input.approvedIntelligence || "(none)",
    "",
    "Latest session notes:",
    input.sessionNotes || "(none)",
    "",
    "Session summary:",
    input.approvedSummary || "(none)",
    "",
    "Current commitments from this session:",
    input.commitments || "(none)",
    "",
    "Coach reflection:",
    input.coachReflection || "(none)",
  ].join("\n");
}

export function formatProfileForPrompt(profile: {
  currentFocus: string;
  strengths: Array<{ value: string; status: string }>;
  values: Array<{ value: string; status: string }>;
  motivators: Array<{ value: string; status: string }>;
  emergingThemes: Array<{ value: string; status: string }>;
  growthAreas: Array<{ value: string; status: string }>;
  coachingPreferences: Array<{ value: string; status: string }>;
  beliefs: Array<{ value: string; status: string }>;
  patterns: Array<{ value: string; status: string }>;
  commitments: Array<{ value: string; status: string; dueDate: string | null }>;
}): string {
  const lines: string[] = [];
  lines.push(`Current focus: ${profile.currentFocus || "(none)"}`);

  const sections: Array<[string, Array<{ value: string; status: string }>]> = [
    ["Strengths", profile.strengths],
    ["Values", profile.values],
    ["Motivators", profile.motivators],
    ["Emerging themes", profile.emergingThemes],
    ["Growth areas", profile.growthAreas],
    ["Coaching preferences", profile.coachingPreferences],
    ["Beliefs", profile.beliefs],
    ["Patterns", profile.patterns],
  ];

  for (const [label, entries] of sections) {
    if (entries.length === 0) {
      lines.push(`${label}: (none)`);
      continue;
    }
    lines.push(`${label}:`);
    for (const entry of entries) {
      lines.push(`- ${entry.value} (evidence status: ${entry.status})`);
    }
  }

  if (profile.commitments.length === 0) {
    lines.push("Commitments: (none)");
  } else {
    lines.push("Commitments:");
    for (const commitment of profile.commitments) {
      lines.push(
        `- ${commitment.value} (evidence status: ${commitment.status})${
          commitment.dueDate ? ` due ${commitment.dueDate}` : ""
        }`
      );
    }
  }

  return lines.join("\n");
}
