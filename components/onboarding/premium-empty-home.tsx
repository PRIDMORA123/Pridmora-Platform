"use client";

import { PremiumButton, PremiumPageHeader } from "@/components/premium";

const WORKFLOW_STAGES = [
  {
    title: "Prepare with AI",
    description: "Focus your thinking before the conversation.",
  },
  {
    title: "Capture the conversation",
    description: "Record what mattered without losing the thread.",
  },
  {
    title: "Reveal development",
    description: "See meaningful change emerge over time.",
  },
] as const;

type PremiumEmptyHomeProps = {
  onCreateRelationship: () => void;
};

export function PremiumEmptyHome({ onCreateRelationship }: PremiumEmptyHomeProps) {
  return (
    <section
      className="premium-empty-home identity-reveal"
      aria-label="Empty workspace"
    >
      <PremiumPageHeader
        eyebrow="Your workspace"
        title="Start with one meaningful conversation."
        description="Create your first coaching relationship and Pridmora will guide you from preparation through to development insight."
      />

      <div className="premium-empty-home__action">
        <PremiumButton
          variant="primary"
          size="lg"
          onClick={onCreateRelationship}
        >
          Create your first relationship
        </PremiumButton>
      </div>

      <ol className="premium-empty-home__stages">
        {WORKFLOW_STAGES.map((stage, index) => (
          <li key={stage.title} className="premium-empty-home__stage">
            <span className="premium-empty-home__stage-index" aria-hidden>
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h2>{stage.title}</h2>
              <p>{stage.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
