import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoachingAction } from "@/lib/types";
import { upsertActionInDb } from "@/lib/supabase/repository";
import type {
  CommitmentChanges,
  ProposedProfileChanges,
} from "@/lib/development-updates/types";
import { hasNearDuplicateOpenAction } from "@/lib/preparation/commitment-selection";

function normaliseTitle(value: string): string {
  return value.trim().toLowerCase();
}

function resolveItemValue(
  item: string | { id?: string; value?: string }
): string {
  if (typeof item === "string") return item.trim();
  return (item.value ?? "").trim();
}

function mapActionRow(row: Record<string, unknown>, clientId: string): CoachingAction & {
  clientId: string;
} {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    status: (String(row.status ?? "Open") ||
      "Open") as CoachingAction["status"],
    due: row.event_date ? String(row.event_date) : undefined,
    owner: row.owner ? String(row.owner) : undefined,
    notes: row.detail ? String(row.detail) : undefined,
    sessionId: row.session_id ? String(row.session_id) : null,
    clientId,
  };
}

/**
 * Keep Open Commitments aligned with development profile commitments after apply.
 */
export async function syncCommitmentActionsAfterApply(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
  sessionId: string,
  changes: ProposedProfileChanges
): Promise<{ created: number; completed: number }> {
  const commitmentChanges: CommitmentChanges | undefined = changes.commitments;
  if (!commitmentChanges) return { created: 0, completed: 0 };

  const adds = commitmentChanges.add ?? [];
  const completes = commitmentChanges.complete ?? [];
  if (adds.length === 0 && completes.length === 0) {
    return { created: 0, completed: 0 };
  }

  const { data: actionRows, error } = await supabase
    .from("client_items")
    .select("*")
    .eq("client_id", clientId)
    .eq("coach_id", coachId)
    .eq("item_type", "action");

  if (error) {
    throw new Error(error.message || "Unable to load actions for commitment sync.");
  }

  const actions = (actionRows ?? []).map(row =>
    mapActionRow(row as Record<string, unknown>, clientId)
  );
  const openActions = actions.filter(action => action.status !== "Complete");
  const openTitles = openActions.map(action => action.title);

  let created = 0;
  for (const add of adds) {
    const value = add.value?.trim();
    if (!value) continue;
    // Exact or semantic near-duplicate → reuse existing open action.
    if (hasNearDuplicateOpenAction(openTitles, value)) continue;

    await upsertActionInDb(supabase, coachId, {
      id: crypto.randomUUID(),
      clientId,
      sessionId,
      title: value,
      status: "Open",
      due: add.dueDate ?? undefined,
    });
    openTitles.push(value);
    created += 1;
  }

  let completed = 0;
  for (const completeItem of completes) {
    const value = resolveItemValue(completeItem);
    if (!value) continue;

    const match = openActions.find(
      action =>
        normaliseTitle(action.title) === normaliseTitle(value) ||
        hasNearDuplicateOpenAction([action.title], value)
    );
    if (!match) continue;

    await upsertActionInDb(supabase, coachId, {
      ...match,
      clientId,
      status: "Complete",
    });
    completed += 1;
  }

  return { created, completed };
}
