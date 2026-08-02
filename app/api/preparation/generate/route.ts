import OpenAI from "openai";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  buildPreparationBriefInput,
  PREPARATION_BRIEF_SYSTEM_PROMPT,
} from "@/lib/ai/preparation-brief-prompt";
import { formatProfileForPrompt } from "@/lib/ai/development-update-prompt";
import { getCoachProfile } from "@/lib/auth/session";
import {
  requireAssignedClientAccess,
  requireOrganisationContext,
} from "@/lib/organisations/current-organisation";
import { buildClientJourneySnapshot } from "@/lib/client-journey";
import { ensureProfileOrEmpty } from "@/lib/development-updates/repository";
import {
  buildSourceFingerprint,
  EMPTY_PREPARATION_AI_BRIEF,
  parsePreparationAiBriefFromModel,
} from "@/lib/preparation-brief";
import {
  DEFAULT_PREPARATION_STYLE,
  parsePreparationStyle,
  parsePreparationStyleOverride,
  resolvePreparationStyle,
  type PreparationStyle,
} from "@/lib/preparation-style";
import { getApprovedRelationshipEvidence } from "@/lib/journey/load-journey-view-model";
import {
  assertRelationshipOwnership,
  containsUnexpectedPersonName,
} from "@/lib/relationship-scope";
import { rowToSession } from "@/lib/supabase/map";
import {
  parseSupportingContext,
  supportingContextForAi,
  SUPPORTING_CONTEXT_SOURCE_LABELS,
} from "@/lib/relationship-meta";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

type GenerateRequest = {
  clientId?: string;
  sessionId?: string;
  style?: PreparationStyle;
};

export async function POST(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  if (!auth.context.organisation.organisation.aiEnabled) {
    return NextResponse.json(
      {
        error:
          "AI preparation is disabled for this organisation. Your client information and notes are still available below.",
        unavailable: true,
      },
      { status: 403 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "AI preparation is temporarily unavailable. Your client information and notes are still available below.",
        unavailable: true,
      },
      { status: 503 }
    );
  }

  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const clientId = body.clientId?.trim();
  const sessionId = body.sessionId?.trim();
  if (!clientId || !sessionId || !isUuid(clientId) || !isUuid(sessionId)) {
    return NextResponse.json(
      { error: "clientId and sessionId are required." },
      { status: 400 }
    );
  }

  const access = await requireAssignedClientAccess({
    supabase: auth.context.supabase,
    context: auth.context,
    clientId,
  });
  if (!access.ok) return access.response;

  // Reject client-supplied organisation bypass attempts.
  if (
    typeof (body as { organisationId?: unknown }).organisationId === "string" &&
    (body as { organisationId?: string }).organisationId !==
      auth.context.organisation.organisationId
  ) {
    return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  }

  const supabase = auth.context.supabase;
  const coachId = auth.context.coachId;

  try {
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select(
        "id, name, organisation, role, current_focus, identity_summary, coach_insight, preparation_style_override, updated_at"
      )
      .eq("id", clientId)
      .eq("coach_id", coachId)
      .maybeSingle();

    if (clientError || !client) {
      return NextResponse.json({ error: "Resource not found." }, { status: 404 });
    }

    const { data: sessionRow, error: sessionError } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("client_id", clientId)
      .eq("coach_id", coachId)
      .maybeSingle();

    if (sessionError || !sessionRow) {
      return NextResponse.json({ error: "Resource not found." }, { status: 404 });
    }

    const coachProfile = await getCoachProfile(supabase, coachId);
    const coachStyle = coachProfile?.preparationStyle ?? DEFAULT_PREPARATION_STYLE;
    const clientOverride = parsePreparationStyleOverride(
      client.preparation_style_override
    );
    const requestedStyle = body.style
      ? parsePreparationStyle(body.style, resolvePreparationStyle(coachStyle, clientOverride))
      : resolvePreparationStyle(coachStyle, clientOverride);

    if (requestedStyle === "minimal") {
      const now = new Date().toISOString();
      const { error: clearError } = await supabase
        .from("sessions")
        .update({
          prep_ai_brief: EMPTY_PREPARATION_AI_BRIEF,
          prep_ai_brief_generated_at: now,
          prep_ai_brief_style: "minimal",
          prep_ai_brief_source_fingerprint: null,
          updated_at: now,
        })
        .eq("id", sessionId)
        .eq("coach_id", coachId);

      if (clearError) {
        return NextResponse.json(
          { error: "Unable to update preparation." },
          { status: 503 }
        );
      }

      return NextResponse.json({
        style: "minimal" as const,
        brief: EMPTY_PREPARATION_AI_BRIEF,
        generatedAt: now,
        sourceFingerprint: "",
        skipped: true,
      });
    }

    const { data: sessionRows } = await supabase
      .from("sessions")
      .select("*")
      .eq("client_id", clientId)
      .eq("coach_id", coachId)
      .order("session_number", { ascending: false });

    const sessions = (sessionRows ?? []).map((row, index, all) =>
      rowToSession(row, index, all.length)
    );
    const currentSession = sessions.find(item => item.id === sessionId) ?? rowToSession(sessionRow, 0, 1);

    const journey = buildClientJourneySnapshot(
      {
        id: client.id,
        name: client.name,
        initials: "",
        organisation: client.organisation ?? "",
        role: client.role ?? "",
        email: "",
        status: "Active",
        nextSession: "",
        currentFocus: client.current_focus ?? "",
        identitySummary: client.identity_summary ?? "",
        coachInsight: client.coach_insight ?? "",
        preparationStyleOverride: clientOverride,
        strengths: [],
        values: [],
        themes: [],
        goals: [],
        actions: [],
        quotes: [],
        sessions,
        journey: [],
      },
      []
    );

    const previous = [...sessions]
      .filter(
        item =>
          item.id !== sessionId &&
          (item.status === "completed" || item.aiSummaryApproved) &&
          item.summaryStatus === "approved"
      )
      .sort((a, b) => b.sessionNumber - a.sessionNumber);

    const latest = previous[0];
    const profile = await ensureProfileOrEmpty(
      supabase,
      coachId,
      clientId,
      String(client.current_focus ?? "")
    );

    const evidence = await getApprovedRelationshipEvidence(supabase, {
      coachId,
      relationshipId: clientId,
    });
    try {
      assertRelationshipOwnership(clientId, evidence);
      assertRelationshipOwnership(
        clientId,
        sessions.map(item => ({ relationshipId: item.clientId }))
      );
      if (profile) assertRelationshipOwnership(clientId, [profile]);
    } catch {
      console.error("[relationship-isolation] Preparation evidence ownership failed", {
        relationshipId: clientId,
      });
      return NextResponse.json(
        {
          error:
            "AI preparation is temporarily unavailable. Your client information and notes are still available below.",
          unavailable: true,
        },
        { status: 409 }
      );
    }

    const personContext = [
      `Name: ${client.name}`,
      client.organisation ? `Organisation: ${client.organisation}` : "",
      client.role ? `Role: ${client.role}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const latestConversation = latest
      ? [
          `Date: ${latest.date || latest.completedAt || "unknown"}`,
          latest.focus ? `Focus: ${latest.focus}` : "",
          latest.summary ? `Approved summary: ${latest.summary}` : "",
          latest.professionalIdentityDevelopment
            ? `Key learning: ${latest.professionalIdentityDevelopment}`
            : "",
          latest.commitments || latest.agreedActions
            ? `Commitments: ${latest.commitments || latest.agreedActions}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";

    const previousSessionsText = previous
      .slice(0, 6)
      .map(item =>
        [
          `Conversation ${item.sessionNumber}`,
          `Date: ${item.date || item.completedAt || "unknown"}`,
          item.summary ? `Approved summary: ${item.summary}` : "",
          item.emergingThemes ? `Themes: ${item.emergingThemes}` : "",
          item.commitments || item.agreedActions
            ? `Commitments: ${item.commitments || item.agreedActions}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      )
      .join("\n\n");

    const sourceFingerprint = buildSourceFingerprint([
      client.updated_at,
      latest?.lastUpdated,
      latest?.completedAt,
      profile.updatedAt,
      // Fingerprint whether private notes exist without sending their contents to AI.
      currentSession.prepPrivateNotes ? "notes:present" : "notes:absent",
      String(client.current_focus ?? ""),
    ]);

    const openai = new OpenAI({ apiKey });
    const optedSupportingContext = supportingContextForAi(
      parseSupportingContext(
        (client as { supporting_context?: unknown }).supporting_context
      )
    );
    const supportingContextText = optedSupportingContext
      .map(item =>
        [
          `${item.title} (${SUPPORTING_CONTEXT_SOURCE_LABELS[item.sourceType]})`,
          item.sourceDate ? `Date: ${item.sourceDate}` : "",
          item.summary ? item.summary : "",
        ]
          .filter(Boolean)
          .join("\n")
      )
      .join("\n\n");

    const response = await openai.responses.create({
      model: "gpt-5.5",
      instructions: PREPARATION_BRIEF_SYSTEM_PROMPT,
      input: buildPreparationBriefInput({
        style: requestedStyle,
        personContext,
        coachingPurpose: String(client.current_focus ?? ""),
        currentFocus: profile.currentFocus || String(client.current_focus ?? ""),
        journeyStage: journey.stage.label,
        latestConversation,
        approvedSummary: latest?.summary ?? "",
        commitments:
          latest?.commitments ||
          latest?.agreedActions ||
          currentSession.prepCommitmentsReview ||
          "",
        developmentProfile: formatProfileForPrompt(profile),
        previousSessions: previousSessionsText,
        // Private preparation notes are never sent to AI models.
        coachNotes: "",
        supportingContext: supportingContextText,
      }),
    });

    const outputText = response.output_text?.trim();
    if (!outputText) {
      return NextResponse.json(
        {
          error:
            "AI preparation is temporarily unavailable. Your client information and notes are still available below.",
          unavailable: true,
        },
        { status: 502 }
      );
    }

    const { data: otherClients } = await supabase
      .from("clients")
      .select("name")
      .eq("coach_id", coachId)
      .neq("id", clientId);
    const knownOtherNames = (otherClients ?? []).map(row => String(row.name ?? ""));
    if (
      containsUnexpectedPersonName(
        outputText,
        String(client.name),
        knownOtherNames
      )
    ) {
      console.error("[relationship-isolation] Preparation AI named unexpected person", {
        relationshipId: clientId,
      });
      return NextResponse.json(
        {
          error:
            "AI preparation is temporarily unavailable. Your client information and notes are still available below.",
          unavailable: true,
        },
        { status: 422 }
      );
    }

    let brief;
    try {
      brief = parsePreparationAiBriefFromModel(outputText);
    } catch (error) {
      console.error("Preparation brief parse error:", error instanceof ZodError ? error.message : error);
      return NextResponse.json(
        {
          error:
            "AI preparation is temporarily unavailable. Your client information and notes are still available below.",
          unavailable: true,
        },
        { status: 502 }
      );
    }

    // Preserve coach notes / confirmed session fields — only replace AI brief.
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("sessions")
      .update({
        prep_ai_brief: brief,
        prep_ai_brief_generated_at: now,
        prep_ai_brief_style: requestedStyle,
        prep_ai_brief_confirmed_at: null,
        prep_ai_brief_source_fingerprint: sourceFingerprint,
        updated_at: now,
      })
      .eq("id", sessionId)
      .eq("coach_id", coachId)
      .eq("client_id", clientId);

    if (updateError) {
      console.error("Save preparation brief error:", updateError.message);
      return NextResponse.json(
        {
          error:
            "AI preparation is temporarily unavailable. Your client information and notes are still available below.",
          unavailable: true,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      style: requestedStyle,
      brief,
      generatedAt: now,
      sourceFingerprint,
      confirmedAt: "",
    });
  } catch (error) {
    console.error("Generate preparation brief error:", error);
    return NextResponse.json(
      {
        error:
          "AI preparation is temporarily unavailable. Your client information and notes are still available below.",
        unavailable: true,
      },
      { status: 502 }
    );
  }
}
