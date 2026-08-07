/**
 * Real-life manager conversation scenarios.
 * These are entry points into the existing Preparation → Conversation → Summary flow.
 * They do not create separate workflows.
 */

export type ManagerScenario = {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  /** Suggested conversation focus for preparation. */
  focusPrompt: string;
  /** Guidance for Aurelia / preparation prompts. */
  preparationGuidance: string;
  sensitivity: "standard" | "elevated";
};

export const MANAGER_SCENARIOS: ManagerScenario[] = [
  {
    id: "difficult-conversation",
    label: "Difficult conversation",
    shortLabel: "Difficult",
    description: "Prepare for a conversation that may feel uncomfortable or high stakes.",
    focusPrompt: "Prepare for a difficult conversation — clarify the outcome needed and the evidence to share.",
    preparationGuidance:
      "Help the manager clarify the specific issue, desired outcome and how to stay fair and direct. Do not provide HR, legal or disciplinary advice.",
    sensitivity: "elevated",
  },
  {
    id: "giving-feedback",
    label: "Giving feedback",
    shortLabel: "Feedback",
    description: "Structure constructive feedback grounded in observed behaviour.",
    focusPrompt: "Prepare to give clear feedback based on observed behaviour and impact.",
    preparationGuidance:
      "Support evidence-based feedback: behaviour observed, impact and a clear request. Avoid character judgements.",
    sensitivity: "standard",
  },
  {
    id: "performance-concern",
    label: "Performance concern",
    shortLabel: "Performance",
    description: "Address a performance concern with clarity and support.",
    focusPrompt: "Explore a performance concern and agree what needs to improve.",
    preparationGuidance:
      "Help separate facts from interpretation. Frame as preparation and reflection for the manager — not employment advice.",
    sensitivity: "elevated",
  },
  {
    id: "delegation",
    label: "Delegation",
    shortLabel: "Delegation",
    description: "Delegate work with clear ownership and support.",
    focusPrompt: "Prepare to delegate with clear ownership, success criteria and support.",
    preparationGuidance:
      "Focus on clarity of outcome, decision rights and follow-up. Challenge vague handover language.",
    sensitivity: "standard",
  },
  {
    id: "managing-conflict",
    label: "Managing conflict",
    shortLabel: "Conflict",
    description: "Prepare for a conversation involving disagreement or tension.",
    focusPrompt: "Prepare to address conflict and restore workable working relationships.",
    preparationGuidance:
      "Help the manager stay curious, name the impact and seek a workable next step. No mediation verdicts.",
    sensitivity: "elevated",
  },
  {
    id: "one-to-one",
    label: "One-to-one",
    shortLabel: "1:1",
    description: "A regular one-to-one focused on progress and support.",
    focusPrompt: "Prepare a purposeful one-to-one covering progress, blockers and support.",
    preparationGuidance:
      "Surface open actions, recent progress and one useful challenge question.",
    sensitivity: "standard",
  },
  {
    id: "development-conversation",
    label: "Development conversation",
    shortLabel: "Development",
    description: "Explore growth, strengths and next development priorities.",
    focusPrompt: "Explore development priorities, strengths and useful next focus.",
    preparationGuidance:
      "Ground suggestions in prior conversation evidence and agreed actions.",
    sensitivity: "standard",
  },
  {
    id: "new-manager-transition",
    label: "New manager transition",
    shortLabel: "New manager",
    description: "Support someone stepping into management.",
    focusPrompt: "Support the transition into managing people and setting early priorities.",
    preparationGuidance:
      "Focus on role clarity, early relationships and realistic first priorities.",
    sensitivity: "standard",
  },
  {
    id: "managing-former-peers",
    label: "Managing former peers",
    shortLabel: "Former peers",
    description: "Navigate authority and relationships after becoming a peer's manager.",
    focusPrompt: "Prepare for managing former peers with clarity and respect.",
    preparationGuidance:
      "Help name boundary and fairness issues without scripting authority theatre.",
    sensitivity: "elevated",
  },
  {
    id: "stakeholder-challenge",
    label: "Stakeholder challenge",
    shortLabel: "Stakeholder",
    description: "Prepare for a challenging stakeholder or cross-team conversation.",
    focusPrompt: "Prepare for a stakeholder challenge — clarify interests and desired outcome.",
    preparationGuidance:
      "Help map interests, constraints and a clear ask. Stay preparation-focused.",
    sensitivity: "standard",
  },
  {
    id: "leading-change",
    label: "Leading change",
    shortLabel: "Change",
    description: "Lead a conversation about change and what it means for the person.",
    focusPrompt: "Prepare to lead a change conversation with clarity and empathy.",
    preparationGuidance:
      "Focus on what is known, what is not and how the person can contribute.",
    sensitivity: "standard",
  },
  {
    id: "team-confidence",
    label: "Team confidence",
    shortLabel: "Confidence",
    description: "Build confidence and psychological safety in a team context.",
    focusPrompt: "Explore confidence and how to strengthen safe contribution.",
    preparationGuidance:
      "Look for evidence of growing or fragile confidence. Avoid clinical framing.",
    sensitivity: "standard",
  },
  {
    id: "accountability",
    label: "Accountability",
    shortLabel: "Accountability",
    description: "Reinforce ownership of commitments and follow-through.",
    focusPrompt: "Address accountability and follow-through on agreed actions.",
    preparationGuidance:
      "Review open commitments and help the manager ask for clear ownership.",
    sensitivity: "standard",
  },
  {
    id: "workload-pressure",
    label: "Managing workload pressure",
    shortLabel: "Workload",
    description: "Discuss workload pressure and sustainable priorities.",
    focusPrompt: "Discuss workload pressure and agree realistic priorities.",
    preparationGuidance:
      "Help prioritise and name trade-offs. Do not diagnose burnout or give clinical advice.",
    sensitivity: "elevated",
  },
  {
    id: "supporting-progression",
    label: "Supporting progression",
    shortLabel: "Progression",
    description: "Support career progression and readiness for next steps.",
    focusPrompt: "Explore progression aspirations and evidence of readiness.",
    preparationGuidance:
      "Ground progression talk in demonstrated strengths and development themes.",
    sensitivity: "standard",
  },
  {
    id: "preparing-for-appraisal",
    label: "Preparing for appraisal",
    shortLabel: "Appraisal",
    description: "Prepare for an appraisal or formal performance review conversation.",
    focusPrompt: "Prepare for an appraisal conversation using evidence from recent work.",
    preparationGuidance:
      "Organise evidence of progress, strengths and development priorities. Not HR policy advice.",
    sensitivity: "elevated",
  },
  {
    id: "return-to-work",
    label: "Return-to-work discussion",
    shortLabel: "Return to work",
    description: "Support a thoughtful return-to-work conversation.",
    focusPrompt: "Prepare a supportive return-to-work discussion focused on needs and next steps.",
    preparationGuidance:
      "Position as preparation for a supportive conversation. Do not give medical or legal advice.",
    sensitivity: "elevated",
  },
  {
    id: "challenging-behaviour",
    label: "Challenging behaviour",
    shortLabel: "Behaviour",
    description: "Address behaviour that is affecting others or the team.",
    focusPrompt: "Address challenging behaviour with specific examples and a clear expectation.",
    preparationGuidance:
      "Keep focus on observed behaviour and impact. Preparation only — not disciplinary advice.",
    sensitivity: "elevated",
  },
  {
    id: "psychological-safety",
    label: "Building psychological safety",
    shortLabel: "Safety",
    description: "Strengthen conditions for open, honest contribution.",
    focusPrompt: "Explore how to strengthen psychological safety in day-to-day work.",
    preparationGuidance:
      "Help the manager notice conditions that help or hinder speaking up. Avoid clinical claims.",
    sensitivity: "standard",
  },
];

export function getManagerScenario(id: string | null | undefined): ManagerScenario | null {
  if (!id) return null;
  return MANAGER_SCENARIOS.find(scenario => scenario.id === id) ?? null;
}

export function managerScenarioFocusPrompt(id: string | null | undefined): string | null {
  return getManagerScenario(id)?.focusPrompt ?? null;
}
