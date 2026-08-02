export type SessionStatus =
  | "prepared"
  | "not_started"
  | "in_progress"
  | "paused"
  | "completed";

export type SaveState =
  | "idle"
  | "unsaved"
  | "saving"
  | "saved"
  | "error";

export type CoachingCommitment = {
  id: string;
  text: string;
  status: "open" | "completed";
};

export type SuggestedQuestion = {
  id: string;
  text: string;
  category?: string;
};

export type CoachWorkspaceViewModel = {
  relationshipId: string;
  conversationId: string;

  client: {
    name: string;
    role?: string | null;
    organisation?: string | null;
  };

  conversation: {
    title: string;
    sequenceLabel?: string | null;
    date?: string | null;
    focus?: string | null;
    status: SessionStatus;
    notes: string;
    elapsedSeconds: number;
    timerStartedAt?: string | null;
  };

  context: {
    commitments: CoachingCommitment[];
    insights: string[];
    suggestedQuestions: SuggestedQuestion[];
  };
};

export type CoachingSupportAction =
  | "suggest_question"
  | "identify_themes"
  | "draft_summary"
  | "reflection_prompt";

export type CoachingSupportResult = {
  action: CoachingSupportAction;
  title: string;
  content: string;
};
