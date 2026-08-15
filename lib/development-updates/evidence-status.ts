import type {
  CategoryChanges,
  DevelopmentProfile,
  EvidenceSummaryItem,
  ProfileEntry,
  ProfileEntryStatus,
  ProfileItemChange,
  ProposedProfileChanges,
} from "@/lib/development-updates/types";

export type DevelopmentUpdateGenerationLike = {
  conversationSummary: string;
  hasMeaningfulChanges: boolean;
  proposedChanges: ProposedProfileChanges;
  evidence: EvidenceSummaryItem[];
};

const STATUS_MARKER_RE =
  /\[\s*(emerging|supported|well[_\s-]?established)\s*\]/gi;

const STATUS_RANK: Record<ProfileEntryStatus, number> = {
  emerging: 1,
  supported: 2,
  well_established: 3,
};

/**
 * Remove literal bracketed evidence-status markers from prose.
 * Status must be shown only via the separate status field/presentation.
 */
export function stripBracketedEvidenceStatusMarkers(value: string): string {
  return value
    .replace(STATUS_MARKER_RE, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function hasDirectBeliefEvidence(...parts: Array<string | undefined>): boolean {
  const text = parts.filter(Boolean).join(" ").toLocaleLowerCase("en-GB");
  if (!text) return false;
  return (
    /\b(i believe|they believe|self[- ]reported belief|said they believe|explicitly said|named the belief|stated the belief)\b/i.test(
      text
    ) ||
    /\bbelief\b.{0,40}\b(said|stated|described|named|self[- ]reported)\b/i.test(
      text
    )
  );
}

function hasIndirectBeliefCue(...parts: Array<string | undefined>): boolean {
  const text = parts.filter(Boolean).join(" ").toLocaleLowerCase("en-GB");
  if (!text) return false;
  return /\b(may|might|appears?|seem(?:s|ed)?|suggests?|implies?|could imply|inferred|inference|perhaps|possibly)\b/i.test(
    text
  );
}

function hasRepeatedBehaviouralEvidence(
  ...parts: Array<string | undefined>
): boolean {
  const text = parts.filter(Boolean).join(" ").toLocaleLowerCase("en-GB");
  if (!text) return false;
  return /\b(again|further|second|third|multiple|repeated|consistently|across (two|both|several|more than one)|more than once|another (example|occasion|meeting))\b/i.test(
    text
  );
}

function hasContradictoryEvidence(...parts: Array<string | undefined>): boolean {
  const text = parts.filter(Boolean).join(" ").toLocaleLowerCase("en-GB");
  if (!text) return false;
  return /\b(contradict|contradicts|no longer|not (the case|evident)|reversed|gone backwards|undermines?|disconfirmed)\b/i.test(
    text
  );
}

function coerceStatus(value: string | undefined): ProfileEntryStatus | undefined {
  if (!value) return undefined;
  const normalised = value.trim().toLocaleLowerCase("en-GB").replace(/[\s-]+/g, "_");
  if (normalised === "emerging") return "emerging";
  if (normalised === "supported") return "supported";
  if (normalised === "well_established") return "well_established";
  return undefined;
}

function stripChangeStrings(entry: ProfileItemChange): ProfileItemChange {
  return {
    ...entry,
    value: stripBracketedEvidenceStatusMarkers(entry.value),
    reason: entry.reason
      ? stripBracketedEvidenceStatusMarkers(entry.reason)
      : entry.reason,
  };
}

function refineBeliefEntry(entry: ProfileItemChange): ProfileItemChange {
  const next = stripChangeStrings(entry);
  const status = coerceStatus(next.status) ?? "emerging";
  const direct = hasDirectBeliefEvidence(next.value, next.reason);
  const indirect = hasIndirectBeliefCue(next.value, next.reason);

  // Inferred/internal constructs stay cautious unless belief is directly evidenced.
  if (!direct || indirect) {
    return { ...next, status: "emerging" };
  }
  // Even with direct evidence, do not jump to well_established from one pass.
  if (status === "well_established") {
    return { ...next, status: "supported" };
  }
  if (status === "supported" && !hasRepeatedBehaviouralEvidence(next.value, next.reason)) {
    // Single direct belief statement remains emerging until repeated.
    return { ...next, status: "emerging" };
  }
  return { ...next, status };
}

function refineBehaviouralEntry(entry: ProfileItemChange): ProfileItemChange {
  const next = stripChangeStrings(entry);
  const status = coerceStatus(next.status) ?? "emerging";

  // "Supported" requires repetition/direct strength — not merely that evidence exists.
  if (status === "supported" && !hasRepeatedBehaviouralEvidence(next.value, next.reason)) {
    return { ...next, status: "emerging" };
  }
  if (
    status === "well_established" &&
    !hasRepeatedBehaviouralEvidence(next.value, next.reason)
  ) {
    return { ...next, status: "supported" };
  }
  return { ...next, status };
}

const PROFILE_ENTRY_CATEGORIES = [
  "strengths",
  "values",
  "motivators",
  "emergingThemes",
  "growthAreas",
  "coachingPreferences",
  "beliefs",
  "patterns",
] as const;

type ProfileEntryCategory = (typeof PROFILE_ENTRY_CATEGORIES)[number];

function findProfileEntry(
  profile: DevelopmentProfile | null | undefined,
  category: ProfileEntryCategory,
  entry: ProfileItemChange
): ProfileEntry | null {
  if (!profile) return null;
  const list = profile[category] ?? [];
  if (entry.id) {
    const byId = list.find(item => item.id === entry.id);
    if (byId) return byId;
  }
  const needle = stripBracketedEvidenceStatusMarkers(entry.value)
    .toLocaleLowerCase("en-GB")
    .slice(0, 48);
  if (!needle) return null;
  return (
    list.find(item =>
      stripBracketedEvidenceStatusMarkers(item.value)
        .toLocaleLowerCase("en-GB")
        .includes(needle)
    ) ?? null
  );
}

function preserveWellEstablished(
  entry: ProfileItemChange,
  existing: ProfileEntry | null
): ProfileItemChange {
  if (!existing || existing.status !== "well_established") return entry;
  const nextStatus = coerceStatus(entry.status) ?? "emerging";
  if (STATUS_RANK[nextStatus] >= STATUS_RANK.well_established) return entry;
  if (hasContradictoryEvidence(entry.value, entry.reason)) return entry;
  return { ...entry, status: "well_established" };
}

function refineCategory(
  categoryKey: ProfileEntryCategory,
  changes: CategoryChanges | undefined,
  profile: DevelopmentProfile | null | undefined
): CategoryChanges | undefined {
  if (!changes) return changes;

  const refineEntry = (entry: ProfileItemChange): ProfileItemChange => {
    const base =
      categoryKey === "beliefs"
        ? refineBeliefEntry(entry)
        : refineBehaviouralEntry(entry);
    const existing = findProfileEntry(profile, categoryKey, base);
    return preserveWellEstablished(base, existing);
  };

  return {
    ...changes,
    add: (changes.add ?? []).map(refineEntry),
    update: (changes.update ?? []).map(refineEntry),
    remove: changes.remove,
  };
}

/**
 * Display/generation hygiene for evidence status:
 * - strip bracketed markers from prose
 * - keep beliefs cautious when evidence is indirect
 * - require repeated behavioural evidence for supported
 * - do not downgrade well_established without contradictory evidence
 */
export function refineDevelopmentUpdateGeneration<
  T extends DevelopmentUpdateGenerationLike,
>(generation: T, profile?: DevelopmentProfile | null): T {
  if (!generation.hasMeaningfulChanges) {
    return {
      ...generation,
      conversationSummary: stripBracketedEvidenceStatusMarkers(
        generation.conversationSummary
      ),
      proposedChanges: {},
      evidence: [],
    };
  }

  const proposed = generation.proposedChanges ?? {};
  const nextProposed: ProposedProfileChanges = { ...proposed };

  if (proposed.currentFocus?.value) {
    nextProposed.currentFocus = {
      ...proposed.currentFocus,
      value: stripBracketedEvidenceStatusMarkers(proposed.currentFocus.value),
      reason: proposed.currentFocus.reason
        ? stripBracketedEvidenceStatusMarkers(proposed.currentFocus.reason)
        : proposed.currentFocus.reason,
    };
  }

  for (const key of PROFILE_ENTRY_CATEGORIES) {
    nextProposed[key] = refineCategory(key, proposed[key], profile);
  }

  if (proposed.commitments) {
    nextProposed.commitments = {
      ...proposed.commitments,
      add: (proposed.commitments.add ?? []).map(entry => ({
        ...entry,
        value: stripBracketedEvidenceStatusMarkers(entry.value),
      })),
    };
  }

  if (typeof proposed.coachNote === "string") {
    nextProposed.coachNote = stripBracketedEvidenceStatusMarkers(proposed.coachNote);
  }

  return {
    ...generation,
    conversationSummary: stripBracketedEvidenceStatusMarkers(
      generation.conversationSummary
    ),
    proposedChanges: nextProposed,
    evidence: generation.evidence.map(item => ({
      ...item,
      evidenceText: stripBracketedEvidenceStatusMarkers(item.evidenceText),
      sourceExcerpt: stripBracketedEvidenceStatusMarkers(item.sourceExcerpt ?? ""),
    })),
  };
}
