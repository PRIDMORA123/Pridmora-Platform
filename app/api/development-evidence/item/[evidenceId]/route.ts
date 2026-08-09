import { NextResponse } from "next/server";
import { notFoundOrForbidden } from "@/lib/auth/session";
import {
  getEvidenceById,
  softDeleteEvidence,
  toEvidenceListItem,
} from "@/lib/development-evidence";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";

type Params = { params: Promise<{ evidenceId: string }> };

export async function GET(_request: Request, { params }: Params) {
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
    return notFoundOrForbidden();
  }
}

export async function DELETE(_request: Request, { params }: Params) {
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

    await softDeleteEvidence({
      supabase: access.context.supabase,
      userId: access.context.user.id,
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
