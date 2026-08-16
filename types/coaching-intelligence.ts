export type CoachingIntelligenceMode =
  | "manual"
  | "assisted"
  | "comprehensive";

export type IntelligenceSource =
  | "previous_conversations"
  | "approved_summaries"
  | "open_commitments"
  | "approved_reflections"
  | "journey_evidence"
  | "development_themes"
  | "approved_reports"
  | "authorised_development_evidence";

export type CoachingIntelligenceSettings = {
  mode: CoachingIntelligenceMode;
  updatedAt?: string | null;
};

export type CoachingIntelligenceStatus =
  | "idle"
  | "preparing"
  | "ready"
  | "error";

export type CoachingIntelligenceViewModel = {
  mode: CoachingIntelligenceMode;
  status: CoachingIntelligenceStatus;
  availableSources: IntelligenceSource[];
  usedSources: IntelligenceSource[];
  lastRefreshedAt?: string | null;
  generatedForConversationId?: string | null;
};

export type GeneratedPreparationBrief = {
  previousConversation?: string | null;
  outstandingActions: string[];
  possibleFocus?: string | null;
  purposeSuggestion?: string | null;
  topicsToExplore: string[];
  suggestedQuestions: string[];
  desiredOutcomeSuggestion?: string | null;
  coachingGuidance?: {
    framework?: string | null;
    considerations: string[];
  } | null;
};

export type PreparationState = {
  coachEntered: {
    purpose: string;
    topics: string;
    questions: string;
    desiredOutcome: string;
    privateNotes: string;
  };
  generated: GeneratedPreparationBrief;
};
