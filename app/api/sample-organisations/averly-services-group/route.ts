import { NextResponse } from "next/server";
import {
  getActiveInstallationForPack,
  loadSamplePack,
  requireSampleOrganisationManage,
  toPackSummary,
} from "@/lib/sample-organisations";
import { safeSampleError } from "@/lib/sample-organisations/access";

export const runtime = "nodejs";

const PACK_KEY = "averly-services-group";

export async function GET() {
  const auth = await requireSampleOrganisationManage();
  if (!auth.ok) return auth.response;

  const loaded = loadSamplePack(PACK_KEY);
  if (!loaded.ok) {
    return safeSampleError("Sample pack could not be loaded.", 500, "INVALID_PACK");
  }

  const installation = await getActiveInstallationForPack(
    auth.context.supabase,
    auth.context.user.id,
    PACK_KEY
  );

  return NextResponse.json({
    pack: toPackSummary(loaded.pack, installation),
  });
}
