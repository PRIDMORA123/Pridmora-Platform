import { NextResponse } from "next/server";
import { requireSampleOrganisationManage } from "@/lib/sample-organisations";
import { safeSampleError } from "@/lib/sample-organisations/access";
import { checkSampleOrganisationRateLimit } from "@/lib/sample-organisations/rate-limit";
import { resetSampleOrganisation } from "@/lib/sample-organisations/reset-remove";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireSampleOrganisationManage();
  if (!auth.ok) return auth.response;

  const rate = checkSampleOrganisationRateLimit({
    userId: auth.context.user.id,
    action: "reset",
    limit: 3,
    windowMs: 120_000,
  });
  if (!rate.ok) {
    return safeSampleError("Please wait before trying again.", 429, "RATE_LIMITED");
  }

  const { id } = await context.params;
  const result = await resetSampleOrganisation({
    supabase: auth.context.supabase,
    userId: auth.context.user.id,
    installationId: id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.code === "NOT_FOUND" ? 404 : 500 }
    );
  }

  return NextResponse.json({ installation: result.installation });
}
