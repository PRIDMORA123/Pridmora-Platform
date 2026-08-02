"use client";

import { useState } from "react";
import type { NormalisedPreparationBrief } from "@/lib/prepare/normalise-preparation-brief";
import type { PreparationRefreshState } from "@/components/prepare/preparation-approach-control";
import { PreparationBriefSection } from "@/components/prepare/preparation-brief-section";
import { PreparationStatus } from "@/components/prepare/preparation-status";

export type PreparationBriefProps = {
  brief: NormalisedPreparationBrief;
  mode?: "manual" | "assisted" | "comprehensive";
  refreshState?: PreparationRefreshState;
  hasApprovedEvidence?: boolean;
  onViewSources?: () => void;
  onViewEvidenceProvenance?: () => void;
  onContinueWithExisting?: () => void;
};

/**
 * Canonical on-page preparation briefing.
 * Content must always render complete sentences — no clamp/ellipsis.
 */
export function PreparationBrief({
  brief,
  mode = "assisted",
  refreshState = "idle",
  hasApprovedEvidence = false,
  onViewSources,
  onViewEvidenceProvenance,
  onContinueWithExisting,
}: PreparationBriefProps) {
  const [supportingOpen, setSupportingOpen] = useState(false);
  const isManual = mode === "manual";
  const isComprehensive = mode === "comprehensive";

  const hasSupportingContext =
    isComprehensive &&
    (Boolean(brief.developmentDirection?.trim()) ||
      brief.historicalContext.length > 0);

  return (
    <section
      className="preparation-brief"
      aria-labelledby="preparation-brief-status-title"
    >
      <div id="preparation-brief-status-title">
        <PreparationStatus
          refreshState={refreshState}
          hasApprovedEvidence={hasApprovedEvidence}
          mode={mode}
          onViewSources={onViewSources}
          onContinueWithExisting={onContinueWithExisting}
        />
      </div>

      {isManual ? (
        <PreparationBriefSection title="Manual preparation">
          <p>
            No AI preparation is active. Use your own notes and professional
            judgement.
          </p>
        </PreparationBriefSection>
      ) : (
        <>
          {brief.primaryFocus ? (
            <PreparationBriefSection title="Primary focus">
              <p className="preparation-brief__focus">{brief.primaryFocus}</p>
            </PreparationBriefSection>
          ) : null}

          {brief.areasToExplore.length > 0 ? (
            <PreparationBriefSection title="Areas to explore">
              <ul className="preparation-brief__list">
                {brief.areasToExplore.map(area => (
                  <li key={area}>{area}</li>
                ))}
              </ul>
            </PreparationBriefSection>
          ) : null}

          {brief.questions.length > 0 ? (
            <PreparationBriefSection title="Questions to consider">
              <ol className="preparation-brief__questions">
                {brief.questions.map(question => (
                  <li key={question}>{question}</li>
                ))}
              </ol>
            </PreparationBriefSection>
          ) : null}

          <PreparationBriefSection title="Previous commitment">
            <p className="preparation-brief__commitment">
              {brief.previousCommitment?.trim()
                ? brief.previousCommitment
                : "No previous commitment was recorded."}
            </p>
          </PreparationBriefSection>

          {isComprehensive && brief.relevantPatterns.length > 0 ? (
            <PreparationBriefSection title="Relevant pattern">
              <ul className="preparation-brief__patterns">
                {brief.relevantPatterns.map(pattern => (
                  <li key={`${pattern.title}-${pattern.description}`}>
                    <strong>{pattern.title}</strong>
                    {pattern.description ? <p>{pattern.description}</p> : null}
                    {pattern.evidenceLabel ? (
                      <span className="preparation-brief__evidence-label">
                        {pattern.evidenceLabel}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </PreparationBriefSection>
          ) : null}

          {hasSupportingContext ? (
            <div className="preparation-brief__disclosure">
              <button
                type="button"
                className="identity-text-action"
                aria-expanded={supportingOpen}
                onClick={() => setSupportingOpen(current => !current)}
              >
                {supportingOpen
                  ? "Hide supporting context"
                  : "View supporting context"}
              </button>

              {supportingOpen ? (
                <div className="preparation-brief__supporting">
                  {brief.developmentDirection?.trim() ? (
                    <PreparationBriefSection title="Development direction">
                      <p>{brief.developmentDirection}</p>
                    </PreparationBriefSection>
                  ) : null}

                  {brief.historicalContext.length > 0 ? (
                    <PreparationBriefSection title="Relevant historical context">
                      <ul className="preparation-brief__list">
                        {brief.historicalContext.map(item => (
                          <li key={`${item.title}-${item.detail}`}>
                            <strong>{item.title}</strong>
                            {item.detail ? ` — ${item.detail}` : null}
                          </li>
                        ))}
                      </ul>
                    </PreparationBriefSection>
                  ) : null}

                  {onViewEvidenceProvenance ? (
                    <button
                      type="button"
                      className="identity-text-action"
                      onClick={onViewEvidenceProvenance}
                    >
                      View evidence sources
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
