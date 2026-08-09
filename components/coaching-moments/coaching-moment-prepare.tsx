"use client";

import { resolveProductLanguage } from "@/lib/role-language";
import { useOrganisation } from "@/lib/organisations/organisation-context";
export type CoachingMomentPrepareProps = {
  situation: string;
  desiredOutcome: string;
  disabled?: boolean;
  error?: string | null;
  onSituationChange: (value: string) => void;
  onDesiredOutcomeChange: (value: string) => void;
};

export function CoachingMomentPrepare({
  situation,
  desiredOutcome,
  disabled = false,
  error = null,
  onSituationChange,
  onDesiredOutcomeChange,
}: CoachingMomentPrepareProps) {
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);
  return (
    <div className="coaching-moment-prepare">
      <h3 className="coaching-moment-heading">{`Prepare for a ${language.momentSingular.toLowerCase()}`}</h3>
      <p className="coaching-moment-supporting">
        Capture just enough context to stay present. AI guidance is optional.
      </p>

      <label className="coaching-moment-field" htmlFor="coaching-moment-situation">
        <span>What conversation are you preparing for?</span>
        <textarea
          id="coaching-moment-situation"
          value={situation}
          disabled={disabled}
          rows={4}
          placeholder="Sarah has missed another deadline and became defensive when I raised it."
          onChange={event => onSituationChange(event.target.value)}
        />
      </label>

      <label
        className="coaching-moment-field"
        htmlFor="coaching-moment-desired-outcome"
      >
        <span>
          What would a useful outcome look like?{" "}
          <em className="coaching-moment-optional">(optional)</em>
        </span>
        <textarea
          id="coaching-moment-desired-outcome"
          value={desiredOutcome}
          disabled={disabled}
          rows={2}
          placeholder="She accepts ownership and agrees how to raise risks earlier."
          onChange={event => onDesiredOutcomeChange(event.target.value)}
        />
      </label>

      {error ? (
        <p className="coaching-moment-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
