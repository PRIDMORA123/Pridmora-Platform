import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  buildPatternRecognitionInput,
  formatEvidenceCatalogue,
  PATTERN_RECOGNITION_SYSTEM_PROMPT,
} from "@/lib/ai/pattern-recognition-prompt";
import { notFoundOrForbidden } from "@/lib/auth/session";
import { listCoachingMoments } from "@/lib/coaching-moments/repository";
import { developmentUpdateErrorResponse } from "@/lib/development-updates/api-response";
import {
  ensureProfileOrEmpty,
  saveCoachingPatterns,
} from "@/lib/development-updates/repository";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";
import { collectPatternEvidenceFromRelationship } from "@/lib/patterns/collect";
import {
  generateRelationshipPatterns,
  relationshipEvidenceFingerprint,
  shouldRegeneratePatterns,
} from "@/lib/patterns/generate";
import { parsePatternCandidatesFromModel } from "@/lib/patterns/schema";
import { parseSupportingContext } from "@/lib/relationship-meta";
import { assertRelationshipOwnership } from "@/lib/relationship-scope";
import { buildRelationshipAiContext } from "@/lib/relationship-identity";
import { rowToSession } from "@/lib/supabase/map";

type GenerateRequest = {
  clientId?: string;
  organisationId?: string;
  force?: boolean;
  /** When true, skip OpenAI and use deterministic continuity detection only. */
  deterministicOnly?: boolean;
};

/**
 * Idempotent longitudinal pattern analysis for one relationship.
 * Runs after summary approval, supporting-context changes, or deliberate refresh.
 * Does not run on page view.
 */
export async function POST(request: Request) {
  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const access = await requireAssignedPersonInOrganisation({
    clientId: body.clientId,
    bodyOrganisationId: body.organisationId,
  });
  if (!access.ok) return access.response;

  const supabase = access.context.supabase;
  const coachId = access.context.coachId;
  const clientId = access.clientId;
  const force = Boolean(body.force);

  try {
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select(
        "id, name, current_focus, supporting_context, identity_mode, display_label, confidential_reference, ai_name_allowed, organisation, role"
      )
      .eq("id", clientId)
      .eq("coach_id", coachId)
      .maybeSingle();

    if (clientError || !client) {
      return notFoundOrForbidden();
    }

    // Production schema uses session_date / session_number — not `date`.
    const { data: sessionRows, error: sessionsError } = await supabase
      .from("sessions")
      .select("*")
      .eq("client_id", clientId)
      .eq("coach_id", coachId)
      .order("session_number", { ascending: true })
      .order("session_date", { ascending: true });

    if (sessionsError) {
      console.error("[patterns] Unable to load relationship sessions", {
        operation: "load_relationship_sessions",
        relationshipId: clientId,
        code: sessionsError.code,
        message: sessionsError.message,
        details: sessionsError.details,
        hint: sessionsError.hint,
      });
      return NextResponse.json(
        { error: "Unable to load relationship sessions." },
        { status: 500 }
      );
    }

    const rows = sessionRows ?? [];
    const sessions = rows.map((row, index) =>
      rowToSession(row as never, index, rows.length)
    );
    const supportingContext = parseSupportingContext(client.supporting_context);
    const coachingMoments = await listCoachingMoments(supabase, {
      clientId,
      coachId,
      limit: 50,
    });
    const profile = await ensureProfileOrEmpty(
      supabase,
      coachId,
      clientId,
      String(client.current_focus ?? "")
    );

    assertRelationshipOwnership(clientId, [profile]);

    const currentFingerprint = relationshipEvidenceFingerprint({
      relationshipId: clientId,
      sessions,
      supportingContext,
      coachingMoments,
    });

    if (
      !shouldRegeneratePatterns({
        force,
        currentFingerprint,
        storedFingerprint: profile.patternsEvidenceFingerprint,
        hasPatterns: profile.coachingPatterns.length > 0,
      })
    ) {
      return NextResponse.json({
        patterns: profile.coachingPatterns,
        message: null,
        regenerated: false,
        evidenceFingerprint: profile.patternsEvidenceFingerprint,
        relationshipId: clientId,
      });
    }

    const points = collectPatternEvidenceFromRelationship({
      relationshipId: clientId,
      sessions,
      supportingContext,
      coachingMoments,
    });

    let candidates = undefined as ReturnType<
      typeof parsePatternCandidatesFromModel
    > | undefined;
    let generationFailed = false;

    const apiKey = process.env.OPENAI_API_KEY;
    const aiEnabled = access.context.organisation.organisation.aiEnabled;
    if (apiKey && aiEnabled && !body.deterministicOnly) {
      try {
        const openai = new OpenAI({ apiKey });
        const existingSummary = profile.coachingPatterns
          .map(pattern => {
            const review =
              pattern.coachAccepted === false
                ? "rejected"
                : pattern.coachAccepted === true
                  ? "accepted"
                  : "unreviewed";
            return `- ${pattern.title} [${review}] (${pattern.strength}, ${pattern.status})`;
          })
          .join("\n");

        const response = await openai.responses.create({
          model: "gpt-5.5",
          instructions: PATTERN_RECOGNITION_SYSTEM_PROMPT,
          input: buildPatternRecognitionInput({
            personName: buildRelationshipAiContext({
              name: String(client.name ?? "Client"),
              organisation: client.organisation
                ? String(client.organisation)
                : "",
              role: client.role ? String(client.role) : "",
              identityMode: client.identity_mode,
              displayLabel: client.display_label,
              confidentialReference: client.confidential_reference,
              aiNameAllowed: client.ai_name_allowed,
            }).aiDisplayName,
            coachingGoal: String(client.current_focus ?? profile.currentFocus ?? ""),
            evidenceCatalogue: formatEvidenceCatalogue(points),
            existingAcceptedPatterns: existingSummary,
          }),
        });

        const text =
          typeof response.output_text === "string" ? response.output_text : "";
        candidates = parsePatternCandidatesFromModel(text);
      } catch (error) {
        console.error("[patterns] AI generation failed; preserving accepted patterns", error);
        generationFailed = true;
      }
    }

    const result = generateRelationshipPatterns({
      relationshipId: clientId,
      sessions,
      supportingContext,
      coachingMoments,
      existingPatterns: profile.coachingPatterns,
      candidates,
      generationFailed,
    });

    if (generationFailed) {
      // Do not overwrite stored accepted patterns with an empty failed run
      return NextResponse.json({
        patterns: result.patterns.length
          ? result.patterns
          : profile.coachingPatterns,
        message: result.message,
        regenerated: false,
        generationFailed: true,
        evidenceFingerprint: profile.patternsEvidenceFingerprint,
        relationshipId: clientId,
      });
    }

    const saved = await saveCoachingPatterns(
      supabase,
      coachId,
      clientId,
      result.patterns,
      result.evidenceFingerprint || currentFingerprint
    );

    return NextResponse.json({
      patterns: saved.coachingPatterns,
      message: result.message,
      regenerated: true,
      evidenceFingerprint: saved.patternsEvidenceFingerprint,
      relationshipId: clientId,
      generatedAt: saved.patternsGeneratedAt,
    });
  } catch (error) {
    return developmentUpdateErrorResponse(
      error,
      "Unable to generate longitudinal patterns."
    );
  }
}
