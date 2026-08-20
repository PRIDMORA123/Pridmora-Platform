import { NextResponse } from "next/server";
import { reviewEvidence } from "@/lib/development-evidence";
import { getEvidenceById } from "@/lib/development-evidence/repository";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";

type Params = { params: Promise<{ evidenceId: string }> };

type ReviewBody = {
  decision?: "approve" | "reject" | "exclude";
  includeInIntelligence?: boolean;
  editedSummary?: string | null;
  observationDecisions?: Array<{
    observationId: string;
    reviewStatus: "approved" | "edited" | "rejected" | "excluded";
    title?: string;
    description?: string;
    includeInIntelligence?: boolean;
    capabilityKey?: string | null;
  }>;
  includeAll?: boolean;
  excludeAll?: boolean;
};

export async function POST(request: Request, { params }: Params) {
  const org = await requireOrganisationContext();
  if (!org.ok) return org.response;

  const { evidenceId } = await params;

  try {
    const detail = await getEvidenceById(
      org.context.supabase,
      org.context.user.id,
      evidenceId
    );

    const access = await requireAssignedPersonInOrganisation({
      clientId: detail.evidence.clientId,
    });
    if (!access.ok) return access.response;

    const body = (await request.json()) as ReviewBody;
    const decision = body.decision ?? "approve";

    let observationDecisions = body.observationDecisions;

    if (body.includeAll || body.excludeAll) {
      const { data: observations } = await access.context.supabase
        .from("development_evidence_observations")
        .select("id")
        .eq("evidence_id", evidenceId);

      observationDecisions = (observations ?? []).map(row => ({
        observationId: String(row.id),
        reviewStatus: body.excludeAll ? "excluded" : "approved",
        includeInIntelligence: Boolean(body.includeAll),
      }));
    }

    const result = await reviewEvidence({
      supabase: access.context.supabase,
      userId: access.context.user.id,
      evidenceId,
      decision,
      includeInIntelligence:
        body.includeInIntelligence ??
        (decision === "approve" && !body.excludeAll),
      observationDecisions,
      editedSummary: body.editedSummary,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      "Evidence review error:",
      error instanceof Error ? error.message : "unknown"
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to review evidence.",
      },
      { status: 400 }
    );
  }
}
