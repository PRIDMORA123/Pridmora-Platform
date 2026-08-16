import { BRAND } from "@/lib/brand";
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
    fullDescription: `${BRAND.intelligenceName} will provide the preparation workspace and your saved coaching records, but it will not analyse them or generate suggestions.`,
    sources: [],
    outputs: [],
    aiEnabled: false,
  },

  assisted: {
    label: "Standard",
    shortDescription: "Concise insight for everyday management use.",
    fullDescription: `${BRAND.intelligenceName} reviews the previous conversation, approved summary and open commitments to suggest a concise focus and useful questions for everyday management use.`,
    sources: [
      "previous_conversations",
      "approved_summaries",
      "open_commitments",
      "authorised_development_evidence",
    ],
    outputs: [
      "Previous-conversation reminder",
      "Possible development focus",
      "Suggested questions",
    ],
    aiEnabled: true,
  },

  comprehensive: {
    label: "Comprehensive",
    shortDescription:
      "Deeper analysis across development history, evidence and behavioural patterns.",
    fullDescription: `${BRAND.intelligenceName} reviews the wider development record to identify themes, evidence, behavioural patterns, confidence and questions for the next conversation.`,
    sources: [
      "previous_conversations",
      "approved_summaries",
      "open_commitments",
      "approved_reflections",
      "journey_evidence",
      "development_themes",
      "approved_reports",
      "authorised_development_evidence",
    ],
    outputs: [
      "Comprehensive preparation brief",
      "Development trajectory context",
      "Behavioural and capability patterns",
      "Evidence confidence and coverage",
      "Suggested development focus",
      "Contextual questions",
      "Evidence gaps requiring exploration",
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
