import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requirePlatformOwner,
  ownerValidationResponse,
} from "@/lib/owner/auth";
import { writePlatformAudit } from "@/lib/owner/audit";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import { listPlatformPlans } from "@/lib/owner/repository";

export const runtime = "nodejs";

const SECRET_KEY_PATTERN =
  /(secret|api[_-]?key|password|token|private[_-]?key|service[_-]?role)/i;

const patchSchema = z.object({
  key: z.enum(["trial_defaults", "commercial_defaults", "organisation_defaults"]),
  value: z.record(z.string(), z.unknown()),
});

export async function GET() {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  try {
    const [settingsResult, plans] = await Promise.all([
      auth.context.supabase.from("platform_settings").select("key, value, description, updated_at"),
      listPlatformPlans(auth.context.supabase),
    ]);

    const settings = (settingsResult.data ?? []).map(row => ({
      key: row.key as string,
      value: row.value as Record<string, unknown>,
      description: (row.description as string | null) ?? null,
      updatedAt: row.updated_at as string,
    }));

    const payload = {
      settings,
      plans,
      secretsNote:
        "Secrets and API keys are never exposed through Owner Console settings.",
    };
    assertOwnerPayloadIsSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Owner settings load failed:", error);
    return NextResponse.json(
      { error: "Unable to load settings." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ownerValidationResponse("Invalid request body.");
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return ownerValidationResponse("Invalid settings update.");
  }

  const serialised = JSON.stringify(parsed.data.value);
  if (SECRET_KEY_PATTERN.test(serialised) || SECRET_KEY_PATTERN.test(parsed.data.key)) {
    return ownerValidationResponse(
      "Secret credentials cannot be stored or updated through this interface."
    );
  }

  const { error } = await auth.context.supabase.from("platform_settings").upsert({
    key: parsed.data.key,
    value: parsed.data.value,
    updated_by: auth.context.user.id,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Owner settings update failed:", error.message);
    return NextResponse.json(
      { error: "Unable to update settings." },
      { status: 500 }
    );
  }

  await writePlatformAudit({
    supabase: auth.context.supabase,
    actorUserId: auth.context.user.id,
    action: "owner_settings.changed",
    entityType: "platform_settings",
    entityId: null,
    metadata: { key: parsed.data.key },
  });

  return NextResponse.json({ ok: true });
}
