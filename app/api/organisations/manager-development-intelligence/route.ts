import { NextResponse } from "next/server";
import {
  requireOrganisationContext,
  requireOrganisationPermission,
} from "@/lib/organisations/current-organisation";
import { writeOrganisationAudit } from "@/lib/organisations/repository";
import {
  buildManagerDevelopmentIntelligence,
  toLeadSafeManagerDevelopmentPayload,
} from "@/lib/manager-development-intelligence";
import {
  getSupabaseServiceClient,
  isSupabaseServiceRoleConfigured,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Stage 3.1 — Lead-safe Manager Development Intelligence.
 * Separate from relationship Organisation Intelligence.
 *
 * Access: intelligence.organisation.read (owner / administrator / oversight).
 * Aggregation uses a privileged server client after permission checks so that
 * private Manager rows never need to be readable by the Lead under RLS.
 * Only anonymised aggregates are returned.
 */
export async function GET() {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const denied = requireOrganisationPermission(
    auth.context,
    "intelligence.organisation.read"
  );
  if (denied) return denied;

  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json(
      { error: "Server configuration is incomplete." },
      { status: 503 }
    );
  }

  const organisationId = auth.context.organisation.organisationId;

  try {
    const view = await buildManagerDevelopmentIntelligence({
      supabase: getSupabaseServiceClient(),
      organisationId,
    });
    const payload = toLeadSafeManagerDevelopmentPayload(view);

    await writeOrganisationAudit({
      supabase: auth.context.supabase,
      organisationId,
      actorUserId: auth.context.user.id,
      action: "manager_development_intelligence.read",
      entityType: "organisation",
      entityId: organisationId,
      metadata: {
        status: payload.status,
        patternCount: payload.patterns.length,
      },
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Manager Development Intelligence.",
      },
      { status: 500 }
    );
  }
}
