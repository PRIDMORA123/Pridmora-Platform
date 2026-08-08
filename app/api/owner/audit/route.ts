import { NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/owner/auth";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import { listPlatformAuditEvents } from "@/lib/owner/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      500,
      Math.max(1, Number(searchParams.get("limit") ?? 100) || 100)
    );
    const events = await listPlatformAuditEvents(auth.context.supabase, limit);
    const payload = { events };
    assertOwnerPayloadIsSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Owner audit list failed:", error);
    return NextResponse.json(
      { error: "Unable to load audit events." },
      { status: 500 }
    );
  }
}
