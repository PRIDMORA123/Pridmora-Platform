import { NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/owner/auth";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import { listOwnerUsers } from "@/lib/owner/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const users = await listOwnerUsers(auth.context.supabase, {
      search: searchParams.get("search") ?? undefined,
      organisationId: searchParams.get("organisationId") ?? undefined,
      role: searchParams.get("role") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    const payload = { users };
    assertOwnerPayloadIsSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Owner users list failed:", error);
    return NextResponse.json({ error: "Unable to load users." }, { status: 500 });
  }
}
