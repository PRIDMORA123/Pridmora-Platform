import { NextResponse } from "next/server";
import {
  requireOrganisationContext,
  requireOrganisationPermission,
} from "@/lib/organisations/current-organisation";
import { loadSafeOversightMetrics } from "@/lib/organisations/oversight";
import {
  formatSeatsInUseLabel,
  loadPractitionerSeatUsage,
} from "@/lib/organisations/licence";
import {
  getSupabaseServiceClient,
  isSupabaseServiceRoleConfigured,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Organisation Overview / Usage metrics.
 *
 * Access: organisation.view_safe_oversight (owner / administrator / oversight).
 * Aggregation uses a privileged server client after permission checks so that
 * Organisation Leads receive org-wide operational counts without needing
 * assignment-scoped RLS on sessions or development updates.
 * Only scalar counts are returned — never notes, summaries, or narrative.
 */
export async function GET() {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const denied = requireOrganisationPermission(
    auth.context,
    "organisation.view_safe_oversight"
  );
  if (denied) return denied;

  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json(
      { error: "Server configuration is incomplete." },
      { status: 503 }
    );
  }

  try {
    const organisation = auth.context.organisation.organisation;
    const organisationId = auth.context.organisation.organisationId;
    const aggregationClient = getSupabaseServiceClient();

    const metrics = await loadSafeOversightMetrics(
      aggregationClient,
      organisationId,
      organisation.name,
      organisation.organisationType
    );

    let seats = {
      seatsPurchased: organisation.licence.seatsPurchased,
      seatsInUse: 0,
      seatsAvailable: organisation.licence.seatsPurchased,
      label: "",
    };
    try {
      const usage = await loadPractitionerSeatUsage(
        aggregationClient,
        organisation.id
      );
      seats = {
        ...usage.summary,
        label: formatSeatsInUseLabel(usage.summary),
      };
    } catch {
      seats.label = formatSeatsInUseLabel(seats);
    }

    return NextResponse.json({
      metrics,
      seats,
      confidentialityNote:
        "Organisation oversight shows operational information only. Confidential coaching content remains available only to authorised relationship practitioners.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load oversight.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
