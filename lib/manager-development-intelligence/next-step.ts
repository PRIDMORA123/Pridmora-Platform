/**
 * Deterministic organisational next-step library.
 * Canonical themeKey → generic organisational suggestion.
 * No AI. No Manager data. No individual recommendations.
 */

const NEXT_STEPS: Record<string, { title: string; suggestion: string }> = {
  delegation: {
    title: "Strengthen delegation practice",
    suggestion:
      "Consider targeted development or peer learning around delegation, trust and appropriate ownership.",
  },
  feedback: {
    title: "Build feedback confidence",
    suggestion:
      "Consider a short organisational focus on giving and receiving feedback in everyday management conversations.",
  },
  difficult_conversations: {
    title: "Support difficult conversations",
    suggestion:
      "Consider peer practice or facilitated sessions that help Managers prepare for challenging conversations.",
  },
  accountability: {
    title: "Reinforce accountability",
    suggestion:
      "Consider development that helps Managers set clear expectations and follow through with support.",
  },
  psychological_safety: {
    title: "Develop psychological safety",
    suggestion:
      "Consider organisational learning that helps Managers create conditions where people can speak up safely.",
  },
  presence: {
    title: "Strengthen listening and presence",
    suggestion:
      "Consider practice-focused development on listening, attention and leadership presence.",
  },
  collaboration: {
    title: "Improve collaboration",
    suggestion:
      "Consider peer learning that strengthens cross-team collaboration and alignment.",
  },
  confidence: {
    title: "Support confident leadership",
    suggestion:
      "Consider development opportunities that help Managers build assured judgement in everyday decisions.",
  },
  role_transition: {
    title: "Support role transitions",
    suggestion:
      "Consider structured support for Managers navigating new or expanding responsibilities.",
  },
  boundaries: {
    title: "Address workload and boundaries",
    suggestion:
      "Consider organisational guidance that helps Managers set priorities and sustainable boundaries.",
  },
};

export function organisationalNextStepForTheme(
  themeKey: string
): { title: string; suggestion: string } | null {
  return NEXT_STEPS[themeKey.trim()] ?? null;
}
