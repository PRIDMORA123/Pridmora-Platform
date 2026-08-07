import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  UPLOADABLE_EVIDENCE_TYPES,
  createUploadedEvidence,
  extractEvidenceDocumentText,
  hashEvidenceBytes,
  isSupportedEvidenceUpload,
  type DevelopmentEvidenceType,
} from "@/lib/development-evidence";

type Params = { params: Promise<{ clientId: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ error: "clientId is required." }, { status: 400 });
  }

  try {
    const { data: client, error } = await auth.context.supabase
      .from("clients")
      .select("id, organisation_id")
      .eq("id", clientId)
      .maybeSingle();

    if (error || !client) {
      return NextResponse.json({ error: "Person not found." }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get("file");
    const evidenceType = String(form.get("evidenceType") ?? "");
    const title = String(form.get("title") ?? "").trim();
    const purpose = String(form.get("purpose") ?? "").trim();
    const evidenceDate = String(form.get("evidenceDate") ?? "").trim() || null;
    const sourceLabel = String(form.get("sourceLabel") ?? "").trim() || null;

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
    const extraction = await extractEvidenceDocumentText({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes,
    });

    const organisationId = (client.organisation_id as string | null) ?? "personal";
    const storagePath = `${organisationId}/${clientId}/${contentHash.slice(0, 16)}-${file.name.replace(/[^\w.\-]+/g, "_")}`;

    // Best-effort private storage upload; DB remains source of extracted text.
    try {
      await auth.context.supabase.storage
        .from("development-evidence")
        .upload(storagePath, bytes, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
    } catch {
      // Storage may be unavailable in local/dev; continue with DB provenance.
    }

    const created = await createUploadedEvidence({
      supabase: auth.context.supabase,
      userId: auth.context.user.id,
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
      extractedText: extraction.ok ? extraction.text : null,
      extractionMethod: extraction.ok ? extraction.method : null,
      extractionStatus: extraction.ok ? "extracted" : extraction.status,
      storagePath,
    });

    if (!extraction.ok) {
      return NextResponse.json(
        {
          evidence: created.evidence,
          document: {
            id: created.document.id,
            fileName: created.document.fileName,
            extractionStatus: created.document.extractionStatus,
          },
          error: extraction.error,
          needsManualText: true,
        },
        { status: 201 }
      );
    }

    return NextResponse.json(
      {
        evidence: created.evidence,
        document: {
          id: created.document.id,
          fileName: created.document.fileName,
          extractionStatus: created.document.extractionStatus,
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
      { error: "Unable to upload evidence." },
      { status: 500 }
    );
  }
}
