/**
 * Central product language — user-facing labels and messages.
 * Prefer these over ad-hoc software terminology in the UI.
 * Role-specific wording lives in lib/role-language.ts.
 */

export const identityLanguage = {
  relationship: {
    singular: "development relationship",
    plural: "development relationships",
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
  relationshipCreated: "Development relationship established",
  purposeRequired: "Purpose to be agreed",
  readyForPreparation: "Ready for preparation",
  preparationInProgress: "Preparation in progress",
  readyForConversation: "Ready for development conversation",
  conversationInProgress: "Development conversation in progress",
  readyForReflection: "Ready for reflection",
  reflectionInProgress: "Reflection in progress",
  developmentUpdateAvailable: "Development update available",
  betweenConversations: "Reflecting between conversations",
  relationshipComplete: "Development relationship complete",
} as const;

export const identityMessages = {
  personCreated: "Development relationship created.",
  purposeSaved: "Purpose saved.",
  preparationSaved: "Preparation saved.",
  preparationUpdated:
    "Preparation Brief updated with the latest approved information.",
  preparationConfirmed: "Preparation confirmed.",
  conversationCompleted:
    "Development conversation completed. Reflection can now begin.",
  reflectionSaved: "Reflection saved.",
  reflectionCompleted:
    "Reflection captured. The development journey continues.",
  developmentApplied:
    "Development Update applied to the development journey.",
  preferenceSaved: "Development intelligence preference saved.",
} as const;

export const identityEmptyStates = {
  noRelationships: {
    title: "Add the first person you support.",
    description:
      "Create a development relationship and agree the purpose of the work.",
  },
  noPreparation: {
    title: "Preparation begins when you are ready to think ahead.",
    description:
      "Create a brief using the latest approved development information.",
  },
  noPreviousConversation: {
    title: "This will be the first development conversation in this relationship.",
    description: "",
  },
  noDevelopmentEvidence: {
    title: "The development story is still forming",
    description:
      "Meaningful development evidence will appear after conversations, reflections and commitments have been reviewed.",
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
      "Further reviewed development evidence will help establish a clearer picture.",
  },
  noInsights: {
    title: "Insights still emerging",
    description:
      "Reviewed insights will appear as the relationship develops.",
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
      "Meaningful development evidence will appear after conversations, reflections and commitments have been reviewed.",
  },
} as const;

export const identityErrorMessages = {
  loadFailure: {
    title: "We could not load this information.",
    description:
      "Please try again. Your saved information has not been changed.",
  },
  preparationUnavailable: {
    title: "Preparation support is temporarily unavailable.",
    description:
      "Your person information and notes remain available below.",
  },
  saveFailure: {
    title: "Your changes could not be saved.",
    description: "Please try again before leaving this page.",
  },
  unsavedChanges: "You have unsaved information. Leave without saving?",
} as const;
