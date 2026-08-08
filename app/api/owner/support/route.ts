import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requirePlatformOwner,
  ownerValidationResponse,
} from "@/lib/owner/auth";
import { writePlatformAudit } from "@/lib/owner/audit";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import { listOwnerOrganisations, listSupportCases } from "@/lib/owner/repository";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
} from "@/lib/owner/types";

export const runtime = "nodejs";

const createSchema = z.object({
  organisationId: z.string().uuid().nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
  category: z.enum(SUPPORT_CATEGORIES),
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(""),
  status: z.enum(SUPPORT_STATUSES).optional(),
  priority: z.enum(SUPPORT_PRIORITIES).optional(),
  assignedTo: z.string().trim().max(200).nullable().optional(),
});

export async function GET(request: Request) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const [cases, organisations] = await Promise.all([
      listSupportCases(auth.context.supabase, {
        status: searchParams.get("status") ?? undefined,
        priority: searchParams.get("priority") ?? undefined,
        organisationId: searchParams.get("organisationId") ?? undefined,
      }),
      listOwnerOrganisations(auth.context.supabase),
    ]);
    const nameById = new Map(organisations.map(o => [o.id, o.name]));
    const payload = {
      cases: cases.map(item => ({
        ...item,
        organisationName: item.organisationId
          ? nameById.get(item.organisationId) ?? "Organisation"
          : null,
      })),
    };
    assertOwnerPayloadIsSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Owner support list failed:", error);
    return NextResponse.json(
      { error: "Unable to load support cases." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ownerValidationResponse("Invalid request body.");
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return ownerValidationResponse("Invalid support case.");
  }

  const { data, error } = await auth.context.supabase
    .from("support_cases")
    .insert({
      organisation_id: parsed.data.organisationId ?? null,
      user_id: parsed.data.userId ?? null,
      category: parsed.data.category,
      subject: parsed.data.subject,
      description: parsed.data.description,
      status: parsed.data.status ?? "open",
      priority: parsed.data.priority ?? "normal",
      assigned_to: parsed.data.assignedTo ?? null,
      created_by: auth.context.user.id,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Owner support create failed:", error.message);
    return NextResponse.json(
      { error: "Unable to create support case." },
      { status: 500 }
    );
  }

  await writePlatformAudit({
    supabase: auth.context.supabase,
    actorUserId: auth.context.user.id,
    action: "support_record.changed",
    entityType: "support_case",
    entityId: data.id,
    organisationId: parsed.data.organisationId ?? null,
    metadata: {
      category: parsed.data.category,
      status: parsed.data.status ?? "open",
      priority: parsed.data.priority ?? "normal",
    },
  });

  return NextResponse.json({ ok: true, id: data.id });
}
