import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notFoundOrForbidden } from "@/lib/auth/session";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";
import {
  UPLOADABLE_EVIDENCE_TYPES,
  createUploadedEvidence,
  extractEvidenceDocumentText,
  hashEvidenceBytes,
  isSupportedEvidenceUpload,
  type DevelopmentEvidenceType,
} from "@/lib/development-evidence";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ clientId: string }> };

const STORAGE_UPLOAD_TIMEOUT_MS = 8_000;

async function bestEffortStorageUpload(input: {
  supabase: SupabaseClient;
  storagePath: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<void> {
  try {
    const uploadPromise = input.supabase.storage
      .from("development-evidence")
      .upload(input.storagePath, input.bytes, {
        contentType: input.contentType,
        upsert: false,
      });

    const timed = await Promise.race([
      uploadPromise,
      new Promise<{ error: { message: string } }>(resolve => {
        setTimeout(
          () =>
            resolve({
              error: { message: "Storage upload timed out." },
            }),
          STORAGE_UPLOAD_TIMEOUT_MS
        );
      }),
    ]);

    if (timed.error) {
      console.error("Evidence storage upload skipped:", timed.error.message);
    }
  } catch (error) {
    console.error(
      "Evidence storage upload skipped:",
      error instanceof Error ? error.message : "unknown"
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

    // DB first — never block evidence creation on best-effort storage.
    const created = await createUploadedEvidence({
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
      extractedText: extraction.ok ? extraction.text : null,
      extractionMethod: extraction.ok ? extraction.method : null,
      extractionStatus: extraction.ok ? "extracted" : extraction.status,
      storagePath,
    });

    await bestEffortStorageUpload({
      supabase: access.context.supabase,
      storagePath,
      bytes,
      contentType: file.type || "application/octet-stream",
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
