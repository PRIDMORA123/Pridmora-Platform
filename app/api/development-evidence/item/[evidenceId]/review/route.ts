import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { reviewEvidence } from "@/lib/development-evidence";

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
  }>;
  includeAll?: boolean;
  excludeAll?: boolean;
};

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { evidenceId } = await params;

  try {
    const body = (await request.json()) as ReviewBody;
    const decision = body.decision ?? "approve";

    let observationDecisions = body.observationDecisions;

    if (body.includeAll || body.excludeAll) {
      const { data: observations } = await auth.context.supabase
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
      supabase: auth.context.supabase,
      userId: auth.context.user.id,
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
      { error: "Unable to review evidence." },
      { status: 400 }
    );
  }
}
