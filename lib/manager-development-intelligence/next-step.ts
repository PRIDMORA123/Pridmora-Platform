/**
 * Deterministic organisational next-step library.
 * Canonical themeKey → generic organisational suggestion.
 * No AI. No Manager data. No individual recommendations.
 */

const NEXT_STEPS: Record<
  string,
  { title: string; suggestion: string; watchFor: string }
> = {
  delegation: {
    title: "Strengthen delegation practice",
    suggestion:
      "Use a short practice cycle in which Managers clarify the outcome, decision boundaries, ownership and check-in points before delegating live work.",
    watchFor:
      "Look for development evidence of clearer ownership, proportionate check-ins and Managers resisting the urge to take work back unnecessarily.",
  },
  feedback: {
    title: "Build everyday feedback practice",
    suggestion:
      "Use live-case practice to help Managers make feedback timely, specific, two-way and connected to an agreed next step.",
    watchFor:
      "Look for evidence that feedback is happening closer to the event and leading to clearer follow-through.",
  },
  difficult_conversations: {
    title: "Build readiness for difficult conversations",
    suggestion:
      "Provide structured rehearsal using real management situations, with attention to purpose, evidence, language, listening and an appropriate next step.",
    watchFor:
      "Look for evidence of earlier preparation, clearer conversations and fewer issues being avoided or allowed to drift.",
  },
  accountability: {
    title: "Reinforce clear and supportive accountability",
    suggestion:
      "Run a focused practice cycle on agreeing outcomes, owners, timescales and supportive follow-through in live work.",
    watchFor:
      "Look for development evidence of clearer agreements, timely follow-up and ownership remaining with the right person.",
  },
  psychological_safety: {
    title: "Strengthen speak-up conditions",
    suggestion:
      "Help Managers practise inviting challenge, responding constructively to concerns and making it safe to acknowledge uncertainty or mistakes.",
    watchFor:
      "Look for evidence of Managers asking for challenge, hearing different views and responding without defensiveness.",
  },
  presence: {
    title: "Strengthen listening and leadership presence",
    suggestion:
      "Use observed practice and reflection to help Managers listen without rushing, test their understanding and respond with intention.",
    watchFor:
      "Look for evidence of fewer assumptions, more purposeful questions and clearer shared understanding after conversations.",
  },
  collaboration: {
    title: "Improve cross-boundary collaboration",
    suggestion:
      "Use a live shared challenge to help Managers clarify dependencies, expectations, decision rights and joint ownership across teams.",
    watchFor:
      "Look for evidence of earlier alignment, clearer handovers and fewer unresolved assumptions between teams.",
  },
  confidence: {
    title: "Support confident managerial judgement",
    suggestion:
      "Give Managers repeated opportunities to work through live decisions, explain their reasoning and act with appropriate support.",
    watchFor:
      "Look for evidence of clearer decisions, proportionate escalation and greater willingness to act amid reasonable uncertainty.",
  },
  role_transition: {
    title: "Support the transition into management",
    suggestion:
      "Create structured reflection around changing expectations, priorities, relationships and the shift from doing work to enabling others.",
    watchFor:
      "Look for evidence that Managers are establishing clearer priorities, delegating appropriately and becoming more deliberate about how they lead.",
  },
  boundaries: {
    title: "Strengthen priorities and sustainable boundaries",
    suggestion:
      "Help Managers practise making trade-offs, setting expectations and escalating capacity constraints before workload becomes unmanageable.",
    watchFor:
      "Look for evidence of clearer prioritisation, earlier capacity conversations and more consistent boundaries.",
  },
};

export function organisationalNextStepForTheme(
  themeKey: string
): { title: string; suggestion: string; watchFor: string } | null {
  return NEXT_STEPS[themeKey.trim()] ?? null;
}
