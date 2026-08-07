import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { filterClientIdsToOrganisation } from "@/lib/organisations/workspace-scope";
import { developmentUpdateErrorResponse } from "@/lib/development-updates/api-response";
import {
  listReadyDevelopmentUpdates,
  listRecentlyAppliedDevelopmentUpdates,
} from "@/lib/development-updates/repository";

async function clientNameMap(
  supabase: SupabaseClient,
  coachId: string,
  organisationId: string,
  clientIds: string[]
) {
  if (clientIds.length === 0) return new Map<string, string>();

  const { data } = await supabase
    .from("clients")
    .select("id, name")
    .in("id", clientIds)
    .eq("coach_id", coachId)
    .eq("organisation_id", organisationId);

  return new Map((data ?? []).map(row => [row.id as string, row.name as string]));
}

export async function GET() {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  try {
    const organisationId = auth.context.organisation.organisationId;
    const coachId = auth.context.user.id;

    const [updates, applied] = await Promise.all([
      listReadyDevelopmentUpdates(auth.context.supabase, coachId),
      listRecentlyAppliedDevelopmentUpdates(auth.context.supabase, coachId),
    ]);

    const candidateIds = [
      ...new Set([
        ...updates.map(update => update.clientId),
        ...applied.map(update => update.clientId),
      ]),
    ];

    const allowedIds = await filterClientIdsToOrganisation(
      auth.context.supabase,
      organisationId,
      candidateIds
    );

    const scopedUpdates = updates.filter(update => allowedIds.has(update.clientId));
    const scopedApplied = applied.filter(update => allowedIds.has(update.clientId));

    const clientIds = [...allowedIds];
    const clientNames = await clientNameMap(
      auth.context.supabase,
      coachId,
      organisationId,
      clientIds
    );

    const sessionIds = [...new Set(scopedUpdates.map(update => update.sessionId))];
    let sessionDates = new Map<string, string>();
    if (sessionIds.length > 0) {
      const { data } = await auth.context.supabase
        .from("sessions")
        .select("id, session_date, display_date, organisation_id")
        .in("id", sessionIds)
        .eq("coach_id", coachId)
        .eq("organisation_id", organisationId);
      sessionDates = new Map(
        (data ?? []).map(row => [
          row.id as string,
          String(row.display_date || row.session_date || ""),
        ])
      );
    }

    const tasks = scopedUpdates.map(update => ({
      update,
      clientId: update.clientId,
      clientName: clientNames.get(update.clientId) ?? "Person",
      sessionId: update.sessionId,
      sessionDate: sessionDates.get(update.sessionId) ?? "",
    }));

    const recentlyApplied = scopedApplied.map(update => ({
      update,
      clientId: update.clientId,
      clientName: clientNames.get(update.clientId) ?? "Person",
    }));

    return NextResponse.json({
      awaitingReview: tasks,
      recentlyApplied,
      count: tasks.length,
      organisationId,
    });
  } catch (error) {
    return developmentUpdateErrorResponse(
      error,
      "Unable to load development updates right now."
    );
  }
}
