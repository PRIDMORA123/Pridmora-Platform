import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  buildDraftSummaryInput,
  DRAFT_SUMMARY_INSTRUCTIONS,
} from "@/lib/ai/draft-summary-prompt";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
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
};

export async function POST(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  if (!auth.context.organisation.organisation.aiEnabled) {
    return NextResponse.json(
      { error: "AI is disabled for this organisation." },
      { status: 403 }
    );
  }

  // Never trust a browser-supplied organisationId.
  // (clientId/sessionId should be validated by calling workflows that persist.)

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key is not configured." },
      { status: 500 }
    );
  }

  let body: DraftSummaryRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { notes } = body;

  if (!notes?.trim()) {
    return NextResponse.json(
      { error: "Add session notes before drafting a summary." },
      { status: 400 }
    );
  }

  const openai = new OpenAI({ apiKey });

  try {
    const response = await openai.responses.create({
      model: "gpt-5.5",
      instructions: DRAFT_SUMMARY_INSTRUCTIONS,
      input: buildDraftSummaryInput(notes),
    });

    const rawDraft = response.output_text?.trim();
    if (!rawDraft) {
      return NextResponse.json(
        { error: "No summary was generated." },
        { status: 502 }
      );
    }

    const structuredContent = parseSummaryInsightsFromModel(rawDraft);
    const sections = structuredContent
      ? summaryContentToStructuredSections(structuredContent)
      : parseDraftSummary(rawDraft);

    return NextResponse.json({
      summary: sections.aiDraftSummary || rawDraft,
      sections,
      structuredContent,
      rawDraft,
    });
  } catch (error) {
    console.error("OpenAI draft summary error:", error);
    return NextResponse.json(
      { error: "Failed to generate summary. Please try again." },
      { status: 500 }
    );
  }
}
