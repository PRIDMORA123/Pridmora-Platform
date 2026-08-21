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
    label: "Human-led",
    shortDescription:
      "Work primarily from the development record and invoke Aurelia when you choose.",
    fullDescription: `${BRAND.intelligenceName} keeps the workspace and saved development record available. Aurelia does not analyse records or generate suggestions until you ask.`,
    sources: [],
    outputs: [],
    aiEnabled: false,
  },

  assisted: {
    label: "AI-light",
    shortDescription:
      "Aurelia remains available but is less prominent and less proactive.",
    fullDescription: `${BRAND.intelligenceName} reviews the previous conversation, approved summary and open commitments to suggest a concise focus and useful questions when helpful — without dominating the development record.`,
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
    label: "AI-supported",
    shortDescription:
      "Aurelia actively surfaces useful patterns and suggestions from authorised evidence.",
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
