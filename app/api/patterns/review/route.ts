import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { developmentUpdateErrorResponse } from "@/lib/development-updates/api-response";
import {
  ensureProfileOrEmpty,
  saveCoachingPatterns,
} from "@/lib/development-updates/repository";
import { applyCoachPatternReview } from "@/lib/patterns/reconcile";
import { evidenceFingerprint } from "@/lib/patterns/evidence";
import { assertRelationshipOwnership } from "@/lib/relationship-scope";
import type { CoachingPatternStatus } from "@/lib/patterns/types";

type ReviewRequest = {
  clientId?: string;
  patternId?: string;
  action?: "accept" | "reject" | "edit" | "no_longer_relevant";
  title?: string;
  description?: string;
  status?: CoachingPatternStatus;
  coachComment?: string | null;
};

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  let body: ReviewRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const clientId = body.clientId?.trim();
  const patternId = body.patternId?.trim();
  const action = body.action;

  if (!clientId || !patternId || !action) {
    return NextResponse.json(
      { error: "clientId, patternId and action are required." },
      { status: 400 }
    );
  }

  if (!["accept", "reject", "edit", "no_longer_relevant"].includes(action)) {
    return NextResponse.json({ error: "Invalid review action." }, { status: 400 });
  }

  const coachId = auth.context.user.id;

  try {
    const { data: client, error } = await auth.context.supabase
      .from("clients")
      .select("id, current_focus")
      .eq("id", clientId)
      .eq("coach_id", coachId)
      .maybeSingle();

    if (error || !client) {
      return NextResponse.json({ error: "Person not found." }, { status: 404 });
    }

    const profile = await ensureProfileOrEmpty(
      auth.context.supabase,
      coachId,
      clientId,
      String(client.current_focus ?? "")
    );
    assertRelationshipOwnership(clientId, [profile]);

    const existing = profile.coachingPatterns.find(pattern => pattern.id === patternId);
    if (!existing) {
      return NextResponse.json({ error: "Pattern not found." }, { status: 404 });
    }

    const reviewed = applyCoachPatternReview(existing, {
      action,
      title: body.title,
      description: body.description,
      status: body.status,
      coachComment: body.coachComment,
    });

    const patterns = profile.coachingPatterns.map(pattern =>
      pattern.id === patternId ? reviewed : pattern
    );

    const saved = await saveCoachingPatterns(
      auth.context.supabase,
      coachId,
      clientId,
      patterns,
      profile.patternsEvidenceFingerprint ||
        evidenceFingerprint(patterns.flatMap(pattern => pattern.evidence))
    );

    return NextResponse.json({
      pattern: reviewed,
      patterns: saved.coachingPatterns,
      relationshipId: clientId,
    });
  } catch (err) {
    return developmentUpdateErrorResponse(err, "Unable to save pattern review.");
  }
}
