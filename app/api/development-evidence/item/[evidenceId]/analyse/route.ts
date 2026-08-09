import { NextResponse } from "next/server";
import { notFoundOrForbidden } from "@/lib/auth/session";
import { analyseEvidenceDocument } from "@/lib/development-evidence";
import { getEvidenceById } from "@/lib/development-evidence/repository";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ evidenceId: string }> };

export async function POST(request: Request, { params }: Params) {
  const org = await requireOrganisationContext();
  if (!org.ok) return org.response;

  const { evidenceId } = await params;
  let force = false;
  try {
    const body = (await request.json()) as { force?: boolean };
    force = Boolean(body.force);
  } catch {
    force = false;
  }

  try {
    const detail = await getEvidenceById(
      org.context.supabase,
      org.context.user.id,
      evidenceId
    );

    const access = await requireAssignedPersonInOrganisation({
      clientId: detail.evidence.clientId,
      requireAiEnabled: true,
    });
    if (!access.ok) return access.response;

    const { data: client, error } = await access.context.supabase
      .from("clients")
      .select(
        "id, name, role, organisation, identity_mode, display_label, confidential_reference, ai_name_allowed"
      )
      .eq("id", detail.evidence.clientId)
      .maybeSingle();

    if (error || !client) {
      return notFoundOrForbidden();
    }

    const result = await analyseEvidenceDocument({
      supabase: access.context.supabase,
      userId: access.context.user.id,
      evidenceId,
      client: {
        name: String(client.name ?? ""),
        role: (client.role as string | null) ?? null,
        organisation: (client.organisation as string | null) ?? null,
        identityMode: (client.identity_mode as string | null) ?? "standard",
        displayLabel: (client.display_label as string | null) ?? null,
        confidentialReference:
          (client.confidential_reference as string | null) ?? null,
        aiNameAllowed: Boolean(client.ai_name_allowed),
      },
      // Private identity deliberately omitted — never load for AI analysis.
      privateIdentity: null,
      force,
    });

    const refreshed = await getEvidenceById(
      access.context.supabase,
      access.context.user.id,
      evidenceId
    );

    return NextResponse.json({
      ...result,
      evidence: refreshed.evidence,
      observations: refreshed.observations,
    });
  } catch (error) {
    console.error(
      "Evidence analyse error:",
      error instanceof Error ? error.message : "unknown"
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to analyse evidence.",
      },
      { status: 400 }
    );
  }
}
