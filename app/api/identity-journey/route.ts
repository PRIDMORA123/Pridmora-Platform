import OpenAI from "openai";
import { NextResponse } from "next/server";
import { IDENTITY_SYSTEM_PROMPT } from "@/lib/ai/identity-system-prompt";
import { IDENTITY_JOURNEY_TASK_PROMPT } from "@/lib/ai/identity-journey-prompt";
import { notFoundOrForbidden } from "@/lib/auth/session";
import {
  IDENTITY_PREFIX,
  POSSIBLE_OBSERVATION_PREFIX,
  type JourneyAiEvidence,
} from "@/lib/journey";
import { cleanJourneyLanguage } from "@/lib/journey/clean-journey-language";
import { getApprovedRelationshipEvidence } from "@/lib/journey/load-journey-view-model";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";
import {
  assertRelationshipOwnership,
  validateGeneratedJourney,
} from "@/lib/relationship-scope";
import { createPersonLevelResponse } from "@/lib/ai/person-level-openai";
import { knownIdentitiesFromPublicClient } from "@/lib/ai/minimise-for-external";
import { buildRelationshipAiContext } from "@/lib/relationship-identity";
import { isUuid } from "@/lib/uuid";

type IdentityJourneyRequest = {
  clientId?: string;
  relationshipId?: string;
  clientName?: string;
  evidence?: JourneyAiEvidence[];
};

export type IdentityJourneyAiResponse = {
  currentProfessionalIdentity: string | null;
  coachInsights: string[];
};

function parseJourneyAiOutput(raw: string): IdentityJourneyAiResponse {
  const text = raw.trim();
  if (!text) {
    return { currentProfessionalIdentity: null, coachInsights: [] };
  }

  const insights: string[] = [];
  const insightBlocks = text.split(/(?=Possible observation:)/i);

  for (const block of insightBlocks) {
    const trimmed = block.trim();
    if (!/^Possible observation:/i.test(trimmed)) continue;
    const body = trimmed.replace(/^Possible observation:\s*/i, "").trim();
    if (!body) continue;
    insights.push(`${POSSIBLE_OBSERVATION_PREFIX}\n${body.split(/\n/)[0]?.trim() || body}`);
    if (insights.length >= 3) break;
  }

  let identitySection = text;
  const insightsIndex = text.search(/Possible observation:/i);
  if (insightsIndex >= 0) {
    identitySection = text.slice(0, insightsIndex).trim();
  }

  identitySection = identitySection
    .replace(/^1\.\s*Current Professional Identity\s*/i, "")
    .replace(/^Current Professional Identity\s*/i, "")
    .replace(/^2\.\s*Coach Insights\s*/i, "")
    .trim();

  let currentProfessionalIdentity = identitySection || null;
  if (currentProfessionalIdentity && !currentProfessionalIdentity.startsWith(IDENTITY_PREFIX)) {
    currentProfessionalIdentity = `${IDENTITY_PREFIX} ${currentProfessionalIdentity}`;
  }

  return {
    currentProfessionalIdentity: cleanJourneyLanguage(currentProfessionalIdentity) || null,
    coachInsights: insights.map(insight => cleanJourneyLanguage(insight)),
  };
}

export async function POST(request: Request) {
  let body: IdentityJourneyRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const relationshipId = (body.relationshipId ?? body.clientId)?.trim();
  if (!relationshipId || !isUuid(relationshipId)) {
    return NextResponse.json(
      { error: "relationshipId is required." },
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
      { error: "OpenAI API key is not configured." },
      { status: 500 }
    );
  }

  const coachId = access.context.coachId;
  const supabase = access.context.supabase;

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select(
      "id, name, identity_mode, display_label, confidential_reference, ai_name_allowed, organisation, role"
    )
    .eq("id", relationshipId)
    .eq("coach_id", coachId)
    .maybeSingle();

  if (clientError || !client) {
    return notFoundOrForbidden();
  }

  const scopedEvidence = await getApprovedRelationshipEvidence(supabase, {
    coachId,
    relationshipId,
  });

  try {
    assertRelationshipOwnership(relationshipId, scopedEvidence);
  } catch {
    console.error("[relationship-isolation] Journey AI evidence ownership failed", {
      relationshipId,
    });
    return NextResponse.json(
      { error: "Unable to confirm relationship-scoped evidence." },
      { status: 409 }
    );
  }

  if (scopedEvidence.length < 2) {
    return NextResponse.json(
      { error: "At least two approved sessions are required." },
      { status: 400 }
    );
  }

  const hasUsefulEvidence = scopedEvidence.some(item => item.summary || item.focus);
  if (!hasUsefulEvidence) {
    return NextResponse.json(
      { error: "Approved sessions do not yet contain coaching evidence for the Journey." },
      { status: 400 }
    );
  }

  const { data: otherClients } = await supabase
    .from("clients")
    .select("name")
    .eq("coach_id", coachId)
    .neq("id", relationshipId);

  const knownOtherNames = (otherClients ?? []).map(row => String(row.name ?? ""));
  const aiContext = buildRelationshipAiContext({
    name: String(client.name ?? ""),
    organisation: client.organisation ? String(client.organisation) : "",
    role: client.role ? String(client.role) : "",
    identityMode: client.identity_mode,
    displayLabel: client.display_label,
    confidentialReference: client.confidential_reference,
    aiNameAllowed: client.ai_name_allowed,
  });
  const coacheeName = aiContext.aiDisplayName;
  const openai = new OpenAI({ apiKey });

  const evidenceBlock = scopedEvidence
    .map((item, index) =>
      [
        `Conversation ${index + 1}`,
        item.focus ? `Focus: ${item.focus}` : null,
        item.summary ? `Approved summary: ${item.summary}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");

  const input = [
    IDENTITY_JOURNEY_TASK_PROMPT,
    "",
    `coacheeName: ${coacheeName}`,
    "",
    "Approved session evidence:",
    evidenceBlock,
  ].join("\n");

  try {
    const response = await createPersonLevelResponse(
      openai,
      {
        model: "gpt-5.5",
        instructions: IDENTITY_SYSTEM_PROMPT,
        input,
      },
      knownIdentitiesFromPublicClient(
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
      )
    );

    const raw = response.output_text?.trim();
    if (!raw) {
      return NextResponse.json(
        { error: "No Journey narrative was generated." },
        { status: 502 }
      );
    }

    const nameCheck = validateGeneratedJourney({
      coacheeName: aiContext.allowedClientName,
      text: raw,
      knownOtherNames,
    });
    if (!nameCheck.valid) {
      console.error("[relationship-isolation] Journey AI named unexpected person", {
        relationshipId,
        reason: nameCheck.reason,
      });
      return NextResponse.json(
        { error: "Generated Journey narrative failed relationship isolation checks." },
        { status: 422 }
      );
    }

    const parsed = parseJourneyAiOutput(raw);
    return NextResponse.json(parsed satisfies IdentityJourneyAiResponse);
  } catch (error) {
    console.error("OpenAI identity journey error:", error);
    return NextResponse.json(
      { error: "Failed to generate Journey narrative. Please try again." },
      { status: 500 }
    );
  }
}
