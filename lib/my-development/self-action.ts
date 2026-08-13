/**
 * Stage 2.3.2.1 — Manager self-development action lifecycle.
 * Complete / reopen only; server-resolved self client; no browser ownership ids.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSelfDevelopmentRelationship } from "@/lib/my-development/self-relationship";
import { resolveMyDevelopmentActor } from "@/lib/my-development/workspace";
import {
  ClientArchivedError,
  OwnershipError,
  upsertActionInDb,
} from "@/lib/supabase/repository";
import type { ActionStatus, CoachingAction } from "@/lib/types";

export type MyDevelopmentActionOperation = "complete" | "reopen";

export type MyDevelopmentActionLifecycleResult = {
  action: CoachingAction;
  operation: MyDevelopmentActionOperation;
};

export function parseMyDevelopmentActionOperation(
  value: unknown
): MyDevelopmentActionOperation | null {
  if (value === "complete" || value === "reopen") return value;
  return null;
}

/** Reject browser-supplied ownership / portfolio selectors on this path. */
export function rejectSelfActionOwnershipFields(
  body: Record<string, unknown>
): { ok: true } | { ok: false; error: string; status: number } {
  const forbidden = [
    "clientId",
    "selfClientId",
    "organisationId",
    "personId",
    "managedPersonId",
    "employeeId",
    "relationshipId",
    "teamMemberId",
    "coachId",
    "managerId",
    "userId",
  ] as const;
  for (const key of forbidden) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") {
      return {
        ok: false,
        error: `${key} must not be supplied for My Development action updates.`,
        status: 400,
      };
    }
  }
  if (
    body.action &&
    typeof body.action === "object" &&
    body.action !== null
  ) {
    const nested = body.action as Record<string, unknown>;
    for (const key of forbidden) {
      if (nested[key] !== undefined && nested[key] !== null && nested[key] !== "") {
        return {
          ok: false,
          error: `${key} must not be supplied for My Development action updates.`,
          status: 400,
        };
      }
    }
  }
  return { ok: true };
}

export function resolveStatusForOperation(
  operation: MyDevelopmentActionOperation,
  current: ActionStatus
): ActionStatus | { error: string } {
  if (operation === "complete") {
    if (current !== "Open" && current !== "In progress") {
      return {
        error: "Only Open or In progress actions can be marked complete.",
      };
    }
    return "Complete";
  }
  if (current !== "Complete") {
    return { error: "Only completed actions can be reopened." };
  }
  return "Open";
}

export function buildCompletedActionReflectionContext(actionTitle: string): string {
  const title = actionTitle.trim().replace(/\s+/g, " ");
  return `Completed development action: ${title}`;
}

function asActionStatus(value: unknown): ActionStatus {
  if (value === "Open" || value === "In progress" || value === "Complete") {
    return value;
  }
  return "Open";
}

export function listCompletedDevelopmentActions(
  actions: CoachingAction[],
  limit = 3
): CoachingAction[] {
  return actions
    .filter(action => action.status === "Complete")
    .slice(0, limit);
}

export async function updateMyDevelopmentActionLifecycle(input: {
  supabase: SupabaseClient;
  organisationId: string;
  userId: string;
  email?: string | null;
  actionId: string;
  operation: MyDevelopmentActionOperation;
}): Promise<MyDevelopmentActionLifecycleResult> {
  const actionId = input.actionId.trim();
  if (!actionId) {
    throw new OwnershipError();
  }

  const { fullName } = await resolveMyDevelopmentActor({
    supabase: input.supabase,
    organisationId: input.organisationId,
    userId: input.userId,
    email: input.email,
  });

  const selfClient = await ensureSelfDevelopmentRelationship({
    supabase: input.supabase,
    organisationId: input.organisationId,
    userId: input.userId,
    fullName,
  });

  const { data, error } = await input.supabase
    .from("client_items")
    .select(
      "id, client_id, organisation_id, coach_id, title, status, event_date, detail, owner, session_id, item_type"
    )
    .eq("id", actionId)
    .eq("coach_id", input.userId)
    .eq("item_type", "action")
    .maybeSingle();

  if (error || !data) {
    throw new OwnershipError();
  }

  const rowClientId =
    typeof data.client_id === "string" ? data.client_id.trim() : "";
  if (!rowClientId || rowClientId !== selfClient.id) {
    // Managed-person or foreign self-row — not this Manager's My Development action.
    throw new OwnershipError();
  }

  const rowOrg =
    typeof data.organisation_id === "string"
      ? data.organisation_id.trim()
      : "";
  if (!rowOrg || rowOrg !== input.organisationId.trim()) {
    throw new OwnershipError();
  }

  const current = asActionStatus(data.status);
  const nextStatus = resolveStatusForOperation(input.operation, current);
  if (typeof nextStatus === "object") {
    throw new Error(nextStatus.error);
  }

  const action = await upsertActionInDb(input.supabase, input.userId, {
    id: actionId,
    clientId: selfClient.id,
    title: String(data.title ?? "").trim() || "Development action",
    status: nextStatus,
    due: data.event_date ? String(data.event_date) : undefined,
    owner: data.owner ? String(data.owner) : undefined,
    notes: data.detail ? String(data.detail) : undefined,
    sessionId: data.session_id ? String(data.session_id) : null,
  });

  return { action, operation: input.operation };
}

export { OwnershipError, ClientArchivedError };
