import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requirePlatformOwner,
  ownerValidationResponse,
} from "@/lib/owner/auth";
import { writePlatformAudit } from "@/lib/owner/audit";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
} from "@/lib/owner/types";

export const runtime = "nodejs";

const patchSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES).optional(),
  subject: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  status: z.enum(SUPPORT_STATUSES).optional(),
  priority: z.enum(SUPPORT_PRIORITIES).optional(),
  assignedTo: z.string().trim().max(200).nullable().optional(),
  resolutionNotes: z.string().trim().max(5000).nullable().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ownerValidationResponse("Invalid request body.");
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return ownerValidationResponse("Invalid support update.");
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.category !== undefined) updates.category = parsed.data.category;
  if (parsed.data.subject !== undefined) updates.subject = parsed.data.subject;
  if (parsed.data.description !== undefined) {
    updates.description = parsed.data.description;
  }
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
  if (parsed.data.assignedTo !== undefined) {
    updates.assigned_to = parsed.data.assignedTo;
  }
  if (parsed.data.resolutionNotes !== undefined) {
    updates.resolution_notes = parsed.data.resolutionNotes;
  }

  const { data, error } = await auth.context.supabase
    .from("support_cases")
    .update(updates)
    .eq("id", id)
    .select("id, organisation_id")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: "Unable to update support case." },
      { status: error ? 500 : 404 }
    );
  }

  await writePlatformAudit({
    supabase: auth.context.supabase,
    actorUserId: auth.context.user.id,
    action: "support_record.changed",
    entityType: "support_case",
    entityId: id,
    organisationId: (data.organisation_id as string | null) ?? null,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ ok: true });
}
