import OpenAI from "openai";
import { NextResponse } from "next/server";
import { IDENTITY_SYSTEM_PROMPT } from "@/lib/ai/identity-system-prompt";
import { COACHING_REPORT_TASK_PROMPT } from "@/lib/ai/coaching-report-prompt";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  NEXT_FOCUS_PREFIX,
  type CoachingReportAiEvidence,
  type ReportType,
} from "@/lib/coaching-report";

type CoachingReportRequest = {
  clientName?: string;
  reportType?: ReportType;
  reportPeriodLabel?: string;
  evidence?: CoachingReportAiEvidence[];
};

export type CoachingReportAiResponse = {
  coachingContext: string;
  suggestedNextFocus: string[];
};

function parseCoachingReportAiOutput(
  raw: string,
  reportPeriodLabel: string
): CoachingReportAiResponse {
  const text = raw.trim();
  if (!text) {
    return { coachingContext: "", suggestedNextFocus: [] };
  }

  const focusItems: string[] = [];
  const focusBlocks = text.split(/(?=Possible next focus:)/i);

  for (const block of focusBlocks) {
    const trimmed = block.trim();
    if (!/^Possible next focus:/i.test(trimmed)) continue;
    const body = trimmed.replace(/^Possible next focus:\s*/i, "").trim();
    const firstLine = body.split(/\n/)[0]?.trim() || body;
    if (!firstLine) continue;
    focusItems.push(`${NEXT_FOCUS_PREFIX} ${firstLine}`);
    if (focusItems.length >= 3) break;
  }

  let contextSection = text;
  const focusIndex = text.search(/Possible next focus:/i);
  if (focusIndex >= 0) {
    contextSection = text.slice(0, focusIndex).trim();
  }

  contextSection = contextSection
    .replace(/^1\.\s*Coaching Context\s*/i, "")
    .replace(/^Coaching Context\s*/i, "")
    .replace(/^2\.\s*Suggested Next Focus\s*/i, "")
    .trim();

  if (
    contextSection &&
    !contextSection.startsWith("This report summarises the coaching journey recorded between")
  ) {
    contextSection = `This report summarises the coaching journey recorded between ${reportPeriodLabel}. ${contextSection}`;
  }

  return {
    coachingContext: contextSection,
    suggestedNextFocus: focusItems,
  };
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key is not configured." },
      { status: 500 }
    );
  }

  let body: CoachingReportRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const evidence = body.evidence ?? [];
  if (evidence.length < 1) {
    return NextResponse.json(
      { error: "At least one approved session is required." },
      { status: 400 }
    );
  }

  const hasUsefulEvidence = evidence.some(
    item =>
      item.summary ||
      item.professionalIdentityDevelopment ||
      item.strengthsObserved ||
      item.valuesBecomingVisible ||
      item.emergingThemes ||
      item.agreedActions ||
      item.suggestedFocus ||
      item.coachReflection ||
      item.focus
  );

  if (!hasUsefulEvidence) {
    return NextResponse.json(
      { error: "Approved sessions do not yet contain enough coaching evidence for a report." },
      { status: 400 }
    );
  }

  const reportPeriodLabel = body.reportPeriodLabel?.trim() || "the selected period";
  const reportTypeLabel =
    body.reportType === "final" ? "Final Coaching Report" : "Progress Report";

  const openai = new OpenAI({ apiKey });

  const evidenceBlock = evidence
    .map(item => {
      const lines = [
        `Session ${item.sessionNumber}${item.date ? ` (${item.date})` : ""}`,
        item.focus ? `Focus: ${item.focus}` : null,
        item.summary ? `Session summary: ${item.summary}` : null,
        item.professionalIdentityDevelopment
          ? `Professional identity development: ${item.professionalIdentityDevelopment}`
          : null,
        item.strengthsObserved ? `Strengths observed: ${item.strengthsObserved}` : null,
        item.valuesBecomingVisible
          ? `Values becoming visible: ${item.valuesBecomingVisible}`
          : null,
        item.emergingThemes ? `Emerging themes: ${item.emergingThemes}` : null,
        item.agreedActions ? `Agreed actions: ${item.agreedActions}` : null,
        item.suggestedFocus ? `Suggested focus: ${item.suggestedFocus}` : null,
        item.coachReflection ? `Coach reflection: ${item.coachReflection}` : null,
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n\n");

  const input = [
    COACHING_REPORT_TASK_PROMPT,
    "",
    body.clientName ? `Client: ${body.clientName}` : null,
    `Report type: ${reportTypeLabel}`,
    `Report period: ${reportPeriodLabel}`,
    "",
    "Approved session evidence:",
    evidenceBlock,
  ]
    .filter(line => line !== null)
    .join("\n");

  try {
    const response = await openai.responses.create({
      model: "gpt-5.5",
      instructions: IDENTITY_SYSTEM_PROMPT,
      input,
    });

    const raw = response.output_text?.trim();
    if (!raw) {
      return NextResponse.json(
        { error: "No coaching report draft was generated." },
        { status: 502 }
      );
    }

    const parsed = parseCoachingReportAiOutput(raw, reportPeriodLabel);
    return NextResponse.json(parsed satisfies CoachingReportAiResponse);
  } catch (error) {
    console.error("OpenAI coaching report error:", error);
    return NextResponse.json(
      { error: "Failed to generate coaching report draft. Please try again." },
      { status: 500 }
    );
  }
}
