"use client";

import { IdentityButton } from "@/components/identity/button";
import type { OnboardingStage } from "@/lib/onboarding";

type OnboardingPromptProps = {
  stage: Exclude<OnboardingStage, "welcome" | "complete">;
  personName?: string;
  onContinue: () => void;
};

const onboardingContent = {
  create_person: {
    eyebrow: "Getting started",
    title: "Create your first coaching relationship.",
    description:
      "Add the person you will be coaching and establish the relationship.",
    action: "Add your first client",
  },
  define_purpose: {
    eyebrow: "Next step",
    title: "Agree the coaching purpose.",
    description:
      "Clarify what this coaching relationship is intended to support.",
    action: "Define coaching purpose",
  },
  prepare: {
    eyebrow: "Next step",
    title: "Prepare for the first development conversation.",
    description:
      "Review the purpose, add your own observations and focus your thinking.",
    action: "Begin preparation",
  },
} as const;

export function OnboardingPrompt({
  stage,
  personName,
  onContinue,
}: OnboardingPromptProps) {
  const content = onboardingContent[stage];

  return (
    <section className="onboarding-prompt" aria-label={content.eyebrow}>
      <div>
        <p className="attention-eyebrow">{content.eyebrow}</p>
        <h2 className="identity-section-title">{content.title}</h2>

        <p className="identity-section-description">
          {personName
            ? `${personName}: ${content.description}`
            : content.description}
        </p>
      </div>

      <IdentityButton
        variant="primary"
        size="md"
        onClick={onContinue}
      >
        {content.action}
      </IdentityButton>
    </section>
  );
}
