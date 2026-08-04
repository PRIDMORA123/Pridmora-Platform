import { NextResponse } from "next/server";
import {
  installSampleOrganisation,
  requireSampleOrganisationManage,
} from "@/lib/sample-organisations";
import { safeSampleError } from "@/lib/sample-organisations/access";
import { checkSampleOrganisationRateLimit } from "@/lib/sample-organisations/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const PACK_KEY = "northbridge-healthcare";

export async function POST(request: Request) {
  const auth = await requireSampleOrganisationManage();
  if (!auth.ok) return auth.response;

  const rate = checkSampleOrganisationRateLimit({
    userId: auth.context.user.id,
    action: "install",
    limit: 3,
    windowMs: 120_000,
  });
  if (!rate.ok) {
    return safeSampleError("Please wait before trying again.", 429, "RATE_LIMITED");
  }

  const idempotencyKey =
    request.headers.get("idempotency-key")?.trim() ||
    request.headers.get("Idempotency-Key")?.trim() ||
    null;

  // Organisation ID is always taken from authenticated organisation context.
  const result = await installSampleOrganisation({
    supabase: auth.context.supabase,
    userId: auth.context.user.id,
    sourceOrganisationId: auth.context.organisation.organisationId,
    packKey: PACK_KEY,
    idempotencyKey,
  });

  if (!result.ok) {
    const status = result.code === "PERMISSION_DENIED" ? 403 : 500;
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        installation: result.installation ?? null,
      },
      { status }
    );
  }

  return NextResponse.json({
    installation: result.installation,
    resumed: result.resumed,
  });
}
