import OpenAI from "openai";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ZodError } from "zod";
import { generatedBriefToPreparationAiBrief } from "@/lib/coaching-intelligence/brief-map";
import {
  isCoachingIntelligenceMode,
  modeToPreparationStyle,
} from "@/lib/coaching-intelligence/mode";
import { parseGeneratedPreparationBrief } from "@/lib/coaching-intelligence/parse-generated-brief";
import {
  buildPreparationIntelligenceInput,
  buildPreparationIntelligenceInstructions,
} from "@/lib/coaching-intelligence/prompt";
import { resolveIntelligenceSources } from "@/lib/coaching-intelligence/resolve-sources";
import { buildSourceFingerprint } from "@/lib/preparation-brief";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";
import { evaluatePreparationIsolationAttempt } from "@/lib/coaching-intelligence/preparation-isolation";
import {
  assertRelationshipOwnership,
  logRelationshipIsolationRejection,
} from "@/lib/relationship-scope";
import {
  buildRelationshipAiContext,
  formatRelationshipAiPersonContext,
} from "@/lib/relationship-identity";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

const PREPARATION_REFRESH_UNCHANGED =
  "Preparation could not be refreshed. Your existing preparation remains available. Please try again.";

const PREPARATION_CROSS_CLIENT_MESSAGE =
  "Preparation could not be refreshed safely.";

type PrepareRequest = {
  relationshipId?: string;
  conversationId?: string;
  mode?: string;
};

type PreparationErrorCode =
  | "PREPARATION_AI_UNAVAILABLE"
  | "PREPARATION_INVALID_REQUEST"
  | "PREPARATION_RELATIONSHIP_FORBIDDEN"
  | "PREPARATION_AI_REQUEST_FAILED"
  | "PREPARATION_AI_EMPTY"
  | "PREPARATION_CROSS_CLIENT"
  | "PREPARATION_JSON_INVALID"
  | "PREPARATION_SCHEMA_INVALID"
  | "PREPARATION_SAVE_FAILED";

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

function logPreparationBoundary(
  code: PreparationErrorCode,
  details: Record<string, unknown>
) {
  if (!isDev()) {
    console.error("[preparation-refresh]", { errorCode: code });
    return;
  }
  console.error("[preparation-refresh]", { errorCode: code, ...details });
}

function missingColumnName(message: string): string | null {
  return message.match(/could not find the '([^']+)' column/i)?.[1] ?? null;
}

/**
 * Persist session fields, stripping columns that are not yet in the live schema.
 * Matches the resilient upsert path used by saveSessionInDb.
 */
async function updateSessionWithSchemaFallback(
  supabase: SupabaseClient,
  input: {
    conversationId: string;
    relationshipId: string;
    coachId: string;
  },
  payload: Record<string, unknown>
): Promise<{ error: { message: string } | null; strippedColumns: string[] }> {
  let nextPayload: Record<string, unknown> = { ...payload };
  const strippedColumns: string[] = [];

  let { error } = await supabase
    .from("sessions")
    .update(nextPayload)
    .eq("id", input.conversationId)
    .eq("coach_id", input.coachId)
    .eq("client_id", input.relationshipId);

  for (let attempt = 0; attempt < 8 && error; attempt += 1) {
    const missing = missingColumnName(error.message);
    if (!missing || !(missing in nextPayload)) break;
    const reduced = { ...nextPayload };
    delete reduced[missing];
    nextPayload = reduced;
    strippedColumns.push(missing);
    if (isDev()) {
      console.warn("[preparation-refresh] stripping missing column and retrying", {
        missing,
        attempt,
      });
    }
    const retry = await supabase
      .from("sessions")
      .update(nextPayload)
      .eq("id", input.conversationId)
      .eq("coach_id", input.coachId)
      .eq("client_id", input.relationshipId);
    error = retry.error;
  }

  return { error, strippedColumns };
}

function failureResponse(
  errorCode: PreparationErrorCode,
  status: number,
  extras?: Record<string, unknown>
) {
  if (errorCode === "PREPARATION_CROSS_CLIENT") {
    return NextResponse.json(
      {
        code: "PREPARATION_CROSS_CLIENT",
        message: PREPARATION_CROSS_CLIENT_MESSAGE,
        error: PREPARATION_CROSS_CLIENT_MESSAGE,
        errorCode: "PREPARATION_CROSS_CLIENT",
        existingPreparationPreserved: true,
        retryAttempted: Boolean(extras?.retryAttempted),
      },
      { status }
    );
  }

  return NextResponse.json(
    {
      error: PREPARATION_REFRESH_UNCHANGED,
      errorCode,
      ...extras,
    },
    { status }
  );
}

async function generatePreparationDraft(input: {
  openai: OpenAI;
  mode: "assisted" | "comprehensive";
  clientDisplayName: string;
  personContext: string;
  coachingPurpose: string;
  sources: Awaited<ReturnType<typeof resolveIntelligenceSources>>;
  isolationRetry: boolean;
}): Promise<{ outputText: string; responseId: string }> {
  const modelInput = buildPreparationIntelligenceInput({
    mode: input.mode,
    personContext: input.personContext,
    coachingPurpose: input.coachingPurpose,
    sources: input.sources,
    clientDisplayName: input.clientDisplayName,
    isolationRetry: input.isolationRetry,
  });

  const response = await input.openai.responses.create({
    model: "gpt-5.5",
    instructions: buildPreparationIntelligenceInstructions({
      mode: input.mode,
      clientDisplayName: input.clientDisplayName,
      isolationRetry: input.isolationRetry,
    }),
    input: modelInput,
  });

  return {
    outputText: response.output_text?.trim() ?? "",
    responseId: response.id,
  };
}

export async function POST(request: Request) {
  let body: PrepareRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request body.",
        errorCode: "PREPARATION_INVALID_REQUEST" satisfies PreparationErrorCode,
      },
      { status: 400 }
    );
  }

  const relationshipId = body.relationshipId?.trim();
  const conversationId = body.conversationId?.trim();
  const mode = body.mode;
  const requestId = request.headers.get("x-request-id");

  if (
    !relationshipId ||
    !conversationId ||
    !isUuid(relationshipId) ||
    !isUuid(conversationId) ||
    !isCoachingIntelligenceMode(mode) ||
    mode === "manual"
  ) {
    return NextResponse.json(
      {
        error: "A valid relationship, conversation and AI-enabled mode are required.",
        errorCode: "PREPARATION_INVALID_REQUEST" satisfies PreparationErrorCode,
      },
      { status: 400 }
    );
  }

  const access = await requireAssignedPersonInOrganisation({
    clientId: relationshipId,
    requireAiEnabled: true,
  });
  if (!access.ok) return access.response;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: PREPARATION_REFRESH_UNCHANGED,
        errorCode: "PREPARATION_AI_UNAVAILABLE" satisfies PreparationErrorCode,
      },
      { status: 503 }
    );
  }

  const supabase = access.context.supabase;
  const coachId = access.context.coachId;

  try {
    // Best-effort status marker — ignore schema-cache misses until migration is applied.
    await updateSessionWithSchemaFallback(
      supabase,
      { conversationId, relationshipId, coachId },
      {
        intelligence_status: "preparing",
        intelligence_error_code: null,
        updated_at: new Date().toISOString(),
      }
    );

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select(
        "id, name, organisation, role, current_focus, updated_at, identity_mode, display_label, confidential_reference, ai_name_allowed"
      )
      .eq("id", relationshipId)
      .eq("coach_id", coachId)
      .maybeSingle();

    if (clientError || !client) {
      logPreparationBoundary("PREPARATION_RELATIONSHIP_FORBIDDEN", {
        relationshipId,
        conversationId,
        reason: clientError?.message ?? "client_not_found",
      });
      return failureResponse("PREPARATION_RELATIONSHIP_FORBIDDEN", 404);
    }

    const { data: sessionRow, error: sessionError } = await supabase
      .from("sessions")
      .select("id, client_id, coach_id, prep_private_notes")
      .eq("id", conversationId)
      .eq("client_id", relationshipId)
      .eq("coach_id", coachId)
      .maybeSingle();

    if (sessionError || !sessionRow) {
      logPreparationBoundary("PREPARATION_RELATIONSHIP_FORBIDDEN", {
        relationshipId,
        conversationId,
        reason: sessionError?.message ?? "session_not_found",
      });
      return failureResponse("PREPARATION_RELATIONSHIP_FORBIDDEN", 404);
    }

    const sources = await resolveIntelligenceSources({
      supabase,
      coachId,
      relationshipId,
      conversationId,
      mode,
    });

    assertRelationshipOwnership(
      relationshipId,
      sources.previousConversations.map(item => ({
        relationshipId,
        id: item.id,
      }))
    );

    const aiContext = buildRelationshipAiContext({
      name: String(client.name ?? ""),
      organisation: client.organisation ? String(client.organisation) : "",
      role: client.role ? String(client.role) : "",
      identityMode: client.identity_mode,
      displayLabel: client.display_label,
      confidentialReference: client.confidential_reference,
      aiNameAllowed: client.ai_name_allowed,
    });
    const clientDisplayName = aiContext.aiDisplayName;
    const organisationName = aiContext.organisation;

    const personContext = formatRelationshipAiPersonContext(aiContext).join("\n");

    const sourceFingerprint = buildSourceFingerprint([
      client.updated_at,
      sources.usedSources.join(","),
      sources.previousConversations.map(item => item.id).join(","),
      sources.approvedSummaries.map(item => item.id).join(","),
      // Fingerprint whether private notes exist without sending contents.
      sessionRow.prep_private_notes ? "notes:present" : "notes:absent",
      String(client.current_focus ?? ""),
    ]);

    if (isDev()) {
      console.info("[preparation-refresh] AI request starting", {
        relationshipId,
        conversationId,
        mode,
        usedSourceCount: sources.usedSources.length,
        previousConversationCount: sources.previousConversations.length,
        approvedSummaryCount: sources.approvedSummaries.length,
        inputChars: buildPreparationIntelligenceInput({
          mode,
          personContext,
          coachingPurpose: String(client.current_focus ?? ""),
          sources,
          clientDisplayName,
        }).length,
      });
    }

    const { data: otherClients } = await supabase
      .from("clients")
      .select("name")
      .eq("coach_id", coachId)
      .neq("id", relationshipId);
    const knownOtherNames = (otherClients ?? []).map(row =>
      String(row.name ?? "")
    );

    const openai = new OpenAI({ apiKey });
    const generationBase = {
      openai,
      mode,
      clientDisplayName,
      personContext,
      coachingPurpose: String(client.current_focus ?? ""),
      sources,
    } as const;

    let outputText = "";
    let responseId = "";
    let isolationRetryAttempted = false;

    try {
      const firstDraft = await generatePreparationDraft({
        ...generationBase,
        isolationRetry: false,
      });
      outputText = firstDraft.outputText;
      responseId = firstDraft.responseId;
    } catch (error) {
      logPreparationBoundary("PREPARATION_AI_REQUEST_FAILED", {
        relationshipId,
        conversationId,
        mode,
        reason: error instanceof Error ? error.message : "openai_request_failed",
      });
      await markIntelligenceError(supabase, {
        conversationId,
        relationshipId,
        coachId,
        mode,
        errorCode: "PREPARATION_AI_REQUEST_FAILED",
      });
      return failureResponse("PREPARATION_AI_REQUEST_FAILED", 502);
    }

    if (!outputText) {
      logPreparationBoundary("PREPARATION_AI_EMPTY", {
        relationshipId,
        conversationId,
        mode,
        responseId,
      });
      await markIntelligenceError(supabase, {
        conversationId,
        relationshipId,
        coachId,
        mode,
        errorCode: "PREPARATION_AI_EMPTY",
      });
      return failureResponse("PREPARATION_AI_EMPTY", 502);
    }

    if (isDev()) {
      console.info("[preparation-refresh] AI response received", {
        relationshipId,
        conversationId,
        mode,
        responseId,
        outputChars: outputText.length,
        looksLikeJson: outputText.startsWith("{") || outputText.includes("```"),
        attempt: 1,
      });
    }

    const isolationContext = {
      allowedClientName: clientDisplayName,
      knownOtherNames,
      organisationName,
      authorisedNames: [organisationName].filter(Boolean),
    };

    const firstIsolation = evaluatePreparationIsolationAttempt({
      draftText: outputText,
      context: isolationContext,
      attempt: 1,
    });

    if (!firstIsolation.maySave) {
      logRelationshipIsolationRejection({
        coachId,
        relationshipId,
        sessionId: conversationId,
        attempt: 1,
        matchType: firstIsolation.check.matchType,
        fieldName: firstIsolation.check.fieldName,
        retryAttempted: false,
        requestId,
        diagnosticSnippet: firstIsolation.check.diagnosticSnippet,
      });

      // Do not save the first draft. Retry once with a stricter prompt.
      // Never reuse rejected text as model input.
      isolationRetryAttempted = true;
      try {
        const retryDraft = await generatePreparationDraft({
          ...generationBase,
          isolationRetry: true,
        });
        outputText = retryDraft.outputText;
        responseId = retryDraft.responseId;
      } catch (error) {
        logPreparationBoundary("PREPARATION_AI_REQUEST_FAILED", {
          relationshipId,
          conversationId,
          mode,
          reason:
            error instanceof Error ? error.message : "openai_retry_failed",
          attempt: 2,
        });
        await markIntelligenceError(supabase, {
          conversationId,
          relationshipId,
          coachId,
          mode,
          errorCode: "PREPARATION_AI_REQUEST_FAILED",
        });
        return failureResponse("PREPARATION_AI_REQUEST_FAILED", 502);
      }

      if (!outputText) {
        logPreparationBoundary("PREPARATION_AI_EMPTY", {
          relationshipId,
          conversationId,
          mode,
          responseId,
          attempt: 2,
        });
        await markIntelligenceError(supabase, {
          conversationId,
          relationshipId,
          coachId,
          mode,
          errorCode: "PREPARATION_AI_EMPTY",
        });
        return failureResponse("PREPARATION_AI_EMPTY", 502);
      }

      if (isDev()) {
        console.info("[preparation-refresh] AI response received", {
          relationshipId,
          conversationId,
          mode,
          responseId,
          outputChars: outputText.length,
          looksLikeJson:
            outputText.startsWith("{") || outputText.includes("```"),
          attempt: 2,
        });
      }

      const retryIsolation = evaluatePreparationIsolationAttempt({
        draftText: outputText,
        context: isolationContext,
        attempt: 2,
      });

      if (!retryIsolation.maySave) {
        logRelationshipIsolationRejection({
          coachId,
          relationshipId,
          sessionId: conversationId,
          attempt: 2,
          matchType: retryIsolation.check.matchType,
          fieldName: retryIsolation.check.fieldName,
          retryAttempted: true,
          requestId,
          diagnosticSnippet: retryIsolation.check.diagnosticSnippet,
        });
        await markIntelligenceError(supabase, {
          conversationId,
          relationshipId,
          coachId,
          mode,
          errorCode: "PREPARATION_CROSS_CLIENT",
        });
        return failureResponse("PREPARATION_CROSS_CLIENT", 422, {
          retryAttempted: true,
        });
      }
    }

    let brief;
    try {
      brief = parseGeneratedPreparationBrief(outputText, mode);
    } catch (error) {
      const isSchema = error instanceof ZodError;
      const errorCode: PreparationErrorCode = isSchema
        ? "PREPARATION_SCHEMA_INVALID"
        : "PREPARATION_JSON_INVALID";
      logPreparationBoundary(errorCode, {
        relationshipId,
        conversationId,
        mode,
        reason: isSchema
          ? error.message
          : error instanceof Error
            ? error.message
            : "parse_failed",
        outputChars: outputText.length,
        retryAttempted: isolationRetryAttempted,
      });
      await markIntelligenceError(supabase, {
        conversationId,
        relationshipId,
        coachId,
        mode,
        errorCode,
      });
      return failureResponse(errorCode, 502);
    }

    // Never overwrite coach-entered preparation fields — only AI brief metadata.
    const now = new Date().toISOString();
    const preparationAiBrief = generatedBriefToPreparationAiBrief(brief, mode);
    const preparationStyle = modeToPreparationStyle(mode);

    const { error: updateError, strippedColumns } =
      await updateSessionWithSchemaFallback(
        supabase,
        { conversationId, relationshipId, coachId },
        {
          prep_ai_brief: preparationAiBrief,
          prep_ai_brief_generated_at: now,
          prep_ai_brief_style: preparationStyle,
          prep_ai_brief_confirmed_at: null,
          prep_ai_brief_source_fingerprint: sourceFingerprint,
          intelligence_mode: mode,
          intelligence_status: "ready",
          intelligence_sources: sources.usedSources,
          intelligence_last_refreshed_at: now,
          intelligence_error_code: null,
          updated_at: now,
        }
      );

    if (updateError) {
      logPreparationBoundary("PREPARATION_SAVE_FAILED", {
        relationshipId,
        conversationId,
        mode,
        reason: updateError.message,
        strippedColumns,
      });
      await markIntelligenceError(supabase, {
        conversationId,
        relationshipId,
        coachId,
        mode,
        errorCode: "PREPARATION_SAVE_FAILED",
      });
      return failureResponse("PREPARATION_SAVE_FAILED", 503);
    }

    if (isDev() && strippedColumns.length > 0) {
      console.warn(
        "[preparation-refresh] saved brief without pending migration columns",
        { strippedColumns, migrationHint: "npm run db:push" }
      );
    }

    return NextResponse.json({
      mode,
      generatedAt: now,
      usedSources: sources.usedSources,
      brief,
      preparationAiBrief,
      sourceFingerprint,
      retryAttempted: isolationRetryAttempted,
    });
  } catch (error) {
    logPreparationBoundary("PREPARATION_AI_REQUEST_FAILED", {
      relationshipId,
      conversationId,
      mode,
      reason: error instanceof Error ? error.message : "generation_failed",
    });
    await markIntelligenceError(supabase, {
      conversationId,
      relationshipId,
      coachId,
      mode,
      errorCode: "PREPARATION_AI_REQUEST_FAILED",
    }).catch(() => undefined);

    return failureResponse("PREPARATION_AI_REQUEST_FAILED", 502);
  }
}

async function markIntelligenceError(
  supabase: SupabaseClient,
  input: {
    conversationId: string;
    relationshipId: string;
    coachId: string;
    mode: "assisted" | "comprehensive";
    errorCode: string;
  }
) {
  // Best-effort — may no-op when intelligence_* columns are not migrated yet.
  await updateSessionWithSchemaFallback(
    supabase,
    {
      conversationId: input.conversationId,
      relationshipId: input.relationshipId,
      coachId: input.coachId,
    },
    {
      intelligence_mode: input.mode,
      intelligence_status: "error",
      intelligence_error_code: input.errorCode,
      updated_at: new Date().toISOString(),
    }
  );
}
