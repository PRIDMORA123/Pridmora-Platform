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

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const denied = requireOrganisationPermission(
    auth.context,
    "organisation.view_safe_oversight"
  );
  if (denied) return denied;

  try {
    const organisation = auth.context.organisation.organisation;
    const metrics = await loadSafeOversightMetrics(
      auth.context.supabase,
      auth.context.organisation.organisationId,
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
        auth.context.supabase,
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
    const message = error instanceof Error ? error.message : "Unable to load oversight.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
