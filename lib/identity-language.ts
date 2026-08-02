/**
 * Central Identity product language — user-facing labels and messages.
 * Prefer these over ad-hoc software terminology in the UI.
 */

export const identityLanguage = {
  relationship: {
    singular: "coaching relationship",
    plural: "coaching relationships",
  },

  conversation: {
    singular: "development conversation",
    plural: "development conversations",
  },

  preparation: {
    title: "Preparation Brief",
    update: "Update Preparation Brief",
    confirm: "Confirm Preparation",
  },

  reflection: {
    title: "Reflection",
    complete: "Complete Reflection",
  },

  development: {
    picture: "Current Development Picture",
    update: "Development Update",
    direction: "Development Direction",
  },
} as const;

export const coachingStageLabels = {
  relationshipCreated: "Coaching relationship established",
  purposeRequired: "Coaching purpose to be agreed",
  readyForPreparation: "Ready for preparation",
  preparationInProgress: "Preparation in progress",
  readyForConversation: "Ready for development conversation",
  conversationInProgress: "Development conversation in progress",
  readyForReflection: "Ready for reflection",
  reflectionInProgress: "Reflection in progress",
  developmentUpdateAvailable: "Development update available",
  betweenConversations: "Reflecting between conversations",
  relationshipComplete: "Coaching relationship complete",
} as const;

export const identityMessages = {
  personCreated: "Coaching relationship created.",
  purposeSaved: "Coaching purpose saved.",
  preparationSaved: "Preparation saved.",
  preparationUpdated:
    "Preparation Brief updated with the latest approved information.",
  preparationConfirmed: "Preparation confirmed.",
  conversationCompleted:
    "Development conversation completed. Reflection can now begin.",
  reflectionSaved: "Reflection saved.",
  reflectionCompleted:
    "Reflection captured. The coaching journey continues.",
  developmentApplied:
    "Development Update applied to the coaching journey.",
  preferenceSaved: "Coaching intelligence preference saved.",
} as const;

export const identityEmptyStates = {
  noRelationships: {
    title: "Begin your first coaching relationship.",
    description:
      "Add the person you will be coaching and establish the purpose of the work.",
  },
  noPreparation: {
    title: "Preparation begins when you are ready to think ahead.",
    description:
      "Create a brief using the latest approved coaching information.",
  },
  noPreviousConversation: {
    title: "This will be the first development conversation in this coaching relationship.",
    description: "",
  },
  noDevelopmentEvidence: {
    title: "The development story is still forming",
    description:
      "Meaningful development evidence will appear after coaching conversations, reflections and commitments have been reviewed.",
  },
  noCommitments: {
    title: "No open commitments",
    description: "Agreed actions will appear here when they are created.",
  },
  noCoachNotes: {
    title: "Capture observations that may support the next development conversation.",
    description: "",
  },
  noRecentDevelopment: {
    title: "Meaningful development changes will appear here as evidence is reviewed and applied.",
    description: "",
  },
  noEvidence: {
    title: "Evidence still emerging",
    description:
      "Further reviewed coaching evidence will help establish a clearer development picture.",
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

export const identityErrorMessages = {
  loadFailure: {
    title: "We could not load this information.",
    description:
      "Please try again. Your saved coaching information has not been changed.",
  },
  preparationUnavailable: {
    title: "Preparation support is temporarily unavailable.",
    description:
      "Your client information and coach notes remain available below.",
  },
  saveFailure: {
    title: "Your changes could not be saved.",
    description: "Please try again before leaving this page.",
  },
  unsavedChanges: "You have unsaved coaching information. Leave without saving?",
} as const;
