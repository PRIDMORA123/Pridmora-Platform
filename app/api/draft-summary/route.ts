import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  buildDraftSummaryInput,
  buildDraftSummaryInstructions,
  type DraftSummaryDepthMode,
} from "@/lib/ai/draft-summary-prompt";
import { createPersonLevelResponse } from "@/lib/ai/person-level-openai";
import {
  cleanDerivedAiValue,
  knownIdentitiesFromPublicClient,
} from "@/lib/ai/minimise-for-external";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";
import { parseDraftSummary } from "@/lib/sessions";
import {
  parseSummaryInsightsFromModel,
  summaryContentToStructuredSections,
} from "@/lib/summary-insights/parse-summary-json";
import {
  applyExplicitCommitmentSafeguard,
  applyExplicitCommitmentSafeguardToAgreedActionsText,
} from "@/lib/summary-insights/recover-explicit-commitments";

type DraftSummaryRequest = {
  notes?: string;
  focus?: string;
  preparation?: string;
  clientName?: string;
  clientId?: string;
  sessionId?: string;
  organisationId?: string;
  depthMode?: DraftSummaryDepthMode | "assisted" | "manual" | "comprehensive";
};

function resolveDepthMode(
  value: DraftSummaryRequest["depthMode"]
): DraftSummaryDepthMode {
  if (value === "comprehensive") return "comprehensive";
  return "standard";
}

export async function POST(request: Request) {
  let body: DraftSummaryRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const access = await requireAssignedPersonInOrganisation({
    clientId: body.clientId,
    bodyOrganisationId: body.organisationId,
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

  const { notes } = body;

  if (!notes?.trim()) {
    return NextResponse.json(
      { error: "Add session notes before drafting a summary." },
      { status: 400 }
    );
  }

  const depthMode = resolveDepthMode(body.depthMode);
  const openai = new OpenAI({ apiKey });

  const { data: publicClient } = await access.context.supabase
    .from("clients")
    .select(
      "name, identity_mode, display_label, organisation, role, ai_name_allowed"
    )
    .eq("id", access.clientId)
    .maybeSingle();
  const identities = knownIdentitiesFromPublicClient({
    name: publicClient?.name ? String(publicClient.name) : "",
    displayLabel: publicClient?.display_label
      ? String(publicClient.display_label)
      : null,
    organisation: publicClient?.organisation
      ? String(publicClient.organisation)
      : null,
    role: publicClient?.role ? String(publicClient.role) : null,
    identityMode: publicClient?.identity_mode
      ? String(publicClient.identity_mode)
      : "standard",
    aiNameAllowed: Boolean(publicClient?.ai_name_allowed),
  });

  try {
    const response = await createPersonLevelResponse(
      openai,
      {
        model: "gpt-5.5",
        instructions: buildDraftSummaryInstructions(depthMode),
        input: buildDraftSummaryInput(notes, depthMode),
      },
      identities
    );

    const rawDraft = response.output_text?.trim();
    if (!rawDraft) {
      return NextResponse.json(
        { error: "No summary was generated." },
        { status: 502 }
      );
    }

    let structuredContent = parseSummaryInsightsFromModel(rawDraft);
    if (structuredContent) {
      structuredContent = applyExplicitCommitmentSafeguard(
        structuredContent,
        notes
      );
      structuredContent = cleanDerivedAiValue(
        structuredContent,
        response.mapping
      );
      structuredContent.depthMode = depthMode;
      if (depthMode === "standard") {
        structuredContent.comprehensive = null;
      }
    }

    const sections = structuredContent
      ? summaryContentToStructuredSections(structuredContent)
      : (() => {
          const legacy = parseDraftSummary(rawDraft);
          return {
            ...legacy,
            agreedActions: applyExplicitCommitmentSafeguardToAgreedActionsText(
              legacy.agreedActions,
              notes
            ),
          };
        })();
    const cleanedSections = cleanDerivedAiValue(sections, response.mapping);

    return NextResponse.json({
      summary: cleanedSections.aiDraftSummary || rawDraft,
      sections: cleanedSections,
      structuredContent,
      rawDraft: cleanDerivedAiValue(rawDraft, response.mapping),
      depthMode,
    });
  } catch (error) {
    console.error("OpenAI draft summary error:", error);
    return NextResponse.json(
      { error: "Failed to generate summary. Please try again." },
      { status: 500 }
    );
  }
}
