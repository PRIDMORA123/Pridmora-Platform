import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { intelligenceErrorResponse } from "@/lib/intelligence/api-response";
import { listGlobalIntelligence } from "@/lib/intelligence/repository";

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    const supabase = auth.context.supabase;
    const data = await listGlobalIntelligence(supabase, auth.context.user.id);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Global intelligence load error:", error instanceof Error ? error.name : "unknown");
    return intelligenceErrorResponse(error, "Unable to load intelligence. Please try again.");
  }
}
