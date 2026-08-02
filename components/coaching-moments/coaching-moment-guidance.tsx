"use client";

import { useState } from "react";
import type { CoachingMomentGuidance } from "@/lib/coaching-moments/coaching-moment";
import { IdentityInsight } from "@/components/identity-intelligence";

export type CoachingMomentGuidanceProps = {
  guidance: CoachingMomentGuidance;
  onStartConversation: () => void;
  onBack?: () => void;
  busy?: boolean;
};

export function CoachingMomentGuidanceCard({
  guidance,
  onStartConversation,
  onBack,
  busy = false,
}: CoachingMomentGuidanceProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const hasEvidence =
    Boolean(guidance.relevantContext) &&
    (guidance.relevantContext?.evidenceIds.length ?? 0) > 0;

  return (
    <div className="coaching-moment-guidance">
      <h3 className="coaching-moment-heading">Preparation</h3>
      <p className="coaching-moment-supporting">
        Review in about 30 seconds, then begin when ready.
      </p>

      <section className="coaching-moment-guidance__block">
        <h4>Intention</h4>
        <p>{guidance.intention}</p>
      </section>

      {guidance.opening ? (
        <section className="coaching-moment-guidance__block">
          <h4>Possible opening</h4>
          <p className="coaching-moment-guidance__opening">
            “{guidance.opening}”
          </p>
        </section>
      ) : null}

      {guidance.questions.length > 0 ? (
        <section className="coaching-moment-guidance__block">
          <h4>Questions</h4>
          <ol>
            {guidance.questions.slice(0, 3).map((question, index) => (
              <li key={`${index}-${question.slice(0, 24)}`}>{question}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {guidance.consideration ? (
        <section className="coaching-moment-guidance__block">
          <h4>Keep in mind</h4>
          <p>{guidance.consideration}</p>
        </section>
      ) : null}

      {guidance.relevantContext ? (
        <IdentityInsight
          title={guidance.relevantContext.title}
          evidenceStrength="supported"
          reviewState="draft"
          compact
          onViewEvidence={
            hasEvidence
              ? () => setShowEvidence(value => !value)
              : undefined
          }
          evidenceLabel={
            showEvidence
              ? undefined
              : guidance.relevantContext.description
          }
        >
          <p>{guidance.relevantContext.description}</p>
          {showEvidence && hasEvidence ? (
            <ul className="coaching-moment-guidance__evidence">
              {guidance.relevantContext.evidenceIds.map(id => (
                <li key={id}>{id}</li>
              ))}
            </ul>
          ) : null}
        </IdentityInsight>
      ) : null}

      <div className="coaching-moment-actions">
        {onBack ? (
          <button
            type="button"
            className="identity-modal-button identity-modal-button--secondary"
            disabled={busy}
            onClick={onBack}
          >
            Back
          </button>
        ) : null}
        <button
          type="button"
          className="identity-modal-button identity-modal-button--primary"
          disabled={busy}
          onClick={onStartConversation}
        >
          Start conversation
        </button>
      </div>
    </div>
  );
}
