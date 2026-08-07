import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  EVIDENCE_TYPE_LABELS,
  listEvidenceForClient,
  toEvidenceListItem,
} from "@/lib/development-evidence";
import { calculateEvidenceConfidence } from "@/lib/development-evidence/confidence";
import { calculateEvidenceCoverage } from "@/lib/development-evidence/coverage";

type Params = { params: Promise<{ clientId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ error: "clientId is required." }, { status: 400 });
  }

  try {
    const { data: client, error } = await auth.context.supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .maybeSingle();

    if (error || !client) {
      return NextResponse.json({ error: "Person not found." }, { status: 404 });
    }

    const records = await listEvidenceForClient(
      auth.context.supabase,
      auth.context.user.id,
      clientId
    );

    const items = records.map(record => toEvidenceListItem(record));
    const included = records.filter(item => item.includeInIntelligence);
    const confidence = calculateEvidenceConfidence({
      evidence: included.map(item => ({
        id: item.id,
        evidenceType: item.evidenceType,
        sourceType: item.sourceType,
        freshnessClass: item.freshnessClass,
        includeInIntelligence: item.includeInIntelligence,
        reviewStatus: item.reviewStatus,
        independenceKey:
          item.contentHash ||
          item.sourceRecordId ||
          `${item.evidenceType}:${item.title}`,
        hasBehaviouralSpecificity: Boolean(
          item.structuredEvidence.observations?.some(
            observation => observation.behaviouralEvidence
          )
        ),
        capabilityKeys: item.capabilityKeys,
        contradictionCount:
          item.structuredEvidence.contradictoryEvidence?.length ?? 0,
      })),
    });
    const coverage = calculateEvidenceCoverage(included);

    return NextResponse.json({
      items,
      confidence,
      coverage,
      uploadableTypes: Object.entries(EVIDENCE_TYPE_LABELS)
        .filter(([key]) =>
          [
            "feedback_360",
            "disc",
            "insights_discovery",
            "clifton_strengths",
            "hogan",
            "lumina",
            "mbti",
            "emotional_intelligence",
            "leadership_assessment",
            "pdp",
            "appraisal_review",
            "learning_record",
            "qualification",
            "competency_assessment",
            "organisation_framework",
            "personal_reflection",
            "stakeholder_feedback",
            "other_document",
          ].includes(key)
        )
        .map(([value, label]) => ({ value, label })),
    });
  } catch (error) {
    console.error(
      "Development evidence list error:",
      error instanceof Error ? error.message : "unknown"
    );
    return NextResponse.json(
      { error: "Unable to load development evidence." },
      { status: 500 }
    );
  }
}
