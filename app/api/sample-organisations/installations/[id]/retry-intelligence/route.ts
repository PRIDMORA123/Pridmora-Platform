import { NextResponse } from "next/server";
import {
  requireSampleOrganisationManage,
  retrySampleOrganisationIntelligence,
} from "@/lib/sample-organisations";
import { safeSampleError } from "@/lib/sample-organisations/access";
import { checkSampleOrganisationRateLimit } from "@/lib/sample-organisations/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireSampleOrganisationManage();
  if (!auth.ok) return auth.response;

  const rate = checkSampleOrganisationRateLimit({
    userId: auth.context.user.id,
    action: "retry-intelligence",
    limit: 5,
  });
  if (!rate.ok) {
    return safeSampleError("Please wait before trying again.", 429, "RATE_LIMITED");
  }

  const { id } = await context.params;
  const result = await retrySampleOrganisationIntelligence({
    supabase: auth.context.supabase,
    userId: auth.context.user.id,
    installationId: id,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        installation: result.installation ?? null,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ installation: result.installation });
}
