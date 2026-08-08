import { NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/owner/auth";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import { listOwnerOrganisations } from "@/lib/owner/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const organisations = await listOwnerOrganisations(auth.context.supabase, {
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      plan: searchParams.get("plan") ?? undefined,
    });

    const payload = { organisations };
    assertOwnerPayloadIsSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Owner organisations list failed:", error);
    return NextResponse.json(
      { error: "Unable to load organisations." },
      { status: 500 }
    );
  }
}
