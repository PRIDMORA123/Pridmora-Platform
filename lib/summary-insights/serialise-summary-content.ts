import { packQualificationAndComprehensive } from "@/lib/summary-insights/comprehensive-pack";
import { normaliseSummaryContent } from "@/lib/summary-insights/normalise-summary-content";
import type { SummaryInsightsContent } from "@/lib/summary-insights/types";
import type { Session } from "@/lib/types";

function serialiseInsightItems(
  items: SummaryInsightsContent["keyInsights"]
): string {
  return items
    .map(item => {
      const title = item.title.trim();
      const description = item.description.trim();
      if (!title && !description) return "";
      if (!title) return description;
      if (!description) return title;
      return `${title}: ${description}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function serialiseList(items: string[]): string {
  return items
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => `- ${item}`)
    .join("\n");
}

export type SummarySessionFields = {
  summary: string;
  emergingThemes: string;
  strengthsObserved: string;
  valuesBecomingVisible: string;
  professionalIdentityDevelopment: string;
  agreedActions: string;
  suggestedFocus: string;
  outcomes: string;
  coachReflection: string;
};

/**
 * Persist structured display content into existing session text columns.
 * Storage remains human-readable for historical compatibility.
 */
export function serialiseSummaryContent(
  content: SummaryInsightsContent
): SummarySessionFields {
  const development = serialiseInsightItems(content.developmentEvidence);
  const packedQualification = packQualificationAndComprehensive({
    qualification: content.evidenceQualification,
    comprehensive:
      content.depthMode === "comprehensive" ? content.comprehensive : null,
  });
  const professionalIdentityDevelopment = [development, packedQualification]
    .filter(Boolean)
    .join("\n\n");

  const suggestedFocus = serialiseList(content.possibleNextFocus);
  const agreedActions = serialiseList(content.commitments);

  return {
    summary: content.sessionSummary?.trim() || "",
    emergingThemes: serialiseInsightItems(content.keyInsights),
    strengthsObserved: serialiseInsightItems(content.strengths),
    valuesBecomingVisible: content.coachingContext?.trim() || "",
    professionalIdentityDevelopment,
    agreedActions,
    suggestedFocus,
    outcomes: suggestedFocus,
    coachReflection: packedQualification,
  };
}

export function contentFromSession(
  session: Pick<
    Session,
    | "summary"
    | "emergingThemes"
    | "strengthsObserved"
    | "valuesBecomingVisible"
    | "professionalIdentityDevelopment"
    | "agreedActions"
    | "commitments"
    | "suggestedFocus"
    | "outcomes"
    | "coachReflection"
  >
): SummaryInsightsContent {
  return normaliseSummaryContent({
    summary: session.summary,
    emergingThemes: session.emergingThemes,
    strengthsObserved: session.strengthsObserved,
    valuesBecomingVisible: session.valuesBecomingVisible,
    professionalIdentityDevelopment: session.professionalIdentityDevelopment,
    agreedActions: session.agreedActions,
    commitments: session.commitments,
    suggestedFocus: session.suggestedFocus,
    outcomes: session.outcomes,
    coachReflection: session.coachReflection,
  });
}

export function applySummaryContentToSession<T extends Partial<Session>>(
  session: T,
  content: SummaryInsightsContent
): T & SummarySessionFields {
  const fields = serialiseSummaryContent(content);
  return {
    ...session,
    ...fields,
    commitments: fields.agreedActions,
  };
}
