import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  buildDevelopmentUpdateInput,
  DEVELOPMENT_UPDATE_SYSTEM_PROMPT,
  formatProfileForPrompt,
} from "@/lib/ai/development-update-prompt";
import { createPersonLevelResponse } from "@/lib/ai/person-level-openai";
import { knownIdentitiesFromPublicClient } from "@/lib/ai/minimise-for-external";
import { developmentUpdateErrorResponse } from "@/lib/development-updates/api-response";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";
import {
  buildDevelopmentAuthorisedEvidenceText,
  buildDevelopmentRetryPromptAddon,
  developmentRejectionResponseBody,
  evaluateDevelopmentGenerationAttempt,
  logDevelopmentGenerationRejection,
  type DevelopmentRejection,
} from "@/lib/development-updates/generate-validation";
import {
  ensureProfileOrEmpty,
  recordDevelopmentGenerationRejection,
  upsertDevelopmentUpdateFromGeneration,
} from "@/lib/development-updates/repository";
import { refineDevelopmentUpdateGeneration } from "@/lib/development-updates/evidence-status";
import { listApprovedIntelligenceForClient } from "@/lib/intelligence/repository";
import { getApprovedRelationshipEvidence } from "@/lib/journey/load-journey-view-model";
import { assertRelationshipOwnership } from "@/lib/relationship-scope";
import {
  buildRelationshipAiContext,
  formatRelationshipAiPersonContext,
} from "@/lib/relationship-identity";

type GenerateRequest = {
  clientId?: string;
  sessionId?: string;
  forceRegenerateApplied?: boolean;
};

const COMPLETED_SESSION_STATUSES = new Set([
  "completed",
  "awaiting_completion",
]);

async function persistRejection(
  supabase: SupabaseClient,
  coachId: string,
  meta: {
    clientId: string;
    sessionId: string;
    rejection: DevelopmentRejection;
    attempt: number;
    responseId?: string | null;
    sessionStatus?: string | null;
    sessionNumber?: number | null;
    completedAt?: string | null;
    hasNotes?: boolean;
    hasSummary?: boolean;
  }
) {
  logDevelopmentGenerationRejection({
    clientId: meta.clientId,
    relationshipId: meta.clientId,
    sessionId: meta.sessionId,
    rejection: meta.rejection,
    attempt: meta.attempt,
    responseId: meta.responseId,
    sessionStatus: meta.sessionStatus,
    sessionNumber: meta.sessionNumber,
    completedAt: meta.completedAt,
    hasNotes: meta.hasNotes,
    hasSummary: meta.hasSummary,
  });
  await recordDevelopmentGenerationRejection(supabase, coachId, {
    clientId: meta.clientId,
    relationshipId: meta.clientId,
    sessionId: meta.sessionId,
    rejectionCode: meta.rejection.code,
    rejectionStage: meta.rejection.stage,
    attempt: meta.attempt,
    responseId: meta.responseId,
    fieldPath: meta.rejection.fieldName ?? null,
    issueCode: meta.rejection.validationDiagnostic?.issueCode ?? null,
    validationDiagnostic: meta.rejection.validationDiagnostic ?? null,
  });
}

export async function POST(request: Request) {
  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  if (!sessionId) {
    return NextResponse.json(
      { error: "clientId and sessionId are required." },
      { status: 400 }
    );
  }

  const access = await requireAssignedPersonInOrganisation({
    clientId: body.clientId,
    requireAiEnabled: true,
  });
  if (!access.ok) return access.response;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key is not configured." },
      { status: 500 }
    );
  }

  const clientId = access.clientId;
  const supabase = access.context.supabase;
  const coachId = access.context.coachId;

  try {
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("client_id", clientId)
      .eq("coach_id", coachId)
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json(
        {
          code: "DEVELOPMENT_SESSION_MISMATCH",
          error: "Session not found for this relationship.",
          message: "Session not found for this relationship.",
          stage: "session_guard",
          existingProfilePreserved: true,
          retryable: false,
        },
        { status: 404 }
      );
    }

    const sessionStatus = String(session.status ?? "");
    const sessionNumber =
      typeof session.session_number === "number" ? session.session_number : null;
    const completedAt =
      typeof session.completed_at === "string" ? session.completed_at : null;

    console.info("[development-generation] request", {
      relationshipId: clientId,
      sessionId,
      sessionStatus,
      sessionNumber,
      completedAt,
      hasNotes: Boolean(String(session.notes ?? "").trim()),
      hasSummary: Boolean(
        String(session.summary ?? session.ai_draft_summary ?? "").trim()
      ),
    });

    if (!COMPLETED_SESSION_STATUSES.has(sessionStatus)) {
      const rejection: DevelopmentRejection = {
        code: "DEVELOPMENT_SESSION_NOT_COMPLETE",
        stage: "session_guard",
        validator: "sessionStatusGuard",
        retryable: false,
        existingProfilePreserved: true,
      };
      await persistRejection(supabase, coachId, {
        clientId,
        sessionId,
        rejection,
        attempt: 0,
        sessionStatus,
        sessionNumber,
        completedAt,
        hasNotes: Boolean(String(session.notes ?? "").trim()),
        hasSummary: Boolean(
          String(session.summary ?? session.ai_draft_summary ?? "").trim()
        ),
      });
      return NextResponse.json(developmentRejectionResponseBody(rejection), {
        status: 422,
      });
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select(
        "id, name, organisation, role, current_focus, identity_summary, coach_insight, identity_mode, display_label, confidential_reference, ai_name_allowed"
      )
      .eq("id", clientId)
      .eq("coach_id", coachId)
      .maybeSingle();

    if (clientError || !client) {
      return NextResponse.json({ error: "Person not found." }, { status: 404 });
    }

    const aiContext = buildRelationshipAiContext({
      name: String(client.name ?? ""),
      organisation: client.organisation ? String(client.organisation) : "",
      role: client.role ? String(client.role) : "",
      identityMode: client.identity_mode,
      displayLabel: client.display_label,
      confidentialReference: client.confidential_reference,
      aiNameAllowed: client.ai_name_allowed,
    });
    const clientName = aiContext.aiDisplayName;
    const notes = String(session.notes ?? "").trim();
    const summary = String(session.summary ?? session.ai_draft_summary ?? "").trim();
    const commitments = String(session.commitments ?? session.agreed_actions ?? "").trim();

    if (!notes && !summary) {
      return NextResponse.json(
        {
          error:
            "Add session notes or a summary before generating a development update.",
        },
        { status: 400 }
      );
    }

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
      if (profile) assertRelationshipOwnership(clientId, [profile]);
    } catch {
      console.error("[relationship-isolation] Development update evidence ownership failed", {
        relationshipId: clientId,
      });
      return NextResponse.json(
        { error: "Unable to confirm relationship-scoped evidence." },
        { status: 409 }
      );
    }

    const { data: previousSessions } = await supabase
      .from("sessions")
      .select(
        "id, session_date, display_date, title, summary, emerging_themes, commitments, agreed_actions"
      )
      .eq("client_id", clientId)
      .eq("coach_id", coachId)
      .neq("id", sessionId)
      .order("session_number", { ascending: false })
      .order("session_date", { ascending: false })
      .limit(5);

    const { data: clientSessionRows } = await supabase
      .from("sessions")
      .select("id")
      .eq("client_id", clientId)
      .eq("coach_id", coachId);
    const allowedSessionIds = new Set(
      (clientSessionRows ?? []).map(row => String(row.id)).filter(Boolean)
    );
    allowedSessionIds.add(sessionId);

    let approvedIntelligence = "";
    try {
      const approved = await listApprovedIntelligenceForClient(supabase, coachId, clientId);
      approvedIntelligence = approved
        .slice(0, 20)
        .map(
          item =>
            `- ${item.category}: ${item.title} (${item.confidenceLabel ?? "emerging"}) — ${item.description}`
        )
        .join("\n");
    } catch {
      approvedIntelligence = "";
    }

    const personContext = [
      ...formatRelationshipAiPersonContext(aiContext),
      client.current_focus ? `Recorded focus: ${client.current_focus}` : "",
      client.identity_summary
        ? `Professional identity summary: ${client.identity_summary}`
        : "",
      client.coach_insight ? `Coach insight: ${client.coach_insight}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const previousSessionsText = (previousSessions ?? [])
      .map(row => {
        const dateLabel =
          (row.display_date as string | null) ||
          (row.session_date as string | null) ||
          "unknown";
        const parts = [
          `Date: ${dateLabel}`,
          row.title ? `Title: ${row.title}` : "",
          row.summary ? `Summary: ${row.summary}` : "",
          row.emerging_themes ? `Themes: ${row.emerging_themes}` : "",
          row.commitments || row.agreed_actions
            ? `Commitments: ${row.commitments || row.agreed_actions}`
            : "",
        ].filter(Boolean);
        return parts.join("\n");
      })
      .join("\n\n");

    const { data: otherClients } = await supabase
      .from("clients")
      .select("name")
      .eq("coach_id", coachId)
      .neq("id", clientId);
    const knownOtherNames = (otherClients ?? [])
      .map(row => String(row.name ?? "").trim())
      .filter(Boolean);

    const developmentProfileText = formatProfileForPrompt(profile);
    const coachReflection = String(session.coach_reflection ?? "");
    const organisationName = client.organisation
      ? String(client.organisation)
      : undefined;

    // Organisation + current-relationship generation sources only. Other-client
    // name tokens remain blocked unless they already appear in this evidence.
    const authorisedEvidenceText = buildDevelopmentAuthorisedEvidenceText({
      personContext,
      developmentProfile: developmentProfileText,
      previousSessions: previousSessionsText,
      sessionNotes: notes,
      approvedSummary: summary,
      commitments,
      coachReflection,
      approvedIntelligence,
    });

    const isolationContext = {
      allowedClientName: aiContext.allowedClientName,
      knownOtherNames,
      organisationName,
      authorisedNames: [
        aiContext.allowedClientName,
        organisationName,
        authorisedEvidenceText,
      ].filter(Boolean) as string[],
    };

    const promptInput = buildDevelopmentUpdateInput({
      personContext,
      developmentProfile: developmentProfileText,
      previousSessions: previousSessionsText,
      sessionNotes: notes,
      approvedSummary: summary,
      commitments,
      coachReflection,
      approvedIntelligence,
    });

    const openai = new OpenAI({ apiKey });
    const identities = knownIdentitiesFromPublicClient(
      {
        name: String(client.name ?? ""),
        displayLabel: client.display_label
          ? String(client.display_label)
          : null,
        organisation: client.organisation
          ? String(client.organisation)
          : null,
        role: client.role ? String(client.role) : null,
        identityMode: client.identity_mode
          ? String(client.identity_mode)
          : null,
        aiNameAllowed: Boolean(client.ai_name_allowed),
      },
      { otherPersonNames: knownOtherNames }
    );

    async function generateAttempt(isolationRetry: boolean) {
      const instructions = isolationRetry
        ? `${DEVELOPMENT_UPDATE_SYSTEM_PROMPT}\n\n${buildDevelopmentRetryPromptAddon(
            clientName
          )}`
        : DEVELOPMENT_UPDATE_SYSTEM_PROMPT;
      const response = await createPersonLevelResponse(
        openai,
        {
          model: "gpt-5.5",
          instructions,
          input: promptInput,
        },
        identities
      );
      return {
        outputText: response.output_text?.trim() ?? "",
        responseId: response.id ?? null,
      };
    }

    let attempt = 1;
    let { outputText, responseId } = await generateAttempt(false);
    let evaluation = evaluateDevelopmentGenerationAttempt({
      outputText,
      isolationContext,
      allowedSessionIds,
      attempt,
    });

    if (!evaluation.ok && evaluation.rejection.retryable) {
      await persistRejection(supabase, coachId, {
        clientId,
        sessionId,
        rejection: evaluation.rejection,
        attempt,
        responseId,
        sessionStatus,
        sessionNumber,
        completedAt,
        hasNotes: Boolean(notes),
        hasSummary: Boolean(summary),
      });

      attempt = 2;
      ({ outputText, responseId } = await generateAttempt(true));
      evaluation = evaluateDevelopmentGenerationAttempt({
        outputText,
        isolationContext,
        allowedSessionIds,
        attempt,
      });
    }

    if (!evaluation.ok) {
      await persistRejection(supabase, coachId, {
        clientId,
        sessionId,
        rejection: evaluation.rejection,
        attempt,
        responseId,
        sessionStatus,
        sessionNumber,
        completedAt,
        hasNotes: Boolean(notes),
        hasSummary: Boolean(summary),
      });
      return NextResponse.json(
        developmentRejectionResponseBody(evaluation.rejection),
        { status: 422 }
      );
    }

    const update = await upsertDevelopmentUpdateFromGeneration(
      supabase,
      coachId,
      clientId,
      sessionId,
      refineDevelopmentUpdateGeneration(evaluation.generation, profile),
      { forceRegenerateApplied: Boolean(body.forceRegenerateApplied) }
    );

    console.info("[development-generation] saved", {
      relationshipId: clientId,
      sessionId,
      updateId: update.id,
      hasMeaningfulChanges: update.hasMeaningfulChanges,
      attempt,
      responseId,
    });

    return NextResponse.json({
      update,
      notice: update.hasMeaningfulChanges
        ? "A suggested development update is ready for review."
        : "No meaningful profile changes were identified from this conversation.",
      outcome: update.hasMeaningfulChanges
        ? "ready_for_review"
        : "no_meaningful_change",
    });
  } catch (error) {
    console.error(
      "Development update generate error:",
      error instanceof Error ? error.name : "unknown"
    );
    try {
      await recordDevelopmentGenerationRejection(supabase, coachId, {
        clientId,
        relationshipId: clientId,
        sessionId,
        rejectionCode: "DEVELOPMENT_VALIDATION_FAILED",
        rejectionStage: "parsing",
        attempt: 1,
        responseId: null,
      });
    } catch {
      // Ignore secondary audit failure.
    }
    return developmentUpdateErrorResponse(
      error,
      "We couldn’t prepare the development update. Your session notes have been saved. Please try generating the update again."
    );
  }
}
