import type { CoachingAction, Client, Session } from "@/lib/types";
import type { PreparationStyle } from "@/lib/preparation-style";
import { AuthRequiredError, errorMessage, toError } from "@/lib/errors";
import { isUuid } from "@/lib/auth/browser";
import { apiJson } from "@/lib/api-client";
import { toUserFriendlySupabaseError } from "@/lib/supabase/errors";

/**
 * Load all clients (with sessions and client_items) from Supabase.
 * Uses GET /api/clients → listClientsFromDb.
 */
export async function loadClients(): Promise<Client[]> {
  try {
    const data = await apiJson<{ clients: Client[] }>("/api/clients", { method: "GET" });
    return data.clients;
  } catch (error) {
    if (error instanceof AuthRequiredError) throw error;
    throw toError(toUserFriendlySupabaseError(error));
  }
}

/**
 * Create a client and its initial session in Supabase.
 * Uses POST /api/clients → createClientInDb.
 * coach_id is assigned on the server from the authenticated session.
 */
export async function createClientRecord(input: {
  name: string;
  organisation?: string;
  role?: string;
  currentFocus?: string;
  email?: string;
}): Promise<Client> {
  try {
    const data = await apiJson<{ client: Client }>("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        organisation: input.organisation ?? "",
        role: input.role ?? "",
        currentFocus: input.currentFocus ?? "",
        email: input.email ?? "",
      }),
    });
    return data.client;
  } catch (error) {
    if (error instanceof AuthRequiredError) throw error;
    if (process.env.NODE_ENV === "development") {
      console.error("[createClientRecord] Failed", {
        message: error instanceof Error ? error.message : String(error),
        code: error && typeof error === "object" && "code" in error ? error.code : undefined,
        details: error && typeof error === "object" && "details" in error ? error.details : undefined,
        hint: error && typeof error === "object" && "hint" in error ? error.hint : undefined,
        status: error && typeof error === "object" && "status" in error ? error.status : undefined,
        error,
      });
    }
    // Prefer the API/database message already on the Error — do not replace with a generic string.
    throw toError(error, toUserFriendlySupabaseError(error));
  }
}

/**
 * Load all coaching sessions for a client from Supabase (newest first).
 * clientId must be a UUID from an authenticated coach-owned client record.
 */
export async function loadSessionsForClient(clientId: string): Promise<Session[]> {
  if (!clientId.trim() || !isUuid(clientId)) {
    throw new Error("A valid client is required before loading sessions.");
  }

  try {
    const data = await apiJson<{ sessions: Session[] }>(
      `/api/sessions?clientId=${encodeURIComponent(clientId)}`,
      {
        method: "GET",
        operation: "load_relationship_sessions",
        relationshipId: clientId,
      }
    );
    return data.sessions ?? [];
  } catch (error) {
    if (error instanceof AuthRequiredError) throw error;
    throw toError(
      error,
      toUserFriendlySupabaseError(error) ||
        "Unable to load relationship sessions."
    );
  }
}

/**
 * Create a new coaching session in Supabase without touching prior sessions.
 */
export async function createSessionRecord(session: Session): Promise<Session> {
  try {
    const data = await apiJson<{ session: Session }>("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session }),
    });
    return data.session;
  } catch (error) {
    if (error instanceof AuthRequiredError) throw error;
    throw toError(errorMessage(error, toUserFriendlySupabaseError(error)));
  }
}

/**
 * Persist a structured coaching session to Supabase.
 * Updates only the selected session row (matched by id).
 */
export async function saveSessionRecord(session: Session): Promise<Session> {
  try {
    const data = await apiJson<{ session: Session }>("/api/sessions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session }),
    });
    return data.session;
  } catch (error) {
    if (error instanceof AuthRequiredError) throw error;
    throw toError(errorMessage(error, toUserFriendlySupabaseError(error)));
  }
}

export type ClientProfileFields = {
  name: string;
  organisation: string;
  role: string;
  email: string;
  /** Coaching Purpose — maps to clients.current_focus. */
  currentFocus?: string;
  /** Active or Paused only — Archived uses archive/restore endpoints. */
  status?: "Active" | "Paused";
  /** null = use coach default. */
  preparationStyleOverride?: PreparationStyle | null;
  relationshipAgreement?: import("@/lib/relationship-meta").RelationshipAgreement;
  initialConversation?: import("@/lib/relationship-meta").InitialConversation;
  supportingContext?: import("@/lib/relationship-meta").SupportingContextItem[];
};

export async function updateClientRecord(
  clientId: string,
  fields: ClientProfileFields
): Promise<Client> {
  try {
    const data = await apiJson<{ client: Client }>(`/api/clients/${encodeURIComponent(clientId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    return data.client;
  } catch (error) {
    if (error instanceof AuthRequiredError) throw error;
    throw toError(errorMessage(error, toUserFriendlySupabaseError(error)));
  }
}

export async function archiveClientRecord(clientId: string): Promise<Client> {
  try {
    const data = await apiJson<{ client: Client }>(
      `/api/clients/${encodeURIComponent(clientId)}/archive`,
      { method: "POST" }
    );
    return data.client;
  } catch (error) {
    if (error instanceof AuthRequiredError) throw error;
    throw toError(errorMessage(error, toUserFriendlySupabaseError(error)));
  }
}

export async function restoreClientRecord(clientId: string): Promise<Client> {
  try {
    const data = await apiJson<{ client: Client }>(
      `/api/clients/${encodeURIComponent(clientId)}/restore`,
      { method: "POST" }
    );
    return data.client;
  } catch (error) {
    if (error instanceof AuthRequiredError) throw error;
    throw toError(errorMessage(error, toUserFriendlySupabaseError(error)));
  }
}

export async function permanentlyDeleteClientRecord(clientId: string): Promise<void> {
  try {
    await apiJson<{ ok: boolean }>(`/api/clients/${encodeURIComponent(clientId)}`, {
      method: "DELETE",
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) throw error;
    throw toError(errorMessage(error, toUserFriendlySupabaseError(error)));
  }
}

export async function saveActionRecord(
  action: CoachingAction & { clientId: string }
): Promise<CoachingAction> {
  try {
    const method = action.id ? "PUT" : "POST";
    const data = await apiJson<{ action: CoachingAction }>("/api/actions", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    return data.action;
  } catch (error) {
    if (error instanceof AuthRequiredError) throw error;
    throw toError(errorMessage(error, toUserFriendlySupabaseError(error)));
  }
}

export async function createActionRecord(
  action: Omit<CoachingAction, "id"> & { clientId: string; id?: string }
): Promise<CoachingAction> {
  try {
    const data = await apiJson<{ action: CoachingAction }>("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: {
          ...action,
          id: action.id || crypto.randomUUID(),
        },
      }),
    });
    return data.action;
  } catch (error) {
    if (error instanceof AuthRequiredError) throw error;
    throw toError(errorMessage(error, toUserFriendlySupabaseError(error)));
  }
}

export async function deleteActionRecord(actionId: string): Promise<void> {
  try {
    await apiJson<{ ok: boolean }>(`/api/actions?id=${encodeURIComponent(actionId)}`, {
      method: "DELETE",
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) throw error;
    throw toError(errorMessage(error, toUserFriendlySupabaseError(error)));
  }
}

export { errorMessage, toError, AuthRequiredError };
