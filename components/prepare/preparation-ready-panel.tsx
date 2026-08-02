"use client";

import { useMemo, useState, type ReactNode } from "react";

import {
  arePreparationsEqual,
  deriveCoachPreparationDraft,
  type CoachPreparationDraft,
  type PreparationIntelligence,
} from "@/lib/preparation/derive-coach-preparation";

type PreparationReadyPanelProps = {
  intelligence: PreparationIntelligence;
  currentPreparation: CoachPreparationDraft;
  disabled?: boolean;
  onApply: (draft: CoachPreparationDraft) => void;
};

export function PreparationReadyPanel({
  intelligence,
  currentPreparation,
  disabled = false,
  onApply,
}: PreparationReadyPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const proposedDraft = useMemo(
    () => deriveCoachPreparationDraft(intelligence),
    [intelligence],
  );

  const alreadyApplied = useMemo(
    () =>
      arePreparationsEqual(
        {
          ...proposedDraft,
          reminders: currentPreparation.reminders,
        },
        currentPreparation,
      ),
    [currentPreparation, proposedDraft],
  );

  const hasDraftContent = Boolean(
    proposedDraft.purpose ||
      proposedDraft.desiredOutcome ||
      proposedDraft.topics.length ||
      proposedDraft.questions.length,
  );

  if (!hasDraftContent) {
    return null;
  }

  function applyDraft() {
    onApply({
      ...proposedDraft,
      reminders: currentPreparation.reminders,
    });
  }

  return (
    <section
      className="prepare-ready-panel"
      aria-labelledby="prepare-ready-title"
    >
      <div className="prepare-ready-panel__header">
        <div className="prepare-ready-panel__heading">
          <p className="prepare-ready-panel__eyebrow">
            Prepared for you
          </p>

          <h2 id="prepare-ready-title">
            Your conversation draft is ready
          </h2>

          <p>
            Review the suggested preparation or start the
            conversation as it stands.
          </p>
        </div>

        <div className="prepare-ready-panel__actions">
          <button
            type="button"
            className="identity-button secondary"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "Hide preview" : "Review draft"}
          </button>

          <button
            type="button"
            className="identity-button primary"
            disabled={disabled || alreadyApplied}
            onClick={applyDraft}
          >
            {alreadyApplied
              ? "Draft applied"
              : "Use prepared draft"}
          </button>
        </div>
      </div>

      <div className="prepare-ready-panel__summary">
        <PreparationSummaryItem
          label="Purpose"
          value={proposedDraft.purpose}
        />

        <PreparationSummaryItem
          label="Focus areas"
          value={
            proposedDraft.topics.length
              ? proposedDraft.topics.join(" · ")
              : ""
          }
        />

        <PreparationSummaryItem
          label="Questions"
          value={
            proposedDraft.questions.length
              ? `${proposedDraft.questions.length} prepared`
              : ""
          }
        />
      </div>

      {expanded ? (
        <div className="prepare-ready-panel__preview">
          {proposedDraft.purpose ? (
            <PreviewSection title="Suggested purpose">
              <p>{proposedDraft.purpose}</p>
            </PreviewSection>
          ) : null}

          {proposedDraft.desiredOutcome ? (
            <PreviewSection title="Suggested outcome">
              <p>{proposedDraft.desiredOutcome}</p>
            </PreviewSection>
          ) : null}

          {proposedDraft.topics.length ? (
            <PreviewSection title="Areas to explore">
              <div className="prepare-ready-panel__topics">
                {proposedDraft.topics.map((topic) => (
                  <span
                    key={topic}
                    className="prepare-ready-panel__topic"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </PreviewSection>
          ) : null}

          {proposedDraft.questions.length ? (
            <PreviewSection title="Suggested questions">
              <ol className="prepare-ready-panel__questions">
                {proposedDraft.questions.map(
                  (question, index) => (
                    <li key={`${index}-${question}`}>
                      <span aria-hidden="true">
                        {index + 1}
                      </span>
                      <p>{question}</p>
                    </li>
                  ),
                )}
              </ol>
            </PreviewSection>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function PreparationSummaryItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  if (!value) {
    return null;
  }

  return (
    <div className="prepare-ready-panel__summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PreviewSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="prepare-ready-panel__preview-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

