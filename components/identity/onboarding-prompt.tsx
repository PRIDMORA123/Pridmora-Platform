"use client";

import { IdentityButton } from "@/components/identity/button";
import type { OnboardingStage } from "@/lib/onboarding";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import { resolveProductLanguage } from "@/lib/role-language";

type OnboardingPromptProps = {
  stage: Exclude<OnboardingStage, "welcome" | "complete">;
  personName?: string;
  onContinue: () => void;
};

export function OnboardingPrompt({
  stage,
  personName,
  onContinue,
}: OnboardingPromptProps) {
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);

  const onboardingContent = {
    create_person: {
      eyebrow: "Getting started",
      title: `Create your first ${language.relationshipSingular}.`,
      description: `Add the ${language.personSingular} you will support and establish the relationship.`,
      action: `Add your first ${language.personSingular}`,
    },
    define_purpose: {
      eyebrow: "Next step",
      title: `Agree the ${language.developmentPurposeLabel.toLowerCase()}.`,
      description: `Clarify what this ${language.relationshipSingular} is intended to support.`,
      action: `Define ${language.developmentPurposeLabel.toLowerCase()}`,
    },
    prepare: {
      eyebrow: "Next step",
      title: "Prepare for the first development conversation.",
      description:
        "Review the purpose, add your own observations and focus your thinking.",
      action: "Begin preparation",
    },
  } as const;

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
