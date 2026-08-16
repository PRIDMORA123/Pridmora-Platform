import { extractVisibleCoachNotes } from "@/lib/coach-notes";
import {
  coachingMomentEvidenceCanonicalKey,
  isSavedCoachingMoment,
  type CoachingMoment,
} from "@/lib/coaching-moments/coaching-moment";
import {
  evidenceCanonicalKey,
  normaliseAuthorisedEvidence,
  toEvidenceReference,
} from "@/lib/patterns/evidence";
import type { AuthorisedPatternEvidencePoint } from "@/lib/patterns/types";
import {
  supportingContextForAi,
  type SupportingContextItem,
} from "@/lib/relationship-meta";
import type { Session } from "@/lib/types";

function isApprovedSession(session: Session): boolean {
  return (
    session.summaryStatus === "approved" || session.aiSummaryApproved === true
  );
}

function sessionDate(session: Session): string | null {
  return session.completedAt || session.date || session.lastUpdated || null;
}

/**
 * Build authorised evidence points for one relationship.
 * Excludes private notes, unapproved summaries, and unauthorised supporting context.
 */
export function collectPatternEvidenceFromRelationship(input: {
  relationshipId: string;
  sessions: Session[];
  supportingContext?: SupportingContextItem[] | null;
  /** Saved coaching moments — one evidence point each (never formal sessions). */
  coachingMoments?: CoachingMoment[] | null;
  /** Coach-written notes field is authorised; prep private notes are not. */
  includeSessionNotes?: boolean;
}): AuthorisedPatternEvidencePoint[] {
  const {
    relationshipId,
    sessions,
    supportingContext,
    coachingMoments,
    includeSessionNotes = true,
  } = input;

  const points: AuthorisedPatternEvidencePoint[] = [];

  for (const session of sessions) {
    if (session.clientId && session.clientId !== relationshipId) continue;

    const date = sessionDate(session);

    // Private coach reminders / private notes — excluded
    // (prepPrivateNotes, reflectPrivate, reflection)

    if (includeSessionNotes) {
      const notes = extractVisibleCoachNotes(session.notes);
      if (notes) {
        points.push({
          sourceType: "session_notes",
          sourceId: `${session.id}:notes`,
          relationshipId,
          sessionId: session.id,
          sourceDate: date,
          content: notes,
          excerpt: notes.slice(0, 240),
          isPrivate: false,
          isApproved: true,
          canonicalKey: evidenceCanonicalKey({
            sourceType: "session_notes",
            sourceId: `${session.id}:notes`,
            sessionId: session.id,
            content: notes,
          }),
        });
      }
    }

    const summary = extractVisibleCoachNotes(session.summary);
    if (summary) {
      const approved = isApprovedSession(session);
      points.push({
        sourceType: "approved_summary",
        sourceId: `${session.id}:summary`,
        relationshipId,
        sessionId: session.id,
        sourceDate: date,
        content: summary,
        excerpt: summary.slice(0, 240),
        isPrivate: false,
        isApproved: approved,
        canonicalKey: evidenceCanonicalKey({
          sourceType: "approved_summary",
          sourceId: `${session.id}:summary`,
          sessionId: session.id,
          content: summary,
        }),
      });
    }

    // Regenerated draft copies share the same sourceId — dedupe handles them
    const themes = extractVisibleCoachNotes(session.emergingThemes);
    if (themes && isApprovedSession(session)) {
      points.push({
        sourceType: "development_observation",
        sourceId: `${session.id}:themes`,
        relationshipId,
        sessionId: session.id,
        sourceDate: date,
        content: themes,
        excerpt: themes.slice(0, 240),
        isPrivate: false,
        isApproved: true,
        canonicalKey: evidenceCanonicalKey({
          sourceType: "development_observation",
          sourceId: `${session.id}:themes`,
          sessionId: session.id,
          content: themes,
        }),
      });
    }

    const commitments = extractVisibleCoachNotes(
      session.commitments || session.agreedActions
    );
    if (commitments && isApprovedSession(session)) {
      points.push({
        sourceType: "commitment",
        sourceId: `${session.id}:commitments`,
        relationshipId,
        sessionId: session.id,
        sourceDate: date,
        content: commitments,
        excerpt: commitments.slice(0, 240),
        isPrivate: false,
        isApproved: true,
        canonicalKey: evidenceCanonicalKey({
          sourceType: "commitment",
          sourceId: `${session.id}:commitments`,
          sessionId: session.id,
          content: commitments,
        }),
      });
    }
  }

  for (const item of supportingContextForAi(supportingContext)) {
    const content = [item.title, item.summary].filter(Boolean).join(". ");
    points.push({
      sourceType: "supporting_context",
      sourceId: item.id,
      relationshipId,
      sessionId: null,
      sourceDate: item.sourceDate || null,
      content,
      excerpt: content.slice(0, 240),
      isPrivate: false,
      isApproved: true,
      aiEnabled: true,
      canonicalKey: evidenceCanonicalKey({
        sourceType: "supporting_context",
        sourceId: item.id,
        content,
      }),
    });
  }

  for (const moment of coachingMoments ?? []) {
    if (moment.clientId !== relationshipId) continue;
    if (!isSavedCoachingMoment(moment.status)) continue;
    // Private notes are never included.
    const parts = [
      moment.insightStatus === "accepted" || moment.insightStatus === "edited"
        ? moment.generatedInsight?.summary?.trim()
        : null,
      moment.outcomeNotes?.trim(),
      !moment.noCommitmentAgreed ? moment.agreedCommitment?.trim() : null,
      moment.followUp?.trim(),
    ].filter(Boolean) as string[];
    if (parts.length === 0) continue;

    const content = parts.join("\n");
    // One underlying interaction: raw + insight share one canonical key.
    points.push({
      sourceType: "coaching_moment",
      sourceId: moment.id,
      relationshipId,
      sessionId: null,
      sourceDate: moment.occurredAt || moment.updatedAt,
      content,
      excerpt: content.slice(0, 240),
      isPrivate: false,
      isApproved: true,
      canonicalKey: coachingMomentEvidenceCanonicalKey(moment.id),
    });
  }

  // Explicitly record excluded private material only when callers inject it
  // for tests — filterAuthorisedEvidence drops isPrivate: true.

  return normaliseAuthorisedEvidence(points, relationshipId);
}

export function evidencePointsToReferences(
  points: AuthorisedPatternEvidencePoint[],
  includeExcerpt = false
) {
  return points.map(point => toEvidenceReference(point, includeExcerpt));
}
