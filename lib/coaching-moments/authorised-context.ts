import type { SupabaseClient } from "@supabase/supabase-js";
import { collectPatternEvidenceFromRelationship } from "@/lib/patterns/collect";
import type { CoachingPattern } from "@/lib/patterns/types";
import { rowToSession } from "@/lib/supabase/map";
import type { Session } from "@/lib/types";

/**
 * Load authorised evidence for Coaching Moment AI.
 * Excludes private notes, unapproved summaries, Supporting Context
 * (preparation context only), and material from other relationships.
 */
export async function loadAuthorisedCoachingMomentContext(
  supabase: SupabaseClient,
  input: { clientId: string; coachId: string }
): Promise<{
  authorisedEvidenceText: string;
  acceptedPatternsText: string;
  commitmentsText: string;
  sessions: Session[];
}> {
  const { data: sessionRows } = await supabase
    .from("sessions")
    .select("*")
    .eq("client_id", input.clientId)
    .eq("coach_id", input.coachId)
    .order("session_number", { ascending: true });

  const sessions = (sessionRows ?? []).map((row, index, rows) =>
    rowToSession(row as never, index, rows.length)
  ).filter(session => session.clientId === input.clientId);

  const points = collectPatternEvidenceFromRelationship({
    relationshipId: input.clientId,
    sessions,
    includeSessionNotes: true,
  }).filter(point => point.isApproved !== false && !point.isPrivate);

  const authorisedEvidenceText = points
    .slice(0, 24)
    .map(point => {
      const date = point.sourceDate ? ` (${point.sourceDate.slice(0, 10)})` : "";
      return `- [${point.sourceType}${date}] id=${point.sourceId}: ${point.content.slice(0, 280)}`;
    })
    .join("\n");

  const { data: profile } = await supabase
    .from("development_profiles")
    .select("coaching_patterns, commitments")
    .eq("client_id", input.clientId)
    .eq("coach_id", input.coachId)
    .maybeSingle();

  const patterns = Array.isArray(profile?.coaching_patterns)
    ? (profile!.coaching_patterns as CoachingPattern[])
    : [];

  const acceptedPatternsText = patterns
    .filter(
      pattern =>
        pattern.coachAccepted === true &&
        pattern.coachReviewed === true &&
        !pattern.suppressed
    )
    .slice(0, 8)
    .map(
      pattern =>
        `- ${pattern.title} (${pattern.strength}): ${pattern.description}`
    )
    .join("\n");

  const commitments = Array.isArray(profile?.commitments)
    ? (profile!.commitments as Array<{ text?: string; status?: string }>)
    : [];

  const commitmentsText = commitments
    .filter(item => item.status !== "completed" && item.text?.trim())
    .slice(0, 8)
    .map(item => `- ${item.text!.trim()}`)
    .join("\n");

  // Also include recent approved session commitments
  const sessionCommitments = sessions
    .filter(
      session =>
        session.summaryStatus === "approved" || session.aiSummaryApproved
    )
    .slice(-4)
    .map(session => session.commitments || session.agreedActions)
    .filter(Boolean)
    .join("\n");

  return {
    authorisedEvidenceText,
    acceptedPatternsText,
    commitmentsText: [commitmentsText, sessionCommitments]
      .filter(Boolean)
      .join("\n"),
    sessions,
  };
}
