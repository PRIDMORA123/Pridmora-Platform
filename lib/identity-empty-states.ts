export const IDENTITY_EMPTY_STATES = {
  noEvidence: {
    title: "Evidence still emerging",
    description:
      "Further reviewed coaching evidence will help establish a clearer development picture.",
  },

  noCommitments: {
    title: "No open commitments",
    description: "Agreed actions will appear here when they are created.",
  },

  noInsights: {
    title: "Insights still emerging",
    description:
      "Reviewed insights will appear as the coaching relationship develops.",
  },

  noSummary: {
    title: "No summary generated yet",
    description:
      "Generate a draft after the conversation and reflection are complete.",
  },

  noActions: {
    title: "No actions linked to this conversation",
    description: "Add a commitment when a clear next step has been agreed.",
  },

  noDevelopment: {
    title: "The development story is still forming",
    description:
      "Meaningful development evidence will appear after coaching conversations, reflections and commitments have been reviewed.",
  },
} as const;
