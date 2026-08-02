import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { intelligenceErrorResponse } from "@/lib/intelligence/api-response";
import {
  getIntelligenceItem,
  listAuditForItem,
  updateIntelligenceItem,
} from "@/lib/intelligence/repository";
import type { ConfidenceLabel, IntelligenceCategory, IntelligenceStatus } from "@/lib/intelligence/types";

type Params = { params: Promise<{ itemId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { itemId } = await params;
  try {
    const supabase = auth.context.supabase;
    const item = await getIntelligenceItem(supabase, auth.context.user.id, itemId);
    if (!item) {
      return NextResponse.json({ error: "Insight not found." }, { status: 404 });
    }
    const audit = await listAuditForItem(supabase, auth.context.user.id, itemId);
    return NextResponse.json({ item, audit });
  } catch (error) {
    console.error("Intelligence item load error:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { error: "Unable to load this insight. Please try again." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { itemId } = await params;
  let body: {
    title?: string;
    description?: string;
    category?: IntelligenceCategory;
    status?: IntelligenceStatus;
    confidenceLabel?: ConfidenceLabel | null;
    confidenceScore?: number | null;
    coachNotes?: string;
    isLocked?: boolean;
    archive?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const supabase = auth.context.supabase;
    const item = await updateIntelligenceItem(supabase, auth.context.user.id, itemId, {
      title: body.title,
      description: body.description,
      category: body.category,
      status: body.status,
      confidenceLabel: body.confidenceLabel,
      confidenceScore: body.confidenceScore,
      coachNotes: body.coachNotes,
      isLocked: body.isLocked,
      archivedAt: body.archive ? new Date().toISOString() : body.archive === false ? null : undefined,
    });
    return NextResponse.json({ item });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update this insight.";
    if (/migration/i.test(message) || /schema cache/i.test(message)) {
      return intelligenceErrorResponse(error, message);
    }
    const status = /not found/i.test(message)
      ? 404
      : /locked/i.test(message)
        ? 409
        : 500;
    if (status === 500) {
      console.error("Intelligence item update error:", error instanceof Error ? error.name : "unknown");
      return intelligenceErrorResponse(error, "Unable to update this insight. Please try again.");
    }
    return NextResponse.json({ error: message }, { status });
  }
}
