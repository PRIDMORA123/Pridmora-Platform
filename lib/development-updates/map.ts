import type {
  CommitmentEntry,
  DevelopmentProfile,
  DevelopmentUpdate,
  DevelopmentUpdateStatus,
  EvidenceSummaryItem,
  ProfileEntry,
  ProfileEntryStatus,
  ProposedProfileChanges,
} from "@/lib/development-updates/types";
import { DEVELOPMENT_UPDATE_STATUSES, PROFILE_ENTRY_STATUSES } from "@/lib/development-updates/types";
import { parseCoachingPatterns } from "@/lib/patterns/schema";

export type DevelopmentProfileRow = {
  id: string;
  client_id: string;
  coach_id: string;
  current_focus: string | null;
  strengths: unknown;
  values: unknown;
  motivators: unknown;
  emerging_themes: unknown;
  growth_areas: unknown;
  coaching_preferences: unknown;
  beliefs: unknown;
  patterns: unknown;
  commitments: unknown;
  coaching_patterns?: unknown;
  patterns_evidence_fingerprint?: string | null;
  patterns_generated_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type DevelopmentUpdateRow = {
  id: string;
  client_id: string;
  session_id: string;
  coach_id: string;
  status: string;
  conversation_summary: string | null;
  proposed_changes: unknown;
  edited_changes: unknown;
  applied_changes: unknown;
  evidence_summary: unknown;
  has_meaningful_changes: boolean | null;
  coach_note: string | null;
  generated_at: string | null;
  reviewed_at: string | null;
  applied_at: string | null;
  discarded_at: string | null;
  created_at: string;
  updated_at: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStatus(value: unknown): ProfileEntryStatus {
  const text = typeof value === "string" ? value : "emerging";
  return (PROFILE_ENTRY_STATUSES as readonly string[]).includes(text)
    ? (text as ProfileEntryStatus)
    : "emerging";
}

function toProfileEntries(value: unknown): ProfileEntry[] {
  const entries: ProfileEntry[] = [];
  asArray(value).forEach((entry, index) => {
    const record = asRecord(entry);
    const text =
      typeof record.value === "string"
        ? record.value
        : typeof entry === "string"
          ? entry
          : "";
    const trimmed = text.trim();
    if (!trimmed) return;
    entries.push({
      id:
        typeof record.id === "string" && record.id.trim()
          ? record.id
          : `entry-${index}`,
      value: trimmed,
      status: toStatus(record.status),
      ...(typeof record.reason === "string" ? { reason: record.reason } : {}),
    });
  });
  return entries;
}

function toCommitments(value: unknown): CommitmentEntry[] {
  return asArray(value)
    .map((entry, index) => {
      const record = asRecord(entry);
      const text =
        typeof record.value === "string"
          ? record.value
          : typeof entry === "string"
            ? entry
            : "";
      const trimmed = text.trim();
      if (!trimmed) return null;
      return {
        id:
          typeof record.id === "string" && record.id.trim()
            ? record.id
            : `commitment-${index}`,
        value: trimmed,
        dueDate:
          typeof record.dueDate === "string"
            ? record.dueDate
            : record.dueDate === null
              ? null
              : null,
        status: record.status === "complete" ? "complete" : "open",
      } satisfies CommitmentEntry;
    })
    .filter((entry): entry is CommitmentEntry => Boolean(entry));
}

function toProposedChanges(value: unknown): ProposedProfileChanges {
  return asRecord(value) as ProposedProfileChanges;
}

function toEvidence(value: unknown): EvidenceSummaryItem[] {
  const items: EvidenceSummaryItem[] = [];
  for (const entry of asArray(value)) {
    const record = asRecord(entry);
    const changeKey =
      typeof record.changeKey === "string" ? record.changeKey.trim() : "";
    const evidenceText =
      typeof record.evidenceText === "string" ? record.evidenceText.trim() : "";
    if (!changeKey || !evidenceText) continue;
    items.push({
      changeKey,
      evidenceText,
      sourceExcerpt:
        typeof record.sourceExcerpt === "string" ? record.sourceExcerpt : "",
      sessionId:
        typeof record.sessionId === "string" || record.sessionId === null
          ? (record.sessionId as string | null)
          : undefined,
    });
  }
  return items;
}

function toUpdateStatus(value: string): DevelopmentUpdateStatus {
  return (DEVELOPMENT_UPDATE_STATUSES as readonly string[]).includes(value)
    ? (value as DevelopmentUpdateStatus)
    : "draft";
}

export function rowToDevelopmentProfile(row: DevelopmentProfileRow): DevelopmentProfile {
  return {
    id: row.id,
    clientId: row.client_id,
    coachId: row.coach_id,
    currentFocus: row.current_focus?.trim() || "",
    strengths: toProfileEntries(row.strengths),
    values: toProfileEntries(row.values),
    motivators: toProfileEntries(row.motivators),
    emergingThemes: toProfileEntries(row.emerging_themes),
    growthAreas: toProfileEntries(row.growth_areas),
    coachingPreferences: toProfileEntries(row.coaching_preferences),
    beliefs: toProfileEntries(row.beliefs),
    patterns: toProfileEntries(row.patterns),
    commitments: toCommitments(row.commitments),
    coachingPatterns: parseCoachingPatterns(row.coaching_patterns),
    patternsEvidenceFingerprint: row.patterns_evidence_fingerprint ?? null,
    patternsGeneratedAt: row.patterns_generated_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToDevelopmentUpdate(row: DevelopmentUpdateRow): DevelopmentUpdate {
  return {
    id: row.id,
    clientId: row.client_id,
    sessionId: row.session_id,
    coachId: row.coach_id,
    status: toUpdateStatus(row.status),
    conversationSummary: row.conversation_summary?.trim() || "",
    proposedChanges: toProposedChanges(row.proposed_changes),
    editedChanges: row.edited_changes == null ? null : toProposedChanges(row.edited_changes),
    appliedChanges: row.applied_changes == null ? null : toProposedChanges(row.applied_changes),
    evidenceSummary: toEvidence(row.evidence_summary),
    hasMeaningfulChanges: row.has_meaningful_changes !== false,
    coachNote: row.coach_note?.trim() || "",
    generatedAt: row.generated_at,
    reviewedAt: row.reviewed_at,
    appliedAt: row.applied_at,
    discardedAt: row.discarded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function emptyDevelopmentProfile(
  clientId: string,
  coachId: string,
  currentFocus = ""
): DevelopmentProfile {
  return {
    id: "",
    clientId,
    coachId,
    currentFocus,
    strengths: [],
    values: [],
    motivators: [],
    emergingThemes: [],
    growthAreas: [],
    coachingPreferences: [],
    beliefs: [],
    patterns: [],
    commitments: [],
    coachingPatterns: [],
    patternsEvidenceFingerprint: null,
    patternsGeneratedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}
