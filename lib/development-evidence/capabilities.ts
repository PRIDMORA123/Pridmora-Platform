/**
 * Canonical Pridmora leadership capability catalogue.
 * Maps to Six Foundations where appropriate. No person scores.
 */

import type { FoundationKey } from "@/lib/organisation-intelligence/constants";
import { SIX_FOUNDATIONS } from "@/lib/organisation-intelligence/constants";

export const PRIDMORA_CAPABILITIES = [
  {
    key: "strategic_thinking",
    label: "Strategic Thinking",
    foundations: ["collaboration_and_alignment"] as const satisfies readonly FoundationKey[],
    related: ["systems_thinking", "decision_making", "stakeholder_influence"],
  },
  {
    key: "delegation",
    label: "Delegation",
    foundations: ["accountability_and_ownership"] as const satisfies readonly FoundationKey[],
    related: ["accountability", "developing_others", "ownership"],
  },
  {
    key: "accountability",
    label: "Accountability",
    foundations: ["accountability_and_ownership"] as const satisfies readonly FoundationKey[],
    related: ["ownership", "delegation", "feedback_difficult_conversations"],
  },
  {
    key: "psychological_safety",
    label: "Psychological Safety",
    foundations: ["psychological_safety"] as const satisfies readonly FoundationKey[],
    related: ["coaching_behaviours", "listening_presence", "collaboration"],
  },
  {
    key: "stakeholder_influence",
    label: "Stakeholder Influence",
    foundations: ["collaboration_and_alignment"] as const satisfies readonly FoundationKey[],
    related: ["stakeholder_management", "communication", "leadership_presence"],
  },
  {
    key: "decision_making",
    label: "Decision Making",
    foundations: ["accountability_and_ownership"] as const satisfies readonly FoundationKey[],
    related: ["strategic_thinking", "ownership", "systems_thinking"],
  },
  {
    key: "communication",
    label: "Communication",
    foundations: ["feedback_and_conversations"] as const satisfies readonly FoundationKey[],
    related: ["listening_presence", "stakeholder_influence", "leadership_presence"],
  },
  {
    key: "emotional_intelligence",
    label: "Emotional Intelligence",
    foundations: ["emotional_intelligence"] as const satisfies readonly FoundationKey[],
    related: ["resilience", "listening_presence", "psychological_safety"],
  },
  {
    key: "leading_change",
    label: "Leading Change",
    foundations: ["collaboration_and_alignment"] as const satisfies readonly FoundationKey[],
    related: ["strategic_thinking", "stakeholder_influence", "resilience"],
  },
  {
    key: "coaching_behaviours",
    label: "Coaching Behaviours",
    foundations: ["listening_and_presence", "psychological_safety"] as const satisfies readonly FoundationKey[],
    related: ["developing_others", "listening_presence", "feedback_difficult_conversations"],
  },
  {
    key: "team_development",
    label: "Team Development",
    foundations: ["psychological_safety", "collaboration_and_alignment"] as const satisfies readonly FoundationKey[],
    related: ["developing_others", "delegation", "collaboration"],
  },
  {
    key: "stakeholder_management",
    label: "Stakeholder Management",
    foundations: ["collaboration_and_alignment"] as const satisfies readonly FoundationKey[],
    related: ["stakeholder_influence", "communication", "systems_thinking"],
  },
  {
    key: "systems_thinking",
    label: "Systems Thinking",
    foundations: ["collaboration_and_alignment"] as const satisfies readonly FoundationKey[],
    related: ["strategic_thinking", "decision_making", "stakeholder_management"],
  },
  {
    key: "leadership_presence",
    label: "Leadership Presence",
    foundations: ["listening_and_presence", "emotional_intelligence"] as const satisfies readonly FoundationKey[],
    related: ["communication", "stakeholder_influence", "resilience"],
  },
  {
    key: "collaboration",
    label: "Collaboration",
    foundations: ["collaboration_and_alignment"] as const satisfies readonly FoundationKey[],
    related: ["psychological_safety", "team_development", "stakeholder_management"],
  },
  {
    key: "resilience",
    label: "Resilience",
    foundations: ["emotional_intelligence"] as const satisfies readonly FoundationKey[],
    related: ["emotional_intelligence", "ownership", "leading_change"],
  },
  {
    key: "developing_others",
    label: "Developing Others",
    foundations: ["psychological_safety", "feedback_and_conversations"] as const satisfies readonly FoundationKey[],
    related: ["coaching_behaviours", "team_development", "delegation"],
  },
  {
    key: "feedback_difficult_conversations",
    label: "Feedback & Difficult Conversations",
    foundations: ["feedback_and_conversations"] as const satisfies readonly FoundationKey[],
    related: ["accountability", "communication", "coaching_behaviours"],
  },
  {
    key: "listening_presence",
    label: "Listening & Presence",
    foundations: ["listening_and_presence"] as const satisfies readonly FoundationKey[],
    related: ["coaching_behaviours", "emotional_intelligence", "communication"],
  },
  {
    key: "ownership",
    label: "Ownership",
    foundations: ["accountability_and_ownership"] as const satisfies readonly FoundationKey[],
    related: ["accountability", "decision_making", "delegation"],
  },
] as const;

export type PridmoraCapabilityKey = (typeof PRIDMORA_CAPABILITIES)[number]["key"];

export function isPridmoraCapabilityKey(value: string): value is PridmoraCapabilityKey {
  return PRIDMORA_CAPABILITIES.some(capability => capability.key === value);
}

export function capabilityLabel(key: string): string {
  const found = PRIDMORA_CAPABILITIES.find(capability => capability.key === key);
  return found?.label ?? key;
}

export function relatedCapabilities(key: string): string[] {
  const found = PRIDMORA_CAPABILITIES.find(capability => capability.key === key);
  return found ? [...found.related] : [];
}

export function foundationLabelsForCapability(key: string): string[] {
  const found = PRIDMORA_CAPABILITIES.find(capability => capability.key === key);
  if (!found) return [];
  return found.foundations.map(foundationKey => {
    const foundation = SIX_FOUNDATIONS.find(item => item.key === foundationKey);
    return foundation?.label ?? foundationKey;
  });
}

/** Lightweight keyword mapping for observation → capability. */
const CAPABILITY_ALIASES: Record<PridmoraCapabilityKey, readonly string[]> = {
  strategic_thinking: ["strategic", "strategy", "big picture", "longer term"],
  delegation: ["delegat", "handover", "empower"],
  accountability: ["accountab", "hold people", "follow through"],
  psychological_safety: ["psychological safety", "safe to speak", "speak up"],
  stakeholder_influence: ["influence", "stakeholder", "buy-in", "buy in"],
  decision_making: ["decision", "decide", "judgement", "judgment"],
  communication: ["communicat", "message", "clarity of language"],
  emotional_intelligence: ["emotional intelligence", "self-awareness", "empathy"],
  leading_change: ["change", "transition", "transformation"],
  coaching_behaviours: ["coaching", "coach others", "develop through questions"],
  team_development: ["team development", "build the team", "team capability"],
  stakeholder_management: ["stakeholder management", "manage stakeholders"],
  systems_thinking: ["systems thinking", "systemic", "end to end", "end-to-end"],
  leadership_presence: ["presence", "gravitas", "visibility"],
  collaboration: ["collaborat", "cross-functional", "partnership"],
  resilience: ["resilien", "under pressure", "recover"],
  developing_others: ["developing others", "develop people", "grow others"],
  feedback_difficult_conversations: [
    "feedback",
    "difficult conversation",
    "performance conversation",
  ],
  listening_presence: ["listening", "presence", "attentive"],
  ownership: ["ownership", "own the outcome", "take ownership"],
};

export function inferCapabilityKeysFromText(text: string): PridmoraCapabilityKey[] {
  const lower = text.toLowerCase();
  const matched: PridmoraCapabilityKey[] = [];
  for (const capability of PRIDMORA_CAPABILITIES) {
    const aliases = CAPABILITY_ALIASES[capability.key];
    if (aliases.some(alias => lower.includes(alias))) {
      matched.push(capability.key);
    }
  }
  return matched;
}
