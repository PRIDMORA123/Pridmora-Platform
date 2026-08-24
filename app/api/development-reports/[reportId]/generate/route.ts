import OpenAI from "openai";
import { NextResponse } from "next/server";
import { IDENTITY_SYSTEM_PROMPT } from "@/lib/ai/identity-system-prompt";
import { DEVELOPMENT_REPORT_TASK_PROMPT } from "@/lib/ai/development-report-prompt";
import { notFoundOrForbidden } from "@/lib/auth/session";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";
import { developmentReportErrorResponse } from "@/lib/reports/errors";
import { parseDevelopmentReportAiDraft } from "@/lib/reports/parse-ai-draft";
import {
  getDevelopmentReport,
  updateDraftDevelopmentReport,
} from "@/lib/reports/repository";
import {
  containsUnexpectedPersonName,
} from "@/lib/relationship-scope";
import { createPersonLevelResponse } from "@/lib/ai/person-level-openai";
import { knownIdentitiesFromPublicClient } from "@/lib/ai/minimise-for-external";
import { buildRelationshipAiContext } from "@/lib/relationship-identity";
import { REPORT_TYPE_LABELS, type ReportEvidenceItem } from "@/lib/reports/types";

type Params = { params: Promise<{ reportId: string }> };

export async function POST(request: Request, { params }: Params) {
  const org = await requireOrganisationContext();
  if (!org.ok) return org.response;

  const { reportId } = await params;

  try {
    const existing = await getDevelopmentReport(
      org.context.supabase,
      org.context.coachId,
      reportId
    );
    if (!existing) return notFoundOrForbidden();

    const access = await requireAssignedPersonInOrganisation({
      clientId: existing.relationshipId,
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

    if (existing.status === "approved") {
      return NextResponse.json(
        {
          error:
            "Approved reports are immutable. Create a new draft version to regenerate.",
        },
        { status: 409 }
      );
    }

    const body = (await request.json()) as {
      evidenceItems?: ReportEvidenceItem[];
      coachingPurpose?: string | null;
      commitments?: Array<{ statement: string; status: string }>;
    };

    const evidenceItems = Array.isArray(body.evidenceItems)
      ? body.evidenceItems
      : existing.evidenceItems;

    if (evidenceItems.length === 0) {
      return NextResponse.json(
        { error: "Select approved evidence before generating a draft." },
        { status: 400 }
      );
    }

    // Persist selected evidence snapshot before generation.
    await updateDraftDevelopmentReport(
      access.context.supabase,
      access.context.coachId,
      reportId,
      {
        evidenceItems,
        coachingPurpose:
          body.coachingPurpose !== undefined
            ? body.coachingPurpose
            : existing.coachingPurpose,
        commitments: Array.isArray(body.commitments)
          ? body.commitments.map((item, index) => ({
              id: `commitment-${index}`,
              statement: item.statement,
              status:
                item.status === "in_progress" ? "in_progress" : "completed",
            }))
          : existing.commitments,
      }
    );

    const { data: person } = await access.context.supabase
      .from("clients")
      .select(
        "name, identity_mode, display_label, confidential_reference, ai_name_allowed, organisation, role"
      )
      .eq("id", existing.relationshipId)
      .eq("coach_id", access.context.coachId)
      .maybeSingle();

    const personAiContext = person
      ? buildRelationshipAiContext({
          name: String(person.name ?? ""),
          organisation: person.organisation ? String(person.organisation) : "",
          role: person.role ? String(person.role) : "",
          identityMode: person.identity_mode,
          displayLabel: person.display_label,
          confidentialReference: person.confidential_reference,
          aiNameAllowed: person.ai_name_allowed,
        })
      : null;
    const coacheeName = personAiContext?.aiDisplayName ?? "";
    const { data: otherClients } = await access.context.supabase
      .from("clients")
      .select("name")
      .eq("coach_id", access.context.coachId)
      .neq("id", existing.relationshipId);
    const knownOtherNames = (otherClients ?? []).map(row => String(row.name ?? ""));

    const evidenceBlock = evidenceItems
      .map(
        (item, index) =>
          `${index + 1}. Area: ${item.developmentArea}\nSource: ${item.sourceType}\nEvidence: ${item.evidence}`
      )
      .join("\n\n");

    const input = [
      DEVELOPMENT_REPORT_TASK_PROMPT,
      "",
      `coacheeName: ${coacheeName}`,
      `Report type: ${REPORT_TYPE_LABELS[existing.type]}`,
      `Audience: ${existing.audience}`,
      `Reporting period: ${existing.reportingPeriodStart ?? "not set"} to ${existing.reportingPeriodEnd ?? "not set"}`,
      `Title: ${existing.title}`,
      "",
      "Selected approved evidence:",
      evidenceBlock,
    ].join("\n");

    const openai = new OpenAI({ apiKey });
    const response = await createPersonLevelResponse(
      openai,
      {
        model: "gpt-5.5",
        instructions: IDENTITY_SYSTEM_PROMPT,
        input,
      },
      knownIdentitiesFromPublicClient(
        {
          name: person ? String(person.name ?? "") : "",
          displayLabel: person?.display_label
            ? String(person.display_label)
            : null,
          organisation: person?.organisation
            ? String(person.organisation)
            : null,
          role: person?.role ? String(person.role) : null,
          identityMode: person?.identity_mode
            ? String(person.identity_mode)
            : null,
          aiNameAllowed: Boolean(person?.ai_name_allowed),
        },
        { otherPersonNames: knownOtherNames }
      )
    );

    const raw =
      typeof response.output_text === "string" ? response.output_text : "";

    if (
      personAiContext?.allowedClientName &&
      containsUnexpectedPersonName(
        raw,
        personAiContext.allowedClientName,
        knownOtherNames
      )
    ) {
      console.error(
        "[relationship-isolation] Report draft named unexpected person",
        { relationshipId: existing.relationshipId }
      );
      return NextResponse.json(
        { error: "Generated report draft failed relationship isolation checks." },
        { status: 422 }
      );
    }

    const parsed = parseDevelopmentReportAiDraft(raw);

    const developmentThemes = parsed.developmentThemes.map((theme, index) => ({
      id: `theme-${index + 1}`,
      title: theme.title,
      summary: theme.summary,
    }));

    const report = await updateDraftDevelopmentReport(
      access.context.supabase,
      access.context.coachId,
      reportId,
      {
        executiveSummary: parsed.executiveSummary || null,
        progressSummary: parsed.progressSummary || null,
        developmentThemes,
        futurePriorities: parsed.futurePriorities,
      }
    );

    return NextResponse.json({ report, draftNotice: true });
  } catch (error) {
    return developmentReportErrorResponse(
      error,
      "Unable to generate the report draft."
    );
  }
}
