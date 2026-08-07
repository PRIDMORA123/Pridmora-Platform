export type SummaryInsightItem = {
  title: string;
  description: string;
};

/** Longitudinal extras only populated in Comprehensive depth. */
export type SummaryInsightsComprehensiveExtras = {
  developmentTrajectory?: string | null;
  behaviouralPatterns?: SummaryInsightItem[];
  evidenceConfidenceNote?: string | null;
  evidenceCoverageNote?: string | null;
  contradictoryOrLimitedEvidence?: string[];
  developmentRisks?: string[];
  recommendedNextConversation?: string | null;
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
  /** standard = everyday manager view; comprehensive = longitudinal depth */
  depthMode?: "standard" | "comprehensive";
  comprehensive?: SummaryInsightsComprehensiveExtras | null;
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
  depthMode: "standard",
  comprehensive: null,
};

export const SUMMARY_INSIGHTS_LIMITS = {
  keyInsights: 3,
  strengths: 3,
  developmentEvidence: 3,
  commitments: 4,
  possibleNextFocus: 3,
  descriptionWords: 55,
  sessionSummaryWordsStandard: 150,
  sessionSummaryWordsComprehensive: 220,
  behaviouralPatterns: 4,
  developmentRisks: 3,
  contradictoryOrLimitedEvidence: 3,
} as const;

export const SUMMARY_SECTION_PURPOSE = {
  sessionSummary: "What happened and what mattered?",
  keyInsights: "What did we learn?",
  strengths: "What positive management behaviour was actually demonstrated?",
  developmentEvidence: "What observable change demonstrates development?",
  coachingContext: "What should matter when the manager next works with this person?",
  commitments: "What was explicitly agreed?",
  possibleNextFocus: "What would be useful to explore next?",
} as const;

export const COMPREHENSIVE_MARKER = "[[pridmora_comprehensive]]";
