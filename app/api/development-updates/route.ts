import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { developmentUpdateErrorResponse } from "@/lib/development-updates/api-response";
import {
  listReadyDevelopmentUpdates,
  listRecentlyAppliedDevelopmentUpdates,
} from "@/lib/development-updates/repository";

async function clientNameMap(
  supabase: SupabaseClient,
  coachId: string,
  clientIds: string[]
) {
  if (clientIds.length === 0) return new Map<string, string>();

  const { data } = await supabase
    .from("clients")
    .select("id, name")
    .in("id", clientIds)
    .eq("coach_id", coachId);

  return new Map((data ?? []).map(row => [row.id as string, row.name as string]));
}

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    const [updates, applied] = await Promise.all([
      listReadyDevelopmentUpdates(auth.context.supabase, auth.context.user.id),
      listRecentlyAppliedDevelopmentUpdates(
        auth.context.supabase,
        auth.context.user.id
      ),
    ]);

    const clientIds = [
      ...new Set([
        ...updates.map(update => update.clientId),
        ...applied.map(update => update.clientId),
      ]),
    ];
    const clientNames = await clientNameMap(
      auth.context.supabase,
      auth.context.user.id,
      clientIds
    );

    const sessionIds = [...new Set(updates.map(update => update.sessionId))];
    let sessionDates = new Map<string, string>();
    if (sessionIds.length > 0) {
      const { data } = await auth.context.supabase
        .from("sessions")
        .select("id, session_date, display_date")
        .in("id", sessionIds)
        .eq("coach_id", auth.context.user.id);
      sessionDates = new Map(
        (data ?? []).map(row => [
          row.id as string,
          String(row.display_date || row.session_date || ""),
        ])
      );
    }

    const tasks = updates.map(update => ({
      update,
      clientId: update.clientId,
      clientName: clientNames.get(update.clientId) ?? "Person",
      sessionId: update.sessionId,
      sessionDate: sessionDates.get(update.sessionId) ?? "",
    }));

    const recentlyApplied = applied.map(update => ({
      update,
      clientId: update.clientId,
      clientName: clientNames.get(update.clientId) ?? "Person",
    }));

    return NextResponse.json({
      awaitingReview: tasks,
      recentlyApplied,
      count: tasks.length,
    });
  } catch (error) {
    return developmentUpdateErrorResponse(
      error,
      "Unable to load development updates right now."
    );
  }
}
