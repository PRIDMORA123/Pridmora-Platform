import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CoachingAction, Client, Session } from "@/lib/types";
import type { PreparationStyle } from "@/lib/preparation-style";
import type {
  InitialConversation,
  RelationshipAgreement,
  SupportingContextItem,
} from "@/lib/relationship-meta";
import { normalizeSession } from "@/lib/sessions";
import { RelationshipOrganisationMissingError } from "@/lib/organisations/session-organisation";
import {
  logSupabaseError,
  SupabaseDbError,
  SupabaseUnavailableError,
  toSupabaseDbError,
} from "@/lib/supabase/errors";
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  isSupabaseServiceRoleConfigured,
} from "@/lib/supabase/env";
import {
  assembleClient,
  clientItemsToRows,
  clientToRow,
  initialsFromName,
  rowToSession,
  sessionToRow,
  toNextSessionLabel,
  type ClientItemRow,
  type ClientRow,
  type SessionRow,
} from "@/lib/supabase/map";

/** Service-role client for ownership-verified mutations that must not depend on PostgREST RPCs. */
function getAdminClient(): SupabaseClient {
  const url = getSupabaseUrl();
  const serviceKey = getSupabaseServiceRoleKey();
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase server access is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to the environment."
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isMissingRelationError(message: string): boolean {
  return (
    /could not find the table/i.test(message) ||
    /schema cache/i.test(message) ||
    /does not exist/i.test(message) ||
    /relation .* does not exist/i.test(message)
  );
}

/**
 * Delete coach-owned dependent rows. Missing tables (not yet migrated) are ignored.
 */
async function deleteOwnedClientDependents(
  admin: SupabaseClient,
  coachId: string,
  clientId: string
): Promise<void> {
  // Intelligence tables use user_id (same value as coach_id). Evidence has no client_id.
  const intelligenceByClient = [
    "session_intelligence_reviews",
    "question_insights",
    "person_progress_signals",
    "intelligence_items",
  ] as const;

  for (const table of intelligenceByClient) {
    const { error } = await admin
      .from(table)
      .delete()
      .eq("client_id", clientId)
      .eq("user_id", coachId);

    if (error && !isMissingRelationError(error.message)) {
      throw new Error(error.message);
    }
  }

  const legacyTables = [
    "development_reports",
    "coaching_reports",
    "sessions",
    "client_items",
  ] as const;
  for (const table of legacyTables) {
    const { error } = await admin
      .from(table)
      .delete()
      .eq("client_id", clientId)
      .eq("coach_id", coachId);

    if (error && !isMissingRelationError(error.message)) {
      throw new Error(error.message);
    }
  }
}

function withUuidIds(client: Client, coachId: string): Client {
  const id = isUuid(client.id) ? client.id : crypto.randomUUID();
  const sessions = (client.sessions ?? []).map((session, index, list) =>
    normalizeSession(
      {
        ...session,
        id: isUuid(session.id) ? session.id : crypto.randomUUID(),
        clientId: id,
        coachId,
      },
      { clientId: id, coachId, index, total: list.length }
    )
  );

  return {
    ...client,
    id,
    sessions,
    strengths: client.strengths.map(item => ({
      ...item,
      id: isUuid(item.id) ? item.id : crypto.randomUUID(),
    })),
    values: client.values.map(item => ({
      ...item,
      id: isUuid(item.id) ? item.id : crypto.randomUUID(),
    })),
    actions: client.actions.map(item => ({
      ...item,
      id: isUuid(item.id) ? item.id : crypto.randomUUID(),
    })),
    journey: client.journey.map(item => ({
      ...item,
      id: isUuid(item.id) ? item.id : crypto.randomUUID(),
    })),
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function throwFromSupabase(
  error: { message: string; code?: string; details?: string; hint?: string },
  status: number | undefined,
  operation: string
): never {
  const dbError = toSupabaseDbError(error, { status: status ?? null, operation });
  logSupabaseError(operation, dbError, status ?? null);
  throw dbError;
}

function wrapDbError(error: unknown, fallback: string): never {
  if (error instanceof SupabaseUnavailableError) throw error;
  if (error instanceof SupabaseDbError) throw error;
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes("fetch failed") ||
      message.includes("failed to fetch") ||
      message.includes("networkerror") ||
      message.includes("econnrefused") ||
      message.includes("enotfound")
    ) {
      throw new SupabaseUnavailableError();
    }
    // Preserve the original database message; do not replace it with a generic fallback.
    throw toSupabaseDbError(error, { operation: fallback });
  }
  throw new SupabaseUnavailableError(fallback);
}

async function insertFullClient(
  supabase: SupabaseClient,
  client: Client,
  coachId: string,
  organisationId: string
): Promise<Client> {
  const prepared = withUuidIds(client, coachId);
  const clientRow = {
    ...clientToRow(prepared, coachId),
    organisation_id: organisationId,
  };
  const sessionRows = prepared.sessions.map(session => ({
    ...sessionToRow(session, coachId, organisationId),
  }));
  const itemRows = clientItemsToRows(prepared, coachId).map(row => ({
    ...row,
    id: isUuid(row.id) ? row.id : crypto.randomUUID(),
    organisation_id: organisationId,
  }));

  const clientWrite = await supabase.from("clients").upsert(clientRow);
  if (clientWrite.error) {
    throwFromSupabase(clientWrite.error, clientWrite.status, "clients.upsert");
  }

  if (sessionRows.length > 0) {
    const sessionWrite = await supabase.from("sessions").upsert(sessionRows);
    if (sessionWrite.error) {
      throwFromSupabase(sessionWrite.error, sessionWrite.status, "sessions.upsert");
    }
  }

  if (itemRows.length > 0) {
    const itemWrite = await supabase.from("client_items").upsert(itemRows);
    if (itemWrite.error) {
      throwFromSupabase(itemWrite.error, itemWrite.status, "client_items.upsert");
    }
  }

  try {
    const { createPrimaryAssignment } = await import(
      "@/lib/organisations/repository"
    );
    await createPrimaryAssignment({
      supabase,
      organisationId,
      clientId: prepared.id,
      userId: coachId,
      assignedBy: coachId,
    });
  } catch (error) {
    console.warn("Primary assignment create skipped:", error);
  }

  return prepared;
}

export async function listClientsFromDb(
  supabase: SupabaseClient,
  coachId: string,
  options?: {
    organisationId?: string | null;
    /** When true, list only assigned relationships within the organisation. */
    assignedOnly?: boolean;
  }
): Promise<Client[]> {
  try {
    let query = supabase.from("clients").select("*");

    if (options?.organisationId && options.organisationId !== coachId) {
      query = query.eq("organisation_id", options.organisationId);

      if (options.assignedOnly !== false) {
        try {
          const { listAssignedClientIds } = await import(
            "@/lib/organisations/repository"
          );
          const assignedIds = await listAssignedClientIds(
            supabase,
            options.organisationId,
            coachId
          );

          // Solo owner fallback: if no assignments table rows yet, use coach_id.
          if (assignedIds.length > 0) {
            query = query.in("id", assignedIds);
          } else {
            query = query.eq("coach_id", coachId);
          }
        } catch {
          query = query.eq("coach_id", coachId);
        }
      }
    } else {
      query = query.eq("coach_id", coachId);
    }

    const { data: clientRows, error: clientError } = await query.order(
      "created_at",
      { ascending: false }
    );

    if (clientError) {
      // Pre-migration: organisation_id filter may fail.
      if (
        options?.organisationId &&
        /organisation_id|schema cache|could not find/i.test(clientError.message)
      ) {
        return listClientsFromDb(supabase, coachId);
      }
      throw new Error(clientError.message);
    }

    const rows = (clientRows ?? []) as ClientRow[];
    if (rows.length === 0) return [];

    const clientIds = rows.map(row => row.id);

    const [{ data: sessionRows, error: sessionError }, { data: itemRows, error: itemError }] =
      await Promise.all([
        supabase.from("sessions").select("*").in("client_id", clientIds),
        supabase.from("client_items").select("*").in("client_id", clientIds),
      ]);

    if (sessionError) throw new Error(sessionError.message);
    if (itemError) throw new Error(itemError.message);

    const sessions = (sessionRows ?? []) as SessionRow[];
    const items = (itemRows ?? []) as ClientItemRow[];

    return rows.map(row =>
      assembleClient(
        row,
        sessions.filter(session => session.client_id === row.id),
        items.filter(item => item.client_id === row.id)
      )
    );
  } catch (error) {
    wrapDbError(error, "Unable to load clients from Supabase.");
  }
}

export async function createClientInDb(
  supabase: SupabaseClient,
  coachId: string,
  client: Client,
  organisationId: string
): Promise<Client> {
  try {
    const resolvedOrganisationId = organisationId.trim();
    if (!resolvedOrganisationId) {
      throw new RelationshipOrganisationMissingError(
        "Client creation requires organisation ownership from the current workspace."
      );
    }

    return await insertFullClient(
      supabase,
      {
        ...client,
        id: isUuid(client.id) ? client.id : crypto.randomUUID(),
        sessions: client.sessions.map(session => ({
          ...session,
          id: isUuid(session.id) ? session.id : crypto.randomUUID(),
          coachId,
        })),
      },
      coachId,
      resolvedOrganisationId
    );
  } catch (error) {
    if (error instanceof RelationshipOrganisationMissingError) throw error;
    wrapDbError(
      error,
      "Unable to create the client in Supabase. Please check your connection and try again."
    );
  }
}

export type AtomicRelationshipCreateInput = {
  organisationId: string;
  identityMode: "standard" | "confidential";
  name: string;
  displayLabel: string;
  role: string;
  organisationLabel: string;
  email: string;
  currentFocus: string;
  aiNameAllowed: boolean;
  initials: string;
  privateRealName?: string;
  privateEmail?: string;
  privatePhone?: string;
  privateNotes?: string;
};

/**
 * Atomically create client + primary assignment + optional private identity
 * via SECURITY DEFINER RPC. coach_id and confidential_reference are never
 * accepted from the browser — the RPC derives/generates them.
 */
export async function createRelationshipAtomicInDb(
  supabase: SupabaseClient,
  input: AtomicRelationshipCreateInput
): Promise<Client> {
  try {
    const organisationId = input.organisationId.trim();
    if (!organisationId) {
      throw new RelationshipOrganisationMissingError(
        "Client creation requires organisation ownership from the current workspace."
      );
    }

    const { data, error } = await supabase.rpc("create_coaching_relationship", {
      p_organisation_id: organisationId,
      p_identity_mode: input.identityMode,
      p_name: input.name,
      p_display_label: input.displayLabel,
      p_role: input.role || null,
      p_organisation_label: input.organisationLabel || null,
      p_email: input.email || null,
      p_current_focus: input.currentFocus || null,
      p_ai_name_allowed: Boolean(input.aiNameAllowed),
      p_initials: input.initials || null,
      p_private_real_name: input.privateRealName?.trim() || null,
      p_private_email: input.privateEmail?.trim() || null,
      p_private_phone: input.privatePhone?.trim() || null,
      p_private_notes: input.privateNotes?.trim() || null,
    });

    if (error) {
      throwFromSupabase(error, undefined, "create_coaching_relationship");
    }

    const payload = (data ?? {}) as {
      ok?: boolean;
      code?: string;
      message?: string;
      clientId?: string;
    };

    if (!payload.ok || !payload.clientId) {
      const code = payload.code ?? "CREATE_FAILED";
      if (code === "PERMISSION_DENIED") {
        throw new Error("Permission denied.");
      }
      if (code === "ORGANISATION_REQUIRED") {
        throw new RelationshipOrganisationMissingError();
      }
      throw new Error(
        payload.message?.trim() ||
          `Unable to create the relationship (${code}).`
      );
    }

    const { data: clientRow, error: loadError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", payload.clientId)
      .maybeSingle();

    if (loadError) {
      throw new Error(loadError.message);
    }

    if (clientRow) {
      return assembleClient(clientRow as ClientRow, [], []);
    }

    // Fallback public representation if reload races schema cache.
    return {
      id: payload.clientId,
      name: String((payload as { name?: string }).name ?? input.name),
      initials: input.initials || initialsFromName(input.name),
      organisation: input.organisationLabel,
      role: input.role,
      email: input.identityMode === "confidential" ? "" : input.email,
      identityMode: input.identityMode,
      displayLabel: String(
        (payload as { displayLabel?: string }).displayLabel ?? input.displayLabel
      ),
      confidentialReference:
        ((payload as { confidentialReference?: string | null })
          .confidentialReference as string | null) ?? null,
      aiNameAllowed:
        input.identityMode === "confidential" ? false : Boolean(input.aiNameAllowed),
      status: "Active",
      nextSession: "Not scheduled",
      currentFocus: input.currentFocus,
      identitySummary: "",
      coachInsight: "",
      preparationStyleOverride: null,
      strengths: [],
      values: [],
      themes: [],
      goals: [],
      actions: [],
      quotes: [],
      sessions: [],
      journey: [],
    };
  } catch (error) {
    if (error instanceof RelationshipOrganisationMissingError) throw error;
    wrapDbError(
      error,
      "Unable to create the relationship in Supabase. Please check your connection and try again."
    );
  }
}

export async function saveSessionInDb(
  supabase: SupabaseClient,
  coachId: string,
  session: Session,
  organisationId: string
): Promise<Session> {
  try {
    const resolvedOrganisationId = organisationId.trim();
    if (!resolvedOrganisationId) {
      throw new RelationshipOrganisationMissingError();
    }

    const activity = await assertClientActive(supabase, coachId, session.clientId);
    if (activity === "missing") {
      throw new OwnershipError();
    }
    if (activity === "archived") {
      throw new ClientArchivedError();
    }

    const row = sessionToRow(
      {
        ...session,
        id: isUuid(session.id) ? session.id : crypto.randomUUID(),
        coachId,
      },
      coachId,
      resolvedOrganisationId
    );

    // Prefer update-by-id when the row already exists and belongs to this coach.
    if (isUuid(session.id)) {
      const { data: existing, error: existingError } = await supabase
        .from("sessions")
        .select("id, coach_id")
        .eq("id", session.id)
        .maybeSingle();

      if (existingError) throw new Error(existingError.message);

      if (existing && existing.coach_id !== coachId) {
        throw new OwnershipError();
      }
    }

    // organisation_id is required — never strip it during schema-cache retries.
    let payload: Record<string, unknown> = {
      ...row,
      organisation_id: resolvedOrganisationId,
    };
    let { data, error } = await supabase.from("sessions").upsert(payload).select("*").single();

    // If the live schema is mid-migration, strip unknown columns and retry —
    // but never drop organisation_id.
    for (let attempt = 0; attempt < 8 && error; attempt += 1) {
      const missing = error.message.match(
        /could not find the '([^']+)' column/i
      )?.[1];
      if (!missing || !(missing in payload) || missing === "organisation_id") break;
      const next = { ...payload };
      delete next[missing];
      payload = next;
      const retry = await supabase.from("sessions").upsert(payload).select("*").single();
      data = retry.data;
      error = retry.error;
    }

    // Final compact legacy shape when broader schema-cache mismatches remain.
    if (error && /schema cache|could not find/i.test(error.message)) {
      const legacyRow = {
        id: row.id,
        client_id: row.client_id,
        coach_id: row.coach_id,
        organisation_id: resolvedOrganisationId,
        session_number: row.session_number,
        session_date: row.session_date,
        display_date: row.display_date,
        display_time: row.display_time,
        starts_at: row.starts_at,
        focus: row.focus,
        preparation: row.preparation,
        notes: row.notes,
        private_notes: row.private_notes,
        ai_draft_summary: row.ai_draft_summary,
        emerging_themes: row.emerging_themes,
        strengths_observed: row.strengths_observed,
        values_becoming_visible: row.values_becoming_visible,
        professional_identity_development: row.professional_identity_development,
        agreed_actions: row.agreed_actions,
        suggested_focus: row.suggested_focus,
        coach_reflection: row.coach_reflection,
        reflection: row.reflection,
        summary: row.summary,
        updated_at: row.updated_at,
      };
      const retry = await supabase.from("sessions").upsert(legacyRow).select("*").single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw new Error(error.message);

    const saved = data as SessionRow;
    return rowToSession(saved, 0, saved.session_number);
  } catch (error) {
    if (
      error instanceof OwnershipError ||
      error instanceof ClientArchivedError ||
      error instanceof RelationshipOrganisationMissingError
    ) {
      throw error;
    }
    wrapDbError(
      error,
      "Unable to save the session in Supabase. Please check your connection and try again."
    );
  }
}

/** Create (or upsert) a structured coaching session. */
export async function createSessionInDb(
  supabase: SupabaseClient,
  coachId: string,
  session: Session,
  organisationId: string
): Promise<Session> {
  const saved = await saveSessionInDb(supabase, coachId, session, organisationId);

  // Keep the client profile next-session label in sync for scheduled sessions.
  if (saved.status !== "completed" && (saved.date.trim() || saved.time.trim())) {
    const label = toNextSessionLabel(saved);
    const nextAt = (() => {
      const datePart = saved.date.trim();
      const timeMatch = saved.time.trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!datePart || !timeMatch) return null;
      const parsed = Date.parse(
        `${datePart} ${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`
      );
      return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
    })();

    await supabase
      .from("clients")
      .update({
        next_session_label: label,
        next_session: nextAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", saved.clientId)
      .eq("coach_id", coachId);
  }

  return saved;
}

export async function upsertActionInDb(
  supabase: SupabaseClient,
  coachId: string,
  action: CoachingAction & { clientId: string }
): Promise<CoachingAction> {
  try {
    const activity = await assertClientActive(supabase, coachId, action.clientId);
    if (activity === "missing") throw new OwnershipError();
    if (activity === "archived") throw new ClientArchivedError();

    const id = isUuid(action.id) ? action.id : crypto.randomUUID();
    const row: Omit<ClientItemRow, "created_at"> = {
      id,
      client_id: action.clientId,
      coach_id: coachId,
      session_id: action.sessionId ?? null,
      item_type: "action",
      title: action.title.trim(),
      detail: action.notes?.trim() || null,
      owner: action.owner?.trim() || null,
      status: action.status,
      evidence: null,
      event_date: action.due?.trim() || null,
    };

    if (!row.title) {
      throw new Error("Action title is required.");
    }

    const { data, error } = await supabase
      .from("client_items")
      .upsert(row)
      .select("*")
      .single();

    if (error) {
      // Retry without optional columns when the live DB is partially migrated.
      if (/session_id|owner|schema cache/i.test(error.message)) {
        const legacy = {
          id: row.id,
          client_id: row.client_id,
          coach_id: row.coach_id,
          item_type: row.item_type,
          title: row.title,
          detail: row.detail,
          status: row.status,
          evidence: action.sessionId ?? row.evidence,
          event_date: row.event_date,
        };
        const retry = await supabase.from("client_items").upsert(legacy).select("*").single();
        if (retry.error) throw new Error(retry.error.message);
        const saved = retry.data as ClientItemRow;
        return {
          id: saved.id,
          title: saved.title,
          status: (saved.status as CoachingAction["status"]) || "Open",
          due: saved.event_date ?? undefined,
          owner: action.owner,
          notes: action.notes,
          clientId: saved.client_id,
          sessionId: action.sessionId ?? null,
        };
      }
      throw new Error(error.message);
    }

    const saved = data as ClientItemRow;
    return {
      id: saved.id,
      title: saved.title,
      status: (saved.status as CoachingAction["status"]) || "Open",
      due: saved.event_date ?? undefined,
      owner: saved.owner ?? undefined,
      notes: saved.detail ?? undefined,
      clientId: saved.client_id,
      sessionId: saved.session_id ?? null,
    };
  } catch (error) {
    if (error instanceof OwnershipError || error instanceof ClientArchivedError) throw error;
    wrapDbError(error, "Unable to save the action in Supabase.");
  }
}

export async function deleteActionInDb(
  supabase: SupabaseClient,
  coachId: string,
  actionId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("client_items")
      .delete()
      .eq("id", actionId)
      .eq("coach_id", coachId)
      .eq("item_type", "action")
      .select("id")
      .maybeSingle();

    if (error) throw new Error(error.message);
    return Boolean(data);
  } catch (error) {
    wrapDbError(error, "Unable to delete the action in Supabase.");
  }
}

/** Retrieve all sessions for a single client, newest session_number first. */
export async function listSessionsForClientInDb(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string
): Promise<Session[] | null> {
  try {
    const owned = await assertClientOwned(supabase, coachId, clientId);
    if (!owned) return null;

    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("client_id", clientId)
      .eq("coach_id", coachId)
      .order("session_number", { ascending: false, nullsFirst: false })
      .order("session_date", { ascending: false, nullsFirst: false });

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as SessionRow[];
    return rows.map((row, index) => rowToSession(row, index, rows.length));
  } catch (error) {
    wrapDbError(
      error,
      "Unable to load sessions from Supabase. Please check your connection and try again."
    );
  }
}

export async function assertClientOwned(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string
): Promise<boolean> {
  if (!isUuid(clientId)) return false;

  const { data, error } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("coach_id", coachId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data);
}

export type OwnedClientState = {
  id: string;
  archivedAt: string | null;
  status: string;
};

/** Load minimal ownership + archive state. Returns null for missing/foreign clients. */
export async function getOwnedClientState(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string
): Promise<OwnedClientState | null> {
  if (!isUuid(clientId)) return null;

  // Prefer archived_at when migrated; fall back to status-only for partially migrated DBs.
  const withArchive = await supabase
    .from("clients")
    .select("id, archived_at, status")
    .eq("id", clientId)
    .eq("coach_id", coachId)
    .maybeSingle();

  if (!withArchive.error && withArchive.data) {
    return {
      id: withArchive.data.id,
      archivedAt: withArchive.data.archived_at ?? null,
      status: withArchive.data.status ?? "Active",
    };
  }

  if (withArchive.error && !/archived_at/i.test(withArchive.error.message)) {
    throw new Error(withArchive.error.message);
  }

  const fallback = await supabase
    .from("clients")
    .select("id, status")
    .eq("id", clientId)
    .eq("coach_id", coachId)
    .maybeSingle();

  if (fallback.error) throw new Error(fallback.error.message);
  if (!fallback.data) return null;

  const status = fallback.data.status ?? "Active";
  return {
    id: fallback.data.id,
    archivedAt: status === "Archived" ? new Date().toISOString() : null,
    status,
  };
}

export async function assertClientActive(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string
): Promise<"ok" | "missing" | "archived"> {
  const state = await getOwnedClientState(supabase, coachId, clientId);
  if (!state) return "missing";
  if (state.archivedAt || state.status === "Archived") return "archived";
  return "ok";
}

export class OwnershipError extends Error {
  constructor(message = "Resource not found.") {
    super(message);
    this.name = "OwnershipError";
  }
}

export class ClientArchivedError extends Error {
  constructor(
    message = "This client is archived. Restore them to add new coaching activity."
  ) {
    super(message);
    this.name = "ClientArchivedError";
  }
}

export type ClientProfileUpdate = {
  name: string;
  organisation: string;
  role: string;
  email: string;
  /** Coaching Purpose — persisted as current_focus. */
  currentFocus?: string;
  /** Active or Paused only — Archived uses archive/restore endpoints. */
  status?: "Active" | "Paused";
  /** null clears override (use coach default). undefined leaves unchanged. */
  preparationStyleOverride?: PreparationStyle | null;
  relationshipAgreement?: RelationshipAgreement;
  initialConversation?: InitialConversation;
  supportingContext?: SupportingContextItem[];
};

export async function updateClientProfileInDb(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
  update: ClientProfileUpdate
): Promise<Client | null> {
  try {
    const owned = await assertClientOwned(supabase, coachId, clientId);
    if (!owned) return null;

    const name = update.name.trim();
    if (!name) {
      throw new Error("Client name is required.");
    }

    const patch: Record<string, string | null> = {
      name,
      organisation: update.organisation.trim() || null,
      role: update.role.trim() || null,
      email: update.email.trim() || null,
      initials: initialsFromName(name),
      updated_at: new Date().toISOString(),
    };
    if (typeof update.currentFocus === "string") {
      patch.current_focus = update.currentFocus.trim() || null;
    }
    if (update.status === "Active" || update.status === "Paused") {
      patch.status = update.status;
    }
    if (update.preparationStyleOverride !== undefined) {
      patch.preparation_style_override = update.preparationStyleOverride;
    }

    const jsonPatch: Record<string, unknown> = { ...patch };
    if (update.relationshipAgreement !== undefined) {
      jsonPatch.relationship_agreement = update.relationshipAgreement;
    }
    if (update.initialConversation !== undefined) {
      jsonPatch.initial_conversation = update.initialConversation;
    }
    if (update.supportingContext !== undefined) {
      jsonPatch.supporting_context = update.supportingContext;
    }

    const { data, error } = await supabase
      .from("clients")
      .update(jsonPatch)
      .eq("id", clientId)
      .eq("coach_id", coachId)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    const row = data as ClientRow;
    const [{ data: sessionRows }, { data: itemRows }] = await Promise.all([
      supabase.from("sessions").select("*").eq("client_id", clientId).eq("coach_id", coachId),
      supabase.from("client_items").select("*").eq("client_id", clientId).eq("coach_id", coachId),
    ]);

    return assembleClient(
      row,
      (sessionRows ?? []) as SessionRow[],
      (itemRows ?? []) as ClientItemRow[]
    );
  } catch (error) {
    wrapDbError(error, "Unable to update the client in Supabase.");
  }
}

export async function archiveClientInDb(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string
): Promise<Client | null> {
  try {
    const state = await getOwnedClientState(supabase, coachId, clientId);
    if (!state) return null;

    const now = new Date().toISOString();
    const patch = {
      archived_at: state.archivedAt ?? now,
      archived_by: coachId,
      status: "Archived",
      updated_at: now,
    };

    // Prefer authenticated RLS update; fall back to service role after ownership check
    // when archive RPCs / columns are only partially available via PostgREST.
    let row: ClientRow | null = null;

    const { data, error } = await supabase
      .from("clients")
      .update(patch)
      .eq("id", clientId)
      .eq("coach_id", coachId)
      .select("*")
      .maybeSingle();

    if (!error && data) {
      row = data as ClientRow;
    } else if (
      error &&
      (/archive_client|schema cache|archived_at|archived_by/i.test(error.message) ||
        isMissingRelationError(error.message)) &&
      isSupabaseServiceRoleConfigured()
    ) {
      const admin = getAdminClient();
      const adminUpdate = await admin
        .from("clients")
        .update(patch)
        .eq("id", clientId)
        .eq("coach_id", coachId)
        .select("*")
        .maybeSingle();

      if (adminUpdate.error) {
        // Last resort: status-only archive when archive columns are absent.
        if (/archived_at|archived_by/i.test(adminUpdate.error.message)) {
          const statusOnly = await admin
            .from("clients")
            .update({ status: "Archived", updated_at: now })
            .eq("id", clientId)
            .eq("coach_id", coachId)
            .select("*")
            .maybeSingle();
          if (statusOnly.error) throw new Error(statusOnly.error.message);
          row = statusOnly.data as ClientRow | null;
        } else {
          throw new Error(adminUpdate.error.message);
        }
      } else {
        row = adminUpdate.data as ClientRow | null;
      }
    } else if (error) {
      throw new Error(error.message);
    }

    if (!row) return null;
    return assembleClient(row, [], []);
  } catch (error) {
    wrapDbError(error, "Unable to archive the client in Supabase.");
  }
}

export async function restoreClientInDb(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string
): Promise<Client | null> {
  try {
    const state = await getOwnedClientState(supabase, coachId, clientId);
    if (!state) return null;

    const now = new Date().toISOString();
    const patch = {
      archived_at: null,
      archived_by: null,
      status: "Active",
      updated_at: now,
    };

    let row: ClientRow | null = null;

    const { data, error } = await supabase
      .from("clients")
      .update(patch)
      .eq("id", clientId)
      .eq("coach_id", coachId)
      .select("*")
      .maybeSingle();

    if (!error && data) {
      row = data as ClientRow;
    } else if (
      error &&
      (/restore_client|schema cache|archived_at|archived_by/i.test(error.message) ||
        isMissingRelationError(error.message)) &&
      isSupabaseServiceRoleConfigured()
    ) {
      const admin = getAdminClient();
      const adminUpdate = await admin
        .from("clients")
        .update(patch)
        .eq("id", clientId)
        .eq("coach_id", coachId)
        .select("*")
        .maybeSingle();

      if (adminUpdate.error) {
        if (/archived_at|archived_by/i.test(adminUpdate.error.message)) {
          const statusOnly = await admin
            .from("clients")
            .update({ status: "Active", updated_at: now })
            .eq("id", clientId)
            .eq("coach_id", coachId)
            .select("*")
            .maybeSingle();
          if (statusOnly.error) throw new Error(statusOnly.error.message);
          row = statusOnly.data as ClientRow | null;
        } else {
          throw new Error(adminUpdate.error.message);
        }
      } else {
        row = adminUpdate.data as ClientRow | null;
      }
    } else if (error) {
      throw new Error(error.message);
    }

    if (!row) return null;
    return assembleClient(row, [], []);
  } catch (error) {
    wrapDbError(error, "Unable to restore the client in Supabase.");
  }
}

/**
 * Permanently delete a coach-owned client and all dependent coaching records.
 *
 * Does NOT depend on PostgREST RPC visibility (permanently_delete_client).
 * Flow:
 *  1. Prove ownership with the authenticated (RLS) session client
 *  2. Delete dependent rows (reports → sessions → items) then the client,
 *     using the service role so incomplete RLS / missing CASCADE cannot block cleanup
 *  3. Scope every delete by both client_id and coach_id
 */
export async function permanentlyDeleteClientInDb(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string
): Promise<boolean> {
  try {
    const state = await getOwnedClientState(supabase, coachId, clientId);
    if (!state) return false;

    if (!isSupabaseServiceRoleConfigured()) {
      // Authenticated cascade without service role (requires DELETE policies + CASCADE/FKs).
      await deleteOwnedClientDependents(supabase, coachId, clientId);
      const { data, error } = await supabase
        .from("clients")
        .delete()
        .eq("id", clientId)
        .eq("coach_id", coachId)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data);
    }

    const admin = getAdminClient();

    // Re-check ownership with admin (prevents TOCTOU against foreign ids).
    const owned = await admin
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("coach_id", coachId)
      .maybeSingle();
    if (owned.error) throw new Error(owned.error.message);
    if (!owned.data) return false;

    await deleteOwnedClientDependents(admin, coachId, clientId);

    const { data, error } = await admin
      .from("clients")
      .delete()
      .eq("id", clientId)
      .eq("coach_id", coachId)
      .select("id")
      .maybeSingle();

    if (error) throw new Error(error.message);
    return Boolean(data);
  } catch (error) {
    wrapDbError(error, "Unable to delete the client in Supabase.");
  }
}
