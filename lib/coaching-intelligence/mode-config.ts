import type {
  CoachingIntelligenceMode,
  IntelligenceSource,
} from "@/types/coaching-intelligence";

type ModeConfiguration = {
  label: string;
  shortDescription: string;
  fullDescription: string;
  sources: IntelligenceSource[];
  outputs: string[];
  aiEnabled: boolean;
};

export const COACHING_INTELLIGENCE_MODES: Record<
  CoachingIntelligenceMode,
  ModeConfiguration
> = {
  manual: {
    label: "Manual",
    shortDescription: "Prepare independently without AI-generated guidance.",
    fullDescription:
      "Identity will provide the preparation workspace and your saved coaching records, but it will not analyse them or generate suggestions.",
    sources: [],
    outputs: [],
    aiEnabled: false,
  },

  assisted: {
    label: "Assisted",
    shortDescription:
      "Light support using the latest reviewed coaching information.",
    fullDescription:
      "Identity reviews the previous conversation, approved summary and open commitments to suggest a concise focus and useful questions.",
    sources: [
      "previous_conversations",
      "approved_summaries",
      "open_commitments",
    ],
    outputs: [
      "Previous-conversation reminder",
      "Possible coaching focus",
      "Suggested coaching questions",
    ],
    aiEnabled: true,
  },

  comprehensive: {
    label: "Comprehensive",
    shortDescription:
      "Deeper preparation using the wider reviewed coaching journey.",
    fullDescription:
      "Identity reviews the wider coaching record to identify relevant themes, evidence, commitments and questions for the next conversation.",
    sources: [
      "previous_conversations",
      "approved_summaries",
      "open_commitments",
      "approved_reflections",
      "journey_evidence",
      "development_themes",
      "approved_reports",
    ],
    outputs: [
      "Comprehensive preparation brief",
      "Suggested coaching focus",
      "Contextual coaching questions",
      "Relevant strengths and patterns",
      "Evidence gaps requiring exploration",
      "Useful coaching frameworks",
    ],
    aiEnabled: true,
  },
};

export const COACHING_INTELLIGENCE_MODE_VALUES = [
  "manual",
  "assisted",
  "comprehensive",
] as const satisfies readonly CoachingIntelligenceMode[];

export const DEFAULT_COACHING_INTELLIGENCE_MODE: CoachingIntelligenceMode =
  "assisted";
