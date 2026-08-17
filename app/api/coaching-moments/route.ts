import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  buildCoachingMomentInsightInput,
  buildCoachingMomentPreparationInput,
  COACHING_MOMENT_INSIGHT_PROMPT,
  COACHING_MOMENT_PREPARATION_PROMPT,
} from "@/lib/ai/coaching-moment-prompt";
import { notFoundOrForbidden } from "@/lib/auth/session";
import { loadAuthorisedCoachingMomentContext } from "@/lib/coaching-moments/authorised-context";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";
import { trackCoachingMomentEvent } from "@/lib/coaching-moments/analytics";
import {
  buildGuidanceFingerprint,
  parseGuidanceFromModel,
  parseInsightFromModel,
} from "@/lib/coaching-moments/parse";
import {
  CoachingMomentError,
  applyGuidance,
  applyInsightDraft,
  completeCoachingMoment,
  createDraftCoachingMoment,
  discardCoachingMoment,
  getCoachingMoment,
  listCoachingMoments,
  listRecentSavedCoachingMoments,
  reviewInsight,
  saveCoachingMomentOutcome,
  savePrepareFields,
  savePrivateNote,
  startCoachingMoment,
} from "@/lib/coaching-moments/repository";
import { containsUnexpectedPersonName } from "@/lib/relationship-scope";
import { buildRelationshipAiContext } from "@/lib/relationship-identity";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

type ActionBody = {
  action?: string;
  clientId?: string;
  momentId?: string;
  situation?: string;
  desiredOutcome?: string | null;
  privateNote?: string;
  outcomeNotes?: string;
  agreedCommitment?: string | null;
  noCommitmentAgreed?: boolean;
  followUp?: string | null;
  insightDecision?: "accepted" | "edited" | "discarded";
  insight?: {
    summary?: string;
    commitment?: string | null;
    patternConnection?: string | null;
    followUpQuestion?: string | null;
  } | null;
  limit?: number;
};

function errorResponse(error: unknown) {
  if (error instanceof CoachingMomentError) {
    const status =
      error.code === "not_found"
        ? 404
        : error.code === "archived"
          ? 409
          : error.code === "validation" || error.code === "invalid_transition"
            ? 400
            : 409;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  console.error("[coaching-moments] unexpected error", {
    name: error instanceof Error ? error.name : "unknown",
  });
  return NextResponse.json(
    { error: "Unable to complete this request." },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId")?.trim() ?? "";
  const momentId = url.searchParams.get("momentId")?.trim() ?? "";
  const recent = url.searchParams.get("recent") === "1";
  const limit = Number(url.searchParams.get("limit") ?? "20");

  const access = await requireAssignedPersonInOrganisation({ clientId });
  if (!access.ok) return access.response;

  const { supabase, coachId } = access.context;

  try {
    if (momentId) {
      if (!isUuid(momentId)) {
        return NextResponse.json({ error: "Invalid momentId." }, { status: 400 });
      }
      const moment = await getCoachingMoment(supabase, {
        momentId,
        coachId,
        clientId: access.clientId,
      });
      if (!moment) return notFoundOrForbidden();
      return NextResponse.json({ moment });
    }

    if (recent) {
      const moments = await listRecentSavedCoachingMoments(supabase, {
        clientId: access.clientId,
        coachId,
        limit: Math.min(Math.max(limit || 3, 1), 3),
      });
      return NextResponse.json({ moments });
    }

    const moments = await listCoachingMoments(supabase, {
      clientId: access.clientId,
      coachId,
      limit: Math.min(Math.max(limit || 20, 1), 50),
    });
    return NextResponse.json({ moments });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  let body: ActionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action = body.action?.trim() || "create";
  const clientId = body.clientId?.trim() ?? "";
  const momentId = body.momentId?.trim() ?? "";
  const needsAi =
    action === "prepare_guidance" || action === "generate_insight";

  let personClientId = clientId;
  if ((!personClientId || !isUuid(personClientId)) && momentId && isUuid(momentId)) {
    const org = await requireOrganisationContext();
    if (!org.ok) return org.response;
    const existingMoment = await getCoachingMoment(org.context.supabase, {
      momentId,
      coachId: org.context.coachId,
    });
    if (!existingMoment) return notFoundOrForbidden();
    personClientId = existingMoment.clientId;
  }

  const access = await requireAssignedPersonInOrganisation({
    clientId: personClientId,
    requireAiEnabled: needsAi,
  });
  if (!access.ok) return access.response;
  personClientId = access.clientId;

  const { supabase, coachId } = access.context;

  try {
    switch (action) {
      case "create": {
        if (!personClientId || !isUuid(personClientId)) {
          return NextResponse.json(
            { error: "clientId is required." },
            { status: 400 }
          );
        }
        const moment = await createDraftCoachingMoment(supabase, {
          clientId: personClientId,
          coachId,
          situation: body.situation,
          desiredOutcome: body.desiredOutcome,
        });
        trackCoachingMomentEvent({
          event: "coaching_moment_started",
          relationshipId: personClientId,
          momentId: moment.id,
          status: moment.status,
        });
        return NextResponse.json({ moment });
      }

      case "save_prepare": {
        if (!momentId || !isUuid(momentId)) {
          return NextResponse.json(
            { error: "momentId is required." },
            { status: 400 }
          );
        }
        const moment = await savePrepareFields(supabase, {
          momentId,
          coachId,
          situation: body.situation ?? "",
          desiredOutcome: body.desiredOutcome,
        });
        return NextResponse.json({ moment });
      }

      case "prepare_guidance": {
        if (!momentId || !isUuid(momentId)) {
          return NextResponse.json(
            { error: "momentId is required." },
            { status: 400 }
          );
        }

        trackCoachingMomentEvent({
          event: "guidance_requested",
          momentId,
          relationshipId: clientId || undefined,
        });

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          trackCoachingMomentEvent({
            event: "guidance_failed",
            momentId,
          });
          return NextResponse.json(
            {
              error:
                "Guidance could not be prepared. Your notes remain available, and you can continue without AI support.",
              unavailable: true,
            },
            { status: 503 }
          );
        }

        const existing = await getCoachingMoment(supabase, {
          momentId,
          coachId,
        });
        if (!existing) return notFoundOrForbidden();

        const situation = (body.situation ?? existing.situation).trim();
        if (!situation) {
          return NextResponse.json(
            { error: "Describe the conversation you are preparing for." },
            { status: 400 }
          );
        }

        const desiredOutcome =
          body.desiredOutcome !== undefined
            ? body.desiredOutcome
            : existing.desiredOutcome;

        const saved = await savePrepareFields(supabase, {
          momentId,
          coachId,
          situation,
          desiredOutcome,
        });

        const { data: client } = await supabase
          .from("clients")
          .select(
            "id, name, organisation, role, status, archived_at, identity_mode, display_label, confidential_reference, ai_name_allowed"
          )
          .eq("id", saved.clientId)
          .eq("coach_id", coachId)
          .maybeSingle();

        if (!client || client.status === "Archived" || client.archived_at) {
          return NextResponse.json(
            { error: "This relationship is archived." },
            { status: 409 }
          );
        }

        const context = await loadAuthorisedCoachingMomentContext(supabase, {
          clientId: saved.clientId,
          coachId,
        });

        const fingerprint = buildGuidanceFingerprint([
          situation,
          desiredOutcome ?? "",
          context.authorisedEvidenceText.slice(0, 200),
          context.acceptedPatternsText.slice(0, 120),
        ]);

        if (
          saved.status === "prepared" &&
          saved.guidanceFingerprint === fingerprint &&
          saved.generatedIntention
        ) {
          trackCoachingMomentEvent({
            event: "guidance_succeeded",
            momentId: saved.id,
            relationshipId: saved.clientId,
            status: saved.status,
          });
          return NextResponse.json({ moment: saved, cached: true });
        }

        const openai = new OpenAI({ apiKey });
        const momentAiContext = buildRelationshipAiContext({
          name: String(client.name ?? ""),
          organisation: client.organisation ? String(client.organisation) : "",
          role: client.role ? String(client.role) : "",
          identityMode: client.identity_mode,
          displayLabel: client.display_label,
          confidentialReference: client.confidential_reference,
          aiNameAllowed: client.ai_name_allowed,
        });
        const response = await openai.responses.create({
          model: "gpt-5.5",
          instructions: COACHING_MOMENT_PREPARATION_PROMPT,
          input: buildCoachingMomentPreparationInput({
            personName: momentAiContext.aiDisplayName,
            organisation: momentAiContext.organisation || null,
            role: momentAiContext.role || null,
            situation,
            desiredOutcome,
            authorisedEvidence: context.authorisedEvidenceText,
            acceptedPatterns: context.acceptedPatternsText,
            confirmedCommitments: context.commitmentsText,
          }),
          store: false,
        });

        const outputText = response.output_text?.trim();
        if (!outputText) {
          trackCoachingMomentEvent({ event: "guidance_failed", momentId });
          return NextResponse.json(
            {
              error:
                "Guidance could not be prepared. Your notes remain available, and you can continue without AI support.",
              unavailable: true,
            },
            { status: 502 }
          );
        }

        const { data: otherClients } = await supabase
          .from("clients")
          .select("name")
          .eq("coach_id", coachId)
          .neq("id", saved.clientId);
        const knownOtherNames = (otherClients ?? []).map(row =>
          String(row.name ?? "")
        );
        if (
          containsUnexpectedPersonName(
            outputText,
            momentAiContext.allowedClientName,
            knownOtherNames
          )
        ) {
          console.error(
            "[relationship-isolation] Coaching moment AI named unexpected person",
            { relationshipId: saved.clientId }
          );
          trackCoachingMomentEvent({ event: "guidance_failed", momentId });
          return NextResponse.json(
            {
              error:
                "Guidance could not be prepared. Your notes remain available, and you can continue without AI support.",
              unavailable: true,
            },
            { status: 502 }
          );
        }

        let parsed;
        try {
          parsed = parseGuidanceFromModel(outputText);
        } catch {
          trackCoachingMomentEvent({ event: "guidance_failed", momentId });
          return NextResponse.json(
            {
              error:
                "Guidance could not be prepared. Your notes remain available, and you can continue without AI support.",
              unavailable: true,
            },
            { status: 502 }
          );
        }

        const moment = await applyGuidance(supabase, {
          momentId,
          coachId,
          guidance: parsed.guidance,
          inferredType: parsed.inferredType,
          fingerprint,
        });

        trackCoachingMomentEvent({
          event: "guidance_succeeded",
          momentId: moment.id,
          relationshipId: moment.clientId,
          status: moment.status,
        });

        return NextResponse.json({ moment });
      }

      case "continue_without_guidance": {
        if (!momentId || !isUuid(momentId)) {
          return NextResponse.json(
            { error: "momentId is required." },
            { status: 400 }
          );
        }
        const moment = await startCoachingMoment(supabase, {
          momentId,
          coachId,
          situation: body.situation,
          desiredOutcome: body.desiredOutcome,
        });
        trackCoachingMomentEvent({
          event: "continued_without_guidance",
          momentId: moment.id,
          relationshipId: moment.clientId,
          status: moment.status,
        });
        return NextResponse.json({ moment });
      }

      case "start": {
        if (!momentId || !isUuid(momentId)) {
          return NextResponse.json(
            { error: "momentId is required." },
            { status: 400 }
          );
        }
        const moment = await startCoachingMoment(supabase, {
          momentId,
          coachId,
          situation: body.situation,
          desiredOutcome: body.desiredOutcome,
        });
        return NextResponse.json({ moment });
      }

      case "save_private_note": {
        if (!momentId || !isUuid(momentId)) {
          return NextResponse.json(
            { error: "momentId is required." },
            { status: 400 }
          );
        }
        const moment = await savePrivateNote(supabase, {
          momentId,
          coachId,
          privateNote: body.privateNote ?? "",
        });
        return NextResponse.json({ moment });
      }

      case "save_outcome": {
        if (!momentId || !isUuid(momentId)) {
          return NextResponse.json(
            { error: "momentId is required." },
            { status: 400 }
          );
        }
        const moment = await saveCoachingMomentOutcome(supabase, {
          momentId,
          coachId,
          outcomeNotes: body.outcomeNotes ?? "",
          agreedCommitment: body.agreedCommitment,
          noCommitmentAgreed: body.noCommitmentAgreed,
          followUp: body.followUp,
        });
        trackCoachingMomentEvent({
          event: "coaching_moment_captured",
          momentId: moment.id,
          relationshipId: moment.clientId,
          status: moment.status,
        });
        return NextResponse.json({ moment });
      }

      case "complete": {
        if (!momentId || !isUuid(momentId)) {
          return NextResponse.json(
            { error: "momentId is required." },
            { status: 400 }
          );
        }
        const moment = await completeCoachingMoment(supabase, {
          momentId,
          coachId,
        });
        return NextResponse.json({ moment });
      }

      case "generate_insight": {
        if (!momentId || !isUuid(momentId)) {
          return NextResponse.json(
            { error: "momentId is required." },
            { status: 400 }
          );
        }

        trackCoachingMomentEvent({
          event: "insight_requested",
          momentId,
        });

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          return NextResponse.json(
            {
              error:
                "Insight could not be created right now. Your coaching moment remains saved.",
              unavailable: true,
            },
            { status: 503 }
          );
        }

        const existing = await getCoachingMoment(supabase, {
          momentId,
          coachId,
        });
        if (!existing) return notFoundOrForbidden();

        const { data: client } = await supabase
          .from("clients")
          .select(
            "id, name, organisation, role, identity_mode, display_label, confidential_reference, ai_name_allowed"
          )
          .eq("id", existing.clientId)
          .eq("coach_id", coachId)
          .maybeSingle();
        if (!client) return notFoundOrForbidden();

        const context = await loadAuthorisedCoachingMomentContext(supabase, {
          clientId: existing.clientId,
          coachId,
        });

        const insightAiContext = buildRelationshipAiContext({
          name: String(client.name ?? ""),
          organisation: client.organisation ? String(client.organisation) : "",
          role: client.role ? String(client.role) : "",
          identityMode: client.identity_mode,
          displayLabel: client.display_label,
          confidentialReference: client.confidential_reference,
          aiNameAllowed: client.ai_name_allowed,
        });

        const openai = new OpenAI({ apiKey });
        const response = await openai.responses.create({
          model: "gpt-5.5",
          instructions: COACHING_MOMENT_INSIGHT_PROMPT,
          input: buildCoachingMomentInsightInput({
            personName: insightAiContext.aiDisplayName,
            situation: existing.situation,
            desiredOutcome: existing.desiredOutcome,
            outcomeNotes: existing.outcomeNotes,
            agreedCommitment: existing.agreedCommitment,
            noCommitmentAgreed: existing.noCommitmentAgreed,
            followUp: existing.followUp,
            inferredType: existing.inferredType,
            authorisedEvidence: context.authorisedEvidenceText,
            acceptedPatterns: context.acceptedPatternsText,
          }),
          store: false,
        });

        const outputText = response.output_text?.trim();
        if (!outputText) {
          return NextResponse.json(
            {
              error:
                "Insight could not be created right now. Your coaching moment remains saved.",
              unavailable: true,
            },
            { status: 502 }
          );
        }

        let insight;
        try {
          insight = parseInsightFromModel(outputText);
        } catch {
          return NextResponse.json(
            {
              error:
                "Insight could not be created right now. Your coaching moment remains saved.",
              unavailable: true,
            },
            { status: 502 }
          );
        }

        const moment = await applyInsightDraft(supabase, {
          momentId,
          coachId,
          insight,
        });
        return NextResponse.json({ moment });
      }

      case "review_insight": {
        if (!momentId || !isUuid(momentId)) {
          return NextResponse.json(
            { error: "momentId is required." },
            { status: 400 }
          );
        }
        const decision = body.insightDecision;
        if (
          decision !== "accepted" &&
          decision !== "edited" &&
          decision !== "discarded"
        ) {
          return NextResponse.json(
            { error: "insightDecision is required." },
            { status: 400 }
          );
        }

        const moment = await reviewInsight(supabase, {
          momentId,
          coachId,
          decision,
          insight: body.insight
            ? {
                summary: body.insight.summary?.trim() ?? "",
                commitment: body.insight.commitment ?? null,
                patternConnection: body.insight.patternConnection ?? null,
                followUpQuestion: body.insight.followUpQuestion ?? null,
              }
            : null,
        });

        trackCoachingMomentEvent({
          event:
            decision === "discarded" ? "insight_discarded" : "insight_accepted",
          momentId: moment.id,
          relationshipId: moment.clientId,
          status: moment.insightStatus,
        });

        return NextResponse.json({ moment });
      }

      case "discard": {
        if (!momentId || !isUuid(momentId)) {
          return NextResponse.json(
            { error: "momentId is required." },
            { status: 400 }
          );
        }
        const moment = await discardCoachingMoment(supabase, {
          momentId,
          coachId,
        });
        return NextResponse.json({ moment });
      }

      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
