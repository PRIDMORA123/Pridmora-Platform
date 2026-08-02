export type ReflectionStatus = "draft" | "completed";

export type ReflectionWorkspaceViewModel = {
  relationshipId: string;
  conversationId: string;
  clientName: string;
  conversationTitle: string;
  date?: string | null;
  status: ReflectionStatus;

  reflection: {
    whatHappened: string;
    whatStoodOut: string;
    whatItMightMean: string;
    carryForward: string;
    privateNotes: string;
  };

  context: {
    sessionFocus?: string | null;
    coachNoteExtracts: string[];
    commitments: string[];
  };
};
