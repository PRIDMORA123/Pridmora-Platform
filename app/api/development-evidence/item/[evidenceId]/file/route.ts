import { NextResponse } from "next/server";
import { notFoundOrForbidden } from "@/lib/auth/session";
import {
  DEVELOPMENT_EVIDENCE_STORAGE_BUCKET,
  assertDevelopmentEvidenceStoragePathMatches,
  getEvidenceById,
} from "@/lib/development-evidence";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";

export const runtime = "nodejs";

type Params = { params: Promise<{ evidenceId: string }> };

/** Short-lived signed download after assignment-gated authorisation. */
const SIGNED_URL_EXPIRES_SECONDS = 60;

/**
 * SEC-1: Issue a time-limited signed URL for an authorised evidence document.
 * Path always comes from the authorised document row — never from the client.
 */
export async function GET(_request: Request, { params }: Params) {
  const org = await requireOrganisationContext();
  if (!org.ok) return org.response;

  const { evidenceId } = await params;
  if (!evidenceId?.trim()) {
    return NextResponse.json({ error: "evidenceId is required." }, { status: 400 });
  }

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

    const storagePath = detail.document?.storagePath?.trim() ?? "";
    if (!storagePath) {
      return NextResponse.json(
        { error: "No stored file is available for this evidence." },
        { status: 404 }
      );
    }

    assertDevelopmentEvidenceStoragePathMatches({
      storagePath,
      organisationId: detail.evidence.organisationId,
      clientId: detail.evidence.clientId,
    });

    const { data, error } = await access.context.supabase.storage
      .from(DEVELOPMENT_EVIDENCE_STORAGE_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRES_SECONDS);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: "Unable to create a secure download link." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      evidenceId: detail.evidence.id,
      fileName: detail.document?.fileName ?? null,
      expiresInSeconds: SIGNED_URL_EXPIRES_SECONDS,
      signedUrl: data.signedUrl,
    });
  } catch {
    return notFoundOrForbidden();
  }
}
