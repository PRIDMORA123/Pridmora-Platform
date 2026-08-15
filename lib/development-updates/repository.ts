import type { SupabaseClient } from "@supabase/supabase-js";
import type { DevelopmentUpdateGenerationParsed } from "@/lib/development-updates/schema";
import {
  emptyDevelopmentProfile,
  rowToDevelopmentProfile,
  rowToDevelopmentUpdate,
  type DevelopmentProfileRow,
  type DevelopmentUpdateRow,
} from "@/lib/development-updates/map";
import {
  DevelopmentUpdateMigrationRequiredError,
  isMissingDevelopmentUpdateSchema,
} from "@/lib/development-updates/errors";
import type {
  DevelopmentProfile,
  DevelopmentUpdate,
  ProposedProfileChanges,
} from "@/lib/development-updates/types";
import { hasAnyProposedChanges } from "@/lib/development-updates/types";
import type { CoachingPattern } from "@/lib/patterns/types";
import {
  logSupabaseError,
  toSupabaseDbError,
} from "@/lib/supabase/errors";

function throwDb(
  error: { message: string; code?: string; details?: string; hint?: string },
  status: number | undefined,
  operation: string
): never {
  const dbError = toSupabaseDbError(error, { status: status ?? null, operation });
  logSupabaseError(operation, dbError, status ?? null);
  if (isMissingDevelopmentUpdateSchema(dbError)) {
    throw new DevelopmentUpdateMigrationRequiredError();
  }
  throw dbError;
}

async function writeAudit(
  supabase: SupabaseClient,
  userId: string,
  entityId: string,
  action: string,
  previousValue: unknown = null,
  newValue: unknown = null
): Promise<void> {
  const { error } = await supabase.from("intelligence_audit_log").insert({
    user_id: userId,
    entity_type: "development_update",
    entity_id: entityId,
    action,
    previous_value: previousValue,
    new_value: newValue,
  });
  if (error) {
    logSupabaseError("intelligence_audit_log.insert", error, null);
  }
}

/**
 * Record a pre-save generation rejection without persisting model content.
 * Uses the session id as entity_id so diagnostics can join to the conversation.
 */
export async function recordDevelopmentGenerationRejection(
  supabase: SupabaseClient,
  coachId: string,
  input: {
    clientId: string;
    relationshipId: string;
    sessionId: string;
    rejectionCode: string;
    rejectionStage: string;
    attempt: number;
    responseId?: string | null;
    fieldPath?: string | null;
    issueCode?: string | null;
    validationDiagnostic?: {
      fieldPath: string | null;
      issueCode: string | null;
      expectedType: string | null;
      receivedType: string | null;
      minimum: number | null;
      maximum: number | null;
    } | null;
  }
): Promise<void> {
  await writeAudit(supabase, coachId, input.sessionId, "development_generation_rejected", null, {
    event: "development_generation_rejected",
    clientId: input.clientId,
    relationshipId: input.relationshipId,
    sessionId: input.sessionId,
    rejectionCode: input.rejectionCode,
    rejectionStage: input.rejectionStage,
    attempt: input.attempt,
    responseId: input.responseId ?? null,
    fieldPath:
      input.validationDiagnostic?.fieldPath ?? input.fieldPath ?? null,
    issueCode:
      input.validationDiagnostic?.issueCode ?? input.issueCode ?? null,
    validationDiagnostic: input.validationDiagnostic ?? null,
    createdAt: new Date().toISOString(),
  });
}

export async function getOrCreateDevelopmentProfile(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
  currentFocus = ""
): Promise<DevelopmentProfile> {
  const { data: existing, error: existingError } = await supabase
    .from("development_profiles")
    .select("*")
    .eq("client_id", clientId)
    .eq("coach_id", coachId)
    .maybeSingle();

  if (existingError) throwDb(existingError, undefined, "development_profiles.get");
  if (existing) return rowToDevelopmentProfile(existing as DevelopmentProfileRow);

  const { data, error } = await supabase
    .from("development_profiles")
    .upsert(
      {
        client_id: clientId,
        coach_id: coachId,
        current_focus: currentFocus || null,
      },
      { onConflict: "client_id", ignoreDuplicates: true }
    )
    .select("*")
    .eq("coach_id", coachId)
    .maybeSingle();

  if (error) throwDb(error, undefined, "development_profiles.upsert");
  if (data) return rowToDevelopmentProfile(data as DevelopmentProfileRow);

  const { data: raced, error: racedError } = await supabase
    .from("development_profiles")
    .select("*")
    .eq("client_id", clientId)
    .eq("coach_id", coachId)
    .single();

  if (racedError) throwDb(racedError, undefined, "development_profiles.get_after_conflict");
  return rowToDevelopmentProfile(raced as DevelopmentProfileRow);
}

export async function getDevelopmentProfileForClient(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string
): Promise<DevelopmentProfile | null> {
  const { data, error } = await supabase
    .from("development_profiles")
    .select("*")
    .eq("client_id", clientId)
    .eq("coach_id", coachId)
    .maybeSingle();

  if (error) throwDb(error, undefined, "development_profiles.get");
  if (!data) return null;
  return rowToDevelopmentProfile(data as DevelopmentProfileRow);
}

export async function getDevelopmentUpdateBySession(
  supabase: SupabaseClient,
  coachId: string,
  sessionId: string
): Promise<DevelopmentUpdate | null> {
  const { data, error } = await supabase
    .from("development_updates")
    .select("*")
    .eq("session_id", sessionId)
    .eq("coach_id", coachId)
    .maybeSingle();

  if (error) throwDb(error, undefined, "development_updates.get_by_session");
  if (!data) return null;
  return rowToDevelopmentUpdate(data as DevelopmentUpdateRow);
}

export async function getDevelopmentUpdateById(
  supabase: SupabaseClient,
  coachId: string,
  updateId: string
): Promise<DevelopmentUpdate | null> {
  const { data, error } = await supabase
    .from("development_updates")
    .select("*")
    .eq("id", updateId)
    .eq("coach_id", coachId)
    .maybeSingle();

  if (error) throwDb(error, undefined, "development_updates.get");
  if (!data) return null;
  return rowToDevelopmentUpdate(data as DevelopmentUpdateRow);
}

export async function listReadyDevelopmentUpdates(
  supabase: SupabaseClient,
  coachId: string
): Promise<DevelopmentUpdate[]> {
  const { data, error } = await supabase
    .from("development_updates")
    .select("*")
    .eq("coach_id", coachId)
    .eq("status", "ready_for_review")
    .order("generated_at", { ascending: false })
    .limit(40);

  if (error) throwDb(error, undefined, "development_updates.list_ready");
  return ((data ?? []) as DevelopmentUpdateRow[]).map(rowToDevelopmentUpdate);
}

export async function listRecentlyAppliedDevelopmentUpdates(
  supabase: SupabaseClient,
  coachId: string,
  limit = 8
): Promise<DevelopmentUpdate[]> {
  const { data, error } = await supabase
    .from("development_updates")
    .select("*")
    .eq("coach_id", coachId)
    .eq("status", "applied")
    .order("applied_at", { ascending: false })
    .limit(limit);

  if (error) throwDb(error, undefined, "development_updates.list_applied");
  return ((data ?? []) as DevelopmentUpdateRow[]).map(rowToDevelopmentUpdate);
}

export async function listDevelopmentUpdatesForClient(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string
): Promise<DevelopmentUpdate[]> {
  const { data, error } = await supabase
    .from("development_updates")
    .select("*")
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) throwDb(error, undefined, "development_updates.list_client");
  return ((data ?? []) as DevelopmentUpdateRow[]).map(rowToDevelopmentUpdate);
}

export async function upsertDevelopmentUpdateFromGeneration(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
  sessionId: string,
  result: DevelopmentUpdateGenerationParsed,
  options?: { forceRegenerateApplied?: boolean }
): Promise<DevelopmentUpdate> {
  const existing = await getDevelopmentUpdateBySession(supabase, coachId, sessionId);
  if (existing?.status === "applied" && !options?.forceRegenerateApplied) {
    throw new Error(
      "This development update has already been applied. Choose regenerate only if you intend to replace it."
    );
  }

  const now = new Date().toISOString();
  const meaningful =
    result.hasMeaningfulChanges && hasAnyProposedChanges(result.proposedChanges);

  const payload = {
    client_id: clientId,
    session_id: sessionId,
    coach_id: coachId,
    status: "ready_for_review" as const,
    conversation_summary: result.conversationSummary,
    proposed_changes: meaningful ? result.proposedChanges : {},
    edited_changes: null,
    applied_changes: null,
    evidence_summary: meaningful ? result.evidence : [],
    has_meaningful_changes: meaningful,
    coach_note: null,
    generated_at: now,
    reviewed_at: null,
    applied_at: null,
    discarded_at: null,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("development_updates")
    .upsert(payload, { onConflict: "session_id" })
    .select("*")
    .single();

  if (error) throwDb(error, undefined, "development_updates.upsert");

  const update = rowToDevelopmentUpdate(data as DevelopmentUpdateRow);
  const action =
    existing && existing.status !== "draft"
      ? "development_update_regenerated"
      : "development_update_generated";

  await writeAudit(
    supabase,
    coachId,
    update.id,
    action,
    existing
      ? {
          id: existing.id,
          sessionId: existing.sessionId,
          clientId: existing.clientId,
          status: existing.status,
        }
      : null,
    {
      id: update.id,
      sessionId: update.sessionId,
      clientId: update.clientId,
      status: update.status,
      hasMeaningfulChanges: update.hasMeaningfulChanges,
    }
  );

  return update;
}

/**
 * Upserts a content-free `failed` development_updates row for the session.
 * Does not store generated narrative. Prefer `recordDevelopmentGenerationRejection`
 * for pre-save AI validation failures so rejected drafts never become update rows.
 * Silently returns null when the write fails.
 */
export async function markDevelopmentUpdateFailed(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
  sessionId: string
): Promise<DevelopmentUpdate | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("development_updates")
    .upsert(
      {
        client_id: clientId,
        session_id: sessionId,
        coach_id: coachId,
        status: "failed",
        proposed_changes: {},
        evidence_summary: [],
        has_meaningful_changes: false,
        updated_at: now,
      },
      { onConflict: "session_id" }
    )
    .select("*")
    .maybeSingle();

  if (error) {
    logSupabaseError("development_updates.mark_failed", error, null);
    return null;
  }
  if (!data) return null;
  return rowToDevelopmentUpdate(data as DevelopmentUpdateRow);
}

export async function saveEditedDevelopmentUpdate(
  supabase: SupabaseClient,
  coachId: string,
  updateId: string,
  input: {
    conversationSummary?: string;
    editedChanges: ProposedProfileChanges;
    coachNote?: string;
  }
): Promise<DevelopmentUpdate> {
  const previous = await getDevelopmentUpdateById(supabase, coachId, updateId);
  if (!previous) throw new Error("Development update not found.");
  if (previous.status === "applied") {
    throw new Error("This development update has already been applied.");
  }
  if (previous.status === "discarded") {
    throw new Error("This development update has been discarded.");
  }

  const { data, error } = await supabase
    .from("development_updates")
    .update({
      conversation_summary:
        input.conversationSummary?.trim() || previous.conversationSummary,
      edited_changes: input.editedChanges,
      coach_note: input.coachNote?.trim() || null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", updateId)
    .eq("coach_id", coachId)
    .select("*")
    .single();

  if (error) throwDb(error, undefined, "development_updates.edit");

  const update = rowToDevelopmentUpdate(data as DevelopmentUpdateRow);
  await writeAudit(
    supabase,
    coachId,
    update.id,
    "development_update_edited",
    {
      conversationSummary: previous.conversationSummary,
      proposedChanges: previous.proposedChanges,
      editedChanges: previous.editedChanges,
    },
    {
      conversationSummary: update.conversationSummary,
      editedChanges: update.editedChanges,
      coachNote: update.coachNote,
    }
  );

  return update;
}

export async function applyDevelopmentUpdateRpc(
  supabase: SupabaseClient,
  updateId: string
): Promise<{
  ok: boolean;
  alreadyApplied: boolean;
  updateId: string;
  status: string;
  profileId?: string;
}> {
  const { data, error } = await supabase.rpc("apply_development_update", {
    p_update_id: updateId,
  });

  if (error) throwDb(error, undefined, "apply_development_update");

  const result = (data ?? {}) as {
    ok?: boolean;
    alreadyApplied?: boolean;
    updateId?: string;
    status?: string;
    profileId?: string;
  };

  return {
    ok: Boolean(result.ok),
    alreadyApplied: Boolean(result.alreadyApplied),
    updateId: result.updateId ?? updateId,
    status: result.status ?? "applied",
    profileId: result.profileId,
  };
}

export async function discardDevelopmentUpdateRpc(
  supabase: SupabaseClient,
  updateId: string
): Promise<{
  ok: boolean;
  alreadyDiscarded: boolean;
  updateId: string;
  status: string;
}> {
  const { data, error } = await supabase.rpc("discard_development_update", {
    p_update_id: updateId,
  });

  if (error) throwDb(error, undefined, "discard_development_update");

  const result = (data ?? {}) as {
    ok?: boolean;
    alreadyDiscarded?: boolean;
    updateId?: string;
    status?: string;
  };

  return {
    ok: Boolean(result.ok),
    alreadyDiscarded: Boolean(result.alreadyDiscarded),
    updateId: result.updateId ?? updateId,
    status: result.status ?? "discarded",
  };
}

export async function ensureProfileOrEmpty(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
  currentFocus = ""
): Promise<DevelopmentProfile> {
  try {
    return await getOrCreateDevelopmentProfile(supabase, coachId, clientId, currentFocus);
  } catch (error) {
    if (isMissingDevelopmentUpdateSchema(error)) {
      return emptyDevelopmentProfile(clientId, coachId, currentFocus);
    }
    throw error;
  }
}

export async function saveCoachingPatterns(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
  patterns: CoachingPattern[],
  evidenceFingerprint: string | null
): Promise<DevelopmentProfile> {
  const profile = await getOrCreateDevelopmentProfile(supabase, coachId, clientId);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("development_profiles")
    .update({
      coaching_patterns: patterns,
      patterns_evidence_fingerprint: evidenceFingerprint,
      patterns_generated_at: now,
      updated_at: now,
    })
    .eq("id", profile.id)
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .select("*")
    .single();

  if (error) throwDb(error, undefined, "development_profiles.save_patterns");
  return rowToDevelopmentProfile(data as DevelopmentProfileRow);
}
