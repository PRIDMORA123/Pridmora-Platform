/**
 * Stage 2.2.3 — minimised read-only Manager development context for Aurelia.
 * Focus titles + incomplete action titles only. Never creates a self-dev record.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { findSelfDevelopmentClient } from "@/lib/my-development/self-relationship";

export const MANAGER_AURELIA_MAX_FOCUS_TITLES = 3;
export const MANAGER_AURELIA_MAX_ACTIVE_ACTIONS = 3;
export const MANAGER_AURELIA_CONTEXT_TITLE_CHARS = 80;
export const MANAGER_AURELIA_CONTEXT_HARD_MAX_CHARS = 900;

export type ManagerAureliaContextActionStatus = "Open" | "In progress";

export type ManagerAureliaContextAction = {
  title: string;
  status: ManagerAureliaContextActionStatus;
  due?: string;
};

export type ManagerAureliaDevelopmentContext = {
  focusTitles: string[];
  actions: ManagerAureliaContextAction[];
};

export const EMPTY_MANAGER_AURELIA_DEVELOPMENT_CONTEXT: ManagerAureliaDevelopmentContext =
  {
    focusTitles: [],
    actions: [],
  };

function truncateTitle(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  if (trimmed.length <= MANAGER_AURELIA_CONTEXT_TITLE_CHARS) return trimmed;
  return trimmed.slice(0, MANAGER_AURELIA_CONTEXT_TITLE_CHARS).trim();
}

function asIncompleteStatus(
  value: unknown
): ManagerAureliaContextActionStatus | null {
  if (value === "Open" || value === "In progress") return value;
  return null;
}

/**
 * Compact deterministic context for the model. Empty string when no context.
 * Hard-bounded to MANAGER_AURELIA_CONTEXT_HARD_MAX_CHARS.
 */
export function formatManagerAureliaDevelopmentContext(
  context: ManagerAureliaDevelopmentContext
): string {
  const focusTitles = context.focusTitles
    .map(truncateTitle)
    .filter(Boolean)
    .slice(0, MANAGER_AURELIA_MAX_FOCUS_TITLES);
  const actions = context.actions
    .slice(0, MANAGER_AURELIA_MAX_ACTIVE_ACTIONS)
    .map(action => ({
      title: truncateTitle(action.title),
      status: action.status,
      due: action.due?.trim() || undefined,
    }))
    .filter(action => action.title);

  if (focusTitles.length === 0 && actions.length === 0) return "";

  const build = (
    focuses: string[],
    acts: typeof actions
  ): string => {
    const lines: string[] = ["MANAGER DEVELOPMENT CONTEXT"];
    if (focuses.length > 0) {
      lines.push("");
      lines.push("Current development focuses:");
      for (const title of focuses) lines.push(`- ${title}`);
    }
    if (acts.length > 0) {
      lines.push("");
      lines.push("Active development actions:");
      for (const action of acts) {
        const due = action.due ? ` — due ${action.due}` : "";
        lines.push(`- ${action.title} — ${action.status}${due}`);
      }
    }
    return lines.join("\n").trim();
  };

  let focuses = focusTitles;
  let acts = actions;
  let formatted = build(focuses, acts);

  while (formatted.length > MANAGER_AURELIA_CONTEXT_HARD_MAX_CHARS) {
    if (acts.length > 0) {
      acts = acts.slice(0, -1);
    } else if (focuses.length > 0) {
      focuses = focuses.slice(0, -1);
    } else {
      return "";
    }
    formatted = build(focuses, acts);
  }

  return formatted;
}

export function isManagerAureliaDevelopmentContextEmpty(
  context: ManagerAureliaDevelopmentContext
): boolean {
  return context.focusTitles.length === 0 && context.actions.length === 0;
}

/**
 * Read-only load of approved minimised context for the authenticated Manager.
 * Does not create a self-development relationship. Does not load reflections,
 * evidence, assessments, profiles, patterns, or team/person data.
 */
export async function loadManagerAureliaDevelopmentContext(input: {
  supabase: SupabaseClient;
  organisationId: string;
  userId: string;
}): Promise<ManagerAureliaDevelopmentContext> {
  const organisationId = input.organisationId.trim();
  const userId = input.userId.trim();
  if (!organisationId || !userId) {
    return { ...EMPTY_MANAGER_AURELIA_DEVELOPMENT_CONTEXT };
  }

  const selfClient = await findSelfDevelopmentClient(
    input.supabase,
    organisationId,
    userId
  );
  if (!selfClient) {
    return { ...EMPTY_MANAGER_AURELIA_DEVELOPMENT_CONTEXT };
  }

  const [{ data: themeRows }, { data: actionRows }] = await Promise.all([
    input.supabase
      .from("client_items")
      .select("title")
      .eq("client_id", selfClient.id)
      .eq("coach_id", userId)
      .eq("item_type", "theme")
      .order("created_at", { ascending: true }),
    input.supabase
      .from("client_items")
      .select("title, status, event_date")
      .eq("client_id", selfClient.id)
      .eq("coach_id", userId)
      .eq("item_type", "action")
      .order("created_at", { ascending: false }),
  ]);

  let focusTitles = (themeRows ?? [])
    .map(row => truncateTitle(String(row.title ?? "")))
    .filter(Boolean)
    .slice(0, MANAGER_AURELIA_MAX_FOCUS_TITLES);

  // Safe non-placeholder fallback matching My Development workspace seeding.
  if (focusTitles.length === 0) {
    const current = String(selfClient.currentFocus ?? "").trim();
    if (current && current !== "Personal development record") {
      const seeded = truncateTitle(current);
      if (seeded) focusTitles = [seeded];
    }
  }

  const actions: ManagerAureliaContextAction[] = [];
  for (const row of actionRows ?? []) {
    if (actions.length >= MANAGER_AURELIA_MAX_ACTIVE_ACTIONS) break;
    const status = asIncompleteStatus(row.status);
    if (!status) continue;
    const title = truncateTitle(String(row.title ?? ""));
    if (!title) continue;
    const due = row.event_date ? String(row.event_date) : undefined;
    actions.push(due ? { title, status, due } : { title, status });
  }

  return { focusTitles, actions };
}
