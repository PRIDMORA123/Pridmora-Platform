import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  getEvidenceById,
  softDeleteEvidence,
  toEvidenceListItem,
} from "@/lib/development-evidence";

type Params = { params: Promise<{ evidenceId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { evidenceId } = await params;
  try {
    const detail = await getEvidenceById(
      auth.context.supabase,
      auth.context.user.id,
      evidenceId
    );

    return NextResponse.json({
      evidence: detail.evidence,
      listItem: toEvidenceListItem(detail.evidence, {
        observationCount: detail.observations.length,
        approvedObservationCount: detail.observations.filter(
          item => item.includeInIntelligence
        ).length,
        fileName: detail.document?.fileName ?? null,
      }),
      observations: detail.observations,
      document: detail.document
        ? {
            id: detail.document.id,
            fileName: detail.document.fileName,
            mimeType: detail.document.mimeType,
            byteSize: detail.document.byteSize,
            extractionStatus: detail.document.extractionStatus,
            extractionMethod: detail.document.extractionMethod,
            // Never return full extracted text to list UIs by default.
            hasExtractedText: Boolean(detail.document.extractedText),
          }
        : null,
      links: detail.links,
    });
  } catch {
    return NextResponse.json({ error: "Evidence not found." }, { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { evidenceId } = await params;
  try {
    await softDeleteEvidence({
      supabase: auth.context.supabase,
      userId: auth.context.user.id,
      evidenceId,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Unable to delete evidence." },
      { status: 400 }
    );
  }
}
