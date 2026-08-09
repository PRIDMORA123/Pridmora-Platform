import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  buildDraftSummaryInput,
  buildDraftSummaryInstructions,
  type DraftSummaryDepthMode,
} from "@/lib/ai/draft-summary-prompt";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";
import { parseDraftSummary } from "@/lib/sessions";
import {
  parseSummaryInsightsFromModel,
  summaryContentToStructuredSections,
} from "@/lib/summary-insights/parse-summary-json";

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

  try {
    const response = await openai.responses.create({
      model: "gpt-5.5",
      instructions: buildDraftSummaryInstructions(depthMode),
      input: buildDraftSummaryInput(notes, depthMode),
    });

    const rawDraft = response.output_text?.trim();
    if (!rawDraft) {
      return NextResponse.json(
        { error: "No summary was generated." },
        { status: 502 }
      );
    }

    const structuredContent = parseSummaryInsightsFromModel(rawDraft);
    if (structuredContent) {
      structuredContent.depthMode = depthMode;
      if (depthMode === "standard") {
        structuredContent.comprehensive = null;
      }
    }

    const sections = structuredContent
      ? summaryContentToStructuredSections(structuredContent)
      : parseDraftSummary(rawDraft);

    return NextResponse.json({
      summary: sections.aiDraftSummary || rawDraft,
      sections,
      structuredContent,
      rawDraft,
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
