export type SummaryInsightItem = {
  title: string;
  description: string;
};

export type SummaryInsightsContent = {
  sessionSummary?: string | null;
  keyInsights: SummaryInsightItem[];
  strengths: SummaryInsightItem[];
  developmentEvidence: SummaryInsightItem[];
  coachingContext?: string | null;
  commitments: string[];
  possibleNextFocus: string[];
  evidenceQualification?: string | null;
};

export const EMPTY_SUMMARY_INSIGHTS_CONTENT: SummaryInsightsContent = {
  sessionSummary: null,
  keyInsights: [],
  strengths: [],
  developmentEvidence: [],
  coachingContext: null,
  commitments: [],
  possibleNextFocus: [],
  evidenceQualification: null,
};

export const SUMMARY_INSIGHTS_LIMITS = {
  keyInsights: 4,
  strengths: 3,
  developmentEvidence: 3,
  commitments: 4,
  possibleNextFocus: 3,
  descriptionWords: 55,
  sessionSummaryWords: 120,
} as const;
