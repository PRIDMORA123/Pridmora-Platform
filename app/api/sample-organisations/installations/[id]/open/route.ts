import { NextResponse } from "next/server";
import { requireSampleOrganisationManage } from "@/lib/sample-organisations";
import { safeSampleError } from "@/lib/sample-organisations/access";
import { openSampleOrganisation } from "@/lib/sample-organisations/reset-remove";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireSampleOrganisationManage();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const result = await openSampleOrganisation({
    supabase: auth.context.supabase,
    userId: auth.context.user.id,
    installationId: id,
  });

  if (!result.ok) {
    return safeSampleError(result.error, 400, result.code);
  }

  return NextResponse.json({ organisationId: result.organisationId });
}
