import type { SummaryStatus } from "@/lib/types";

export type SummaryFields = {
  sessionSummary: string;
  keyThemes: string;
  outcomes: string;
  agreedActions: string;
  strengthsObserved?: string;
  coachingContext?: string;
  developmentEvidence?: string;
  suggestedFocus?: string;
  evidenceQualification?: string;
};

export type SummaryWorkspaceViewModel = {
  relationshipId: string;
  conversationId: string;
  clientName: string;
  status: SummaryStatus;
  summary: SummaryFields;
};
