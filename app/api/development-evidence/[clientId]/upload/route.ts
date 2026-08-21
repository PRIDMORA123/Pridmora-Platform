import { NextResponse } from "next/server";
import { notFoundOrForbidden } from "@/lib/auth/session";
import {
  UPLOADABLE_EVIDENCE_TYPES,
  buildDevelopmentEvidenceStoragePath,
  createUploadedEvidence,
  extractEvidenceDocumentText,
  hashEvidenceBytes,
  isSupportedEvidenceUpload,
  updateDocumentExtraction,
  type DevelopmentEvidenceType,
  DEVELOPMENT_EVIDENCE_STORAGE_BUCKET,
} from "@/lib/development-evidence";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";
import { getSupabaseServiceClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ clientId: string }> };

async function uploadAuthorisedEvidenceObject(input: {
  storagePath: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<void> {
  const { error } = await getSupabaseServiceClient()
    .storage
    .from(DEVELOPMENT_EVIDENCE_STORAGE_BUCKET)
    .upload(input.storagePath, input.bytes, {
      contentType: input.contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(
      error.message.trim() || "Unable to store the evidence file."
    );
  }
}

async function removeUploadedEvidenceObject(storagePath: string): Promise<void> {
  const { error } = await getSupabaseServiceClient()
    .storage
    .from(DEVELOPMENT_EVIDENCE_STORAGE_BUCKET)
    .remove([storagePath]);
  if (error) {
    console.error(
      "Evidence storage compensating delete failed:",
      error.message
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  const { clientId } = await params;
  const access = await requireAssignedPersonInOrganisation({ clientId });
  if (!access.ok) return access.response;

  if (!clientId) {
    return NextResponse.json({ error: "clientId is required." }, { status: 400 });
  }

  try {
    const { data: client, error } = await access.context.supabase
      .from("clients")
      .select("id, organisation_id")
      .eq("id", clientId)
      .maybeSingle();

    if (error || !client) {
      return notFoundOrForbidden();
    }

    const form = await request.formData();
    const file = form.get("file");
    const evidenceType = String(form.get("evidenceType") ?? "");
    const title = String(form.get("title") ?? "").trim();
    const purpose = String(form.get("purpose") ?? "").trim();
    const evidenceDate = String(form.get("evidenceDate") ?? "").trim() || null;
    const sourceLabel = String(form.get("sourceLabel") ?? "").trim() || null;

    // Reject any client-supplied storage ownership/path fields.
    if (
      form.has("storagePath") ||
      form.has("organisationId") ||
      form.has("clientId")
    ) {
      return NextResponse.json(
        { error: "Storage ownership fields cannot be supplied by the client." },
        { status: 400 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A file is required." }, { status: 400 });
    }

    if (
      !(UPLOADABLE_EVIDENCE_TYPES as readonly string[]).includes(evidenceType)
    ) {
      return NextResponse.json(
        { error: "Choose a valid evidence type." },
        { status: 400 }
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const support = isSupportedEvidenceUpload({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      byteSize: bytes.byteLength,
    });
    if (!support.ok) {
      return NextResponse.json({ error: support.error }, { status: 400 });
    }

    const contentHash = await hashEvidenceBytes(bytes);
    const organisationId = (client.organisation_id as string | null) ?? null;
    const storagePath = buildDevelopmentEvidenceStoragePath({
      organisationId,
      clientId,
      contentHash,
      fileName: file.name,
    });

    await uploadAuthorisedEvidenceObject({
      storagePath,
      bytes,
      contentType: file.type || "application/octet-stream",
    });

    let created;
    try {
      created = await createUploadedEvidence({
        supabase: access.context.supabase,
        userId: access.context.user.id,
        clientId,
        evidenceType: evidenceType as DevelopmentEvidenceType,
        title: title || file.name,
        evidenceDate,
        purpose: purpose || null,
        sourceLabel,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        byteSize: bytes.byteLength,
        contentHash,
        extractedText: null,
        extractionMethod: null,
        extractionStatus: "pending",
        storagePath,
      });
    } catch (error) {
      await removeUploadedEvidenceObject(storagePath);
      throw error;
    }

    const extraction = await extractEvidenceDocumentText({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes,
    });

    await updateDocumentExtraction({
      supabase: access.context.supabase,
      documentId: created.document.id,
      evidenceId: created.evidence.id,
      extractedText: extraction.ok ? extraction.text : null,
      extractionMethod: extraction.ok ? extraction.method : null,
      extractionStatus: extraction.ok ? "extracted" : extraction.status,
    });

    if (!extraction.ok) {
      return NextResponse.json(
        {
          evidence: {
            ...created.evidence,
            processingStatus: "failed",
          },
          document: {
            id: created.document.id,
            fileName: created.document.fileName,
            extractionStatus: extraction.status,
          },
          error: extraction.error,
          needsManualText: true,
        },
        { status: 201 }
      );
    }

    const usable = extraction.text.replace(/\s+/g, " ").trim().length >= 40;
    if (!usable) {
      await updateDocumentExtraction({
        supabase: access.context.supabase,
        documentId: created.document.id,
        evidenceId: created.evidence.id,
        extractedText: extraction.text,
        extractionMethod: extraction.method,
        extractionStatus: "failed",
      });
      return NextResponse.json(
        {
          evidence: {
            ...created.evidence,
            processingStatus: "failed",
          },
          document: {
            id: created.document.id,
            fileName: created.document.fileName,
            extractionStatus: "failed",
          },
          error:
            "The document was saved, but not enough readable text could be extracted for analysis. Try a text-based PDF or plain-text export.",
          needsManualText: true,
        },
        { status: 201 }
      );
    }

    return NextResponse.json(
      {
        evidence: {
          ...created.evidence,
          processingStatus: "extracted",
        },
        document: {
          id: created.document.id,
          fileName: created.document.fileName,
          extractionStatus: "extracted",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Evidence upload error:",
      error instanceof Error ? error.message : "unknown"
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Unable to upload evidence.",
      },
      { status: 500 }
    );
  }
}
