import { NextResponse } from "next/server";
import {
  requireOrganisationContext,
  requireOrganisationPermission,
} from "@/lib/organisations/current-organisation";
import {
  ORGANISATION_GUIDANCE_STORAGE_BUCKET,
  ORGANISATION_GUIDANCE_TYPES,
  assertOrganisationGuidanceStoragePathMatches,
  buildOrganisationGuidanceStoragePath,
  createOrganisationGuidanceDraft,
  extractOrganisationGuidanceText,
  hashOrganisationGuidanceBytes,
  updateOrganisationGuidanceExtraction,
  validateOrganisationGuidanceReplacement,
  validateOrganisationGuidanceUpload,
  type OrganisationGuidanceType,
} from "@/lib/organisation-guidance";
import { writeOrganisationAudit } from "@/lib/organisations/repository";
import { getSupabaseServiceClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const maxDuration = 60;

async function uploadGuidanceObject(input: {
  storagePath: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<void> {
  const { error } = await getSupabaseServiceClient()
    .storage
    .from(ORGANISATION_GUIDANCE_STORAGE_BUCKET)
    .upload(input.storagePath, input.bytes, {
      contentType: input.contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(
      error.message.trim() || "Unable to store the organisation guidance file."
    );
  }
}

async function removeGuidanceObject(storagePath: string): Promise<void> {
  const { error } = await getSupabaseServiceClient()
    .storage
    .from(ORGANISATION_GUIDANCE_STORAGE_BUCKET)
    .remove([storagePath]);

  if (error) {
    console.error(
      "Organisation guidance compensating delete failed:",
      error.message
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const denied = requireOrganisationPermission(
    auth.context,
    "organisation_guidance.manage"
  );
  if (denied) return denied;

  try {
    const form = await request.formData();
    const file = form.get("file");
    const guidanceType = String(form.get("guidanceType") ?? "").trim();
    const title = String(form.get("title") ?? "").trim();
    const versionLabel = String(form.get("versionLabel") ?? "").trim() || null;
    const effectiveFrom =
      String(form.get("effectiveFrom") ?? "").trim() || null;
    const reviewDate = String(form.get("reviewDate") ?? "").trim() || null;
    const replacesGuidanceId =
      String(form.get("replacesGuidanceId") ?? "").trim() || null;

    // Ownership and storage location are always server-derived.
    if (
      form.has("organisationId") ||
      form.has("storagePath") ||
      form.has("guidanceId")
    ) {
      return NextResponse.json(
        { error: "Storage ownership fields cannot be supplied by the client." },
        { status: 400 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "A PDF or DOCX file is required." },
        { status: 400 }
      );
    }

    if (
      !(ORGANISATION_GUIDANCE_TYPES as readonly string[]).includes(
        guidanceType
      )
    ) {
      return NextResponse.json(
        { error: "Choose Policy, Values or Manager Guidance." },
        { status: 400 }
      );
    }

    if (!title || title.length > 200) {
      return NextResponse.json(
        { error: "Add a guidance title of up to 200 characters." },
        { status: 400 }
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";

    const support = validateOrganisationGuidanceUpload({
      fileName: file.name,
      mimeType,
      byteSize: bytes.byteLength,
    });

    if (!support.ok) {
      return NextResponse.json({ error: support.error }, { status: 400 });
    }

    const organisationId = auth.context.organisation.organisationId;

    if (replacesGuidanceId) {
      await validateOrganisationGuidanceReplacement({
        supabase: auth.context.supabase,
        organisationId,
        replacesGuidanceId,
        guidanceType: guidanceType as OrganisationGuidanceType,
      });
    }

    const guidanceId = crypto.randomUUID();
    const contentHash = await hashOrganisationGuidanceBytes(bytes);

    const storagePath = buildOrganisationGuidanceStoragePath({
      organisationId,
      documentId: guidanceId,
      contentHash,
      fileName: file.name,
    });

    assertOrganisationGuidanceStoragePathMatches({
      storagePath,
      organisationId,
      documentId: guidanceId,
    });

    await uploadGuidanceObject({
      storagePath,
      bytes,
      contentType: mimeType,
    });
    let guidance;

    try {
      guidance = await createOrganisationGuidanceDraft({
        supabase: auth.context.supabase,
        id: guidanceId,
        organisationId,
        userId: auth.context.user.id,
        guidanceType: guidanceType as OrganisationGuidanceType,
        title,
        versionLabel,
        effectiveFrom,
        reviewDate,
        originalFileName: file.name,
        mimeType,
        fileSizeBytes: bytes.byteLength,
        contentHash,
        storagePath,
        replacesGuidanceId,
      });
    } catch (error) {
      await removeGuidanceObject(storagePath);
      throw error;
    }

    const extraction = await extractOrganisationGuidanceText({
      fileName: file.name,
      mimeType,
      bytes,
    });

    if (!extraction.ok) {
      return NextResponse.json(
        {
          guidance,
          error: extraction.error,
          readable: false,
        },
        { status: 201 }
      );
    }

    const extractedText = extraction.text.replace(/\s+/g, " ").trim();

    if (extractedText.length < 40) {
      return NextResponse.json(
        {
          guidance,
          error:
            "The document was saved as a draft, but not enough readable text could be extracted. Try a text-based PDF or DOCX file.",
          readable: false,
        },
        { status: 201 }
      );
    }

    await updateOrganisationGuidanceExtraction({
      supabase: auth.context.supabase,
      organisationId,
      guidanceId,
      extractedText: extraction.text,
      extractionMethod: extraction.method,
    });

    await writeOrganisationAudit({
      supabase: auth.context.supabase,
      organisationId,
      actorUserId: auth.context.user.id,
      action: "organisation_guidance_uploaded",
      entityType: "organisation_guidance",
      entityId: guidanceId,
      metadata: {
        guidanceType,
        title,
        fileName: file.name,
        status: "draft",
      },
    });

    return NextResponse.json(
      {
        guidance: {
          ...guidance,
          extractionMethod: extraction.method,
        },
        readable: true,
      },
      { status: 201 }
    );
  } catch (error) {
    // Only clean up an object here when no database-backed draft owns it.
    // Database-create failures already perform their own compensating delete.
    console.error(
      "Organisation guidance upload error:",
      error instanceof Error ? error.message : "unknown"
    );

    return NextResponse.json(
      {
        error:
          "Unable to upload organisation guidance. Check the file and try again.",
      },
      { status: 500 }
    );
  }
}
