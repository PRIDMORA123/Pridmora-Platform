import { NextResponse } from "next/server";
import {
  DEFAULT_SAMPLE_PACK_KEY,
  getActiveInstallationForPack,
  listInstallablePackKeys,
  listRegisteredPackKeys,
  loadSamplePack,
  requireSampleOrganisationManage,
  toPackSummary,
} from "@/lib/sample-organisations";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireSampleOrganisationManage();
  if (!auth.ok) return auth.response;

  const packs = [];
  for (const packKey of listRegisteredPackKeys()) {
    const loaded = loadSamplePack(packKey);
    if (!loaded.ok) continue;
    const installation = await getActiveInstallationForPack(
      auth.context.supabase,
      auth.context.user.id,
      packKey
    );
    packs.push(toPackSummary(loaded.pack, installation));
  }

  return NextResponse.json({
    packs,
    defaultPackKey: DEFAULT_SAMPLE_PACK_KEY,
    installablePackKeys: listInstallablePackKeys(),
  });
}
