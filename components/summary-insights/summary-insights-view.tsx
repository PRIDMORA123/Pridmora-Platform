"use client";

import { IdentityIntelligencePanel } from "@/components/identity-intelligence";
import { SummaryCommitmentList } from "@/components/summary-insights/summary-commitment-list";
import { SummaryEvidenceNote } from "@/components/summary-insights/summary-evidence-note";
import { SummaryInsightItem } from "@/components/summary-insights/summary-insight-item";
import { SummarySection } from "@/components/summary-insights/summary-section";
import {
  SUMMARY_SECTION_PURPOSE,
  type SummaryInsightItem as InsightItem,
  type SummaryInsightsContent,
} from "@/lib/summary-insights/types";
import { hasComprehensiveExtras } from "@/lib/summary-insights/comprehensive-pack";
import type { IntelligenceReviewState } from "@/components/identity-intelligence/types";
import type { SummaryStatus } from "@/lib/types";

export type SummaryInsightsViewProps = {
  content: SummaryInsightsContent;
  status: SummaryStatus;
  editing?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  onChange?: (content: SummaryInsightsContent) => void;
};

function reviewStateForStatus(
  status: SummaryStatus
): IntelligenceReviewState | undefined {
  if (status === "draft") return "draft";
  if (status === "approved") return "accepted";
  return undefined;
}

function evidenceLabelForStatus(status: SummaryStatus): string {
  if (status === "approved") {
    return "Approved development record · Supported by reviewed conversation evidence";
  }
  if (status === "draft") {
    return "Draft · Supported by reviewed conversation evidence";
  }
  return "Supported by reviewed conversation evidence";
}

function updateInsightList(
  items: InsightItem[],
  index: number,
  patch: Partial<InsightItem>
): InsightItem[] {
  return items.map((item, itemIndex) =>
    itemIndex === index ? { ...item, ...patch } : item
  );
}

function InsightEditorList({
  label,
  items,
  disabled,
  onChange,
  onAdd,
  onRemove,
}: {
  label: string;
  items: InsightItem[];
  disabled?: boolean;
  onChange: (index: number, patch: Partial<InsightItem>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="summary-insights-edit-list">
      {items.map((item, index) => {
        const titleId = `${label}-title-${index}`;
        const descriptionId = `${label}-description-${index}`;
        return (
          <div key={`${label}-${index}`} className="summary-insights-edit-item">
            <label htmlFor={titleId}>
              {label} title
              <input
                id={titleId}
                type="text"
                value={item.title}
                disabled={disabled}
                onChange={event =>
                  onChange(index, { title: event.target.value })
                }
              />
            </label>
            <label htmlFor={descriptionId}>
              Description
              <textarea
                id={descriptionId}
                rows={3}
                value={item.description}
                disabled={disabled}
                onChange={event =>
                  onChange(index, { description: event.target.value })
                }
              />
            </label>
            <button
              type="button"
              className="identity-text-action"
              disabled={disabled}
              onClick={() => onRemove(index)}
            >
              Remove
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="identity-button secondary"
        disabled={disabled}
        onClick={onAdd}
      >
        Add {label.toLowerCase()}
      </button>
    </div>
  );
}

function StringListEditor({
  label,
  items,
  disabled,
  onChange,
  onAdd,
  onRemove,
}: {
  label: string;
  items: string[];
  disabled?: boolean;
  onChange: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="summary-insights-edit-list">
      {items.map((item, index) => {
        const fieldId = `${label}-${index}`;
        return (
          <div key={fieldId} className="summary-insights-edit-item">
            <label htmlFor={fieldId}>
              {label}
              <input
                id={fieldId}
                type="text"
                value={item}
                disabled={disabled}
                onChange={event => onChange(index, event.target.value)}
              />
            </label>
            <button
              type="button"
              className="identity-text-action"
              disabled={disabled}
              onClick={() => onRemove(index)}
            >
              Remove
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="identity-button secondary"
        disabled={disabled}
        onClick={onAdd}
      >
        Add {label.toLowerCase()}
      </button>
    </div>
  );
}

export function SummaryInsightsView({
  content,
  status,
  editing = false,
  readOnly = false,
  disabled = false,
  onChange,
}: SummaryInsightsViewProps) {
  const reviewState = reviewStateForStatus(status);
  const fieldsDisabled = readOnly || disabled || !editing;

  function patch(partial: Partial<SummaryInsightsContent>) {
    onChange?.({ ...content, ...partial });
  }

  return (
    <IdentityIntelligencePanel
      level="insight"
      evidenceStrength="supported"
      evidenceLabel={evidenceLabelForStatus(status)}
      reviewState={reviewState}
      className="summary-insights-panel"
    >
      {/*
        Panel title is rendered here (not via the panel title prop) so section
        h2 / insight h3 headings keep a valid document outline.
      */}
      <p className="summary-insights-panel__title">Conversation Summary & Insights</p>
      <p className="summary-insights-panel__depth" data-depth={content.depthMode ?? "standard"}>
        {(content.depthMode ?? "standard") === "comprehensive"
          ? "Comprehensive — deeper analysis across development history, evidence and behavioural patterns."
          : "Standard — concise insight for everyday management use."}
      </p>
      <div
        className={`summary-insights-content${editing ? " is-editing" : ""}`}
        data-mode={editing ? "edit" : "read"}
        data-depth={content.depthMode ?? "standard"}
      >
        {editing ? (
          <>
            <SummarySection
              title="Conversation Summary"
              purpose={SUMMARY_SECTION_PURPOSE.sessionSummary}
            >
              <label htmlFor="summary-session-summary">
                Conversation summary
                <textarea
                  id="summary-session-summary"
                  rows={5}
                  disabled={fieldsDisabled}
                  value={content.sessionSummary ?? ""}
                  onChange={event =>
                    patch({ sessionSummary: event.target.value })
                  }
                />
              </label>
            </SummarySection>

            <SummarySection
              title="Key Insights"
              purpose={SUMMARY_SECTION_PURPOSE.keyInsights}
            >
              <InsightEditorList
                label="Insight"
                items={content.keyInsights}
                disabled={fieldsDisabled}
                onChange={(index, itemPatch) =>
                  patch({
                    keyInsights: updateInsightList(
                      content.keyInsights,
                      index,
                      itemPatch
                    ),
                  })
                }
                onAdd={() =>
                  patch({
                    keyInsights: [
                      ...content.keyInsights,
                      { title: "", description: "" },
                    ],
                  })
                }
                onRemove={index =>
                  patch({
                    keyInsights: content.keyInsights.filter(
                      (_, itemIndex) => itemIndex !== index
                    ),
                  })
                }
              />
            </SummarySection>

            <SummarySection
              title="Strengths Observed"
              purpose={SUMMARY_SECTION_PURPOSE.strengths}
            >
              <InsightEditorList
                label="Strength"
                items={content.strengths}
                disabled={fieldsDisabled}
                onChange={(index, itemPatch) =>
                  patch({
                    strengths: updateInsightList(
                      content.strengths,
                      index,
                      itemPatch
                    ),
                  })
                }
                onAdd={() =>
                  patch({
                    strengths: [
                      ...content.strengths,
                      { title: "", description: "" },
                    ],
                  })
                }
                onRemove={index =>
                  patch({
                    strengths: content.strengths.filter(
                      (_, itemIndex) => itemIndex !== index
                    ),
                  })
                }
              />
            </SummarySection>

            <SummarySection
              title="Development Evidence"
              purpose={SUMMARY_SECTION_PURPOSE.developmentEvidence}
            >
              <InsightEditorList
                label="Evidence"
                items={content.developmentEvidence}
                disabled={fieldsDisabled}
                onChange={(index, itemPatch) =>
                  patch({
                    developmentEvidence: updateInsightList(
                      content.developmentEvidence,
                      index,
                      itemPatch
                    ),
                  })
                }
                onAdd={() =>
                  patch({
                    developmentEvidence: [
                      ...content.developmentEvidence,
                      { title: "", description: "" },
                    ],
                  })
                }
                onRemove={index =>
                  patch({
                    developmentEvidence: content.developmentEvidence.filter(
                      (_, itemIndex) => itemIndex !== index
                    ),
                  })
                }
              />
              <label htmlFor="summary-evidence-qualification">
                Evidence qualification
                <textarea
                  id="summary-evidence-qualification"
                  rows={2}
                  disabled={fieldsDisabled}
                  value={content.evidenceQualification ?? ""}
                  onChange={event =>
                    patch({ evidenceQualification: event.target.value })
                  }
                />
              </label>
            </SummarySection>

            <SummarySection
              title="Management Context"
              purpose={SUMMARY_SECTION_PURPOSE.coachingContext}
            >
              <label htmlFor="summary-coaching-context">
                What the manager should remember next time
                <textarea
                  id="summary-coaching-context"
                  rows={4}
                  disabled={fieldsDisabled}
                  value={content.coachingContext ?? ""}
                  onChange={event =>
                    patch({ coachingContext: event.target.value })
                  }
                />
              </label>
            </SummarySection>

            <SummarySection
              title="Agreed Actions"
              purpose={SUMMARY_SECTION_PURPOSE.commitments}
            >
              <StringListEditor
                label="Action"
                items={content.commitments}
                disabled={fieldsDisabled}
                onChange={(index, value) =>
                  patch({
                    commitments: content.commitments.map((item, itemIndex) =>
                      itemIndex === index ? value : item
                    ),
                  })
                }
                onAdd={() =>
                  patch({ commitments: [...content.commitments, ""] })
                }
                onRemove={index =>
                  patch({
                    commitments: content.commitments.filter(
                      (_, itemIndex) => itemIndex !== index
                    ),
                  })
                }
              />
            </SummarySection>

            <SummarySection title="Next Focus">
              <StringListEditor
                label="Focus"
                items={content.possibleNextFocus}
                disabled={fieldsDisabled}
                onChange={(index, value) =>
                  patch({
                    possibleNextFocus: content.possibleNextFocus.map(
                      (item, itemIndex) => (itemIndex === index ? value : item)
                    ),
                  })
                }
                onAdd={() =>
                  patch({
                    possibleNextFocus: [...content.possibleNextFocus, ""],
                  })
                }
                onRemove={index =>
                  patch({
                    possibleNextFocus: content.possibleNextFocus.filter(
                      (_, itemIndex) => itemIndex !== index
                    ),
                  })
                }
              />
            </SummarySection>
          </>
        ) : (
          <>
            {content.sessionSummary ? (
              <SummarySection
                title="Conversation Summary"
                purpose={SUMMARY_SECTION_PURPOSE.sessionSummary}
              >
                <p>{content.sessionSummary}</p>
              </SummarySection>
            ) : null}

            {content.keyInsights.length > 0 ? (
              <SummarySection
                title="Key Insights"
                purpose={SUMMARY_SECTION_PURPOSE.keyInsights}
              >
                <div className="summary-insight-list">
                  {content.keyInsights.map((insight, index) => (
                    <SummaryInsightItem
                      key={`${insight.title}-${index}`}
                      title={insight.title}
                      description={insight.description}
                    />
                  ))}
                </div>
              </SummarySection>
            ) : null}

            {content.strengths.length > 0 ? (
              <SummarySection
                title="Strengths Observed"
                purpose={SUMMARY_SECTION_PURPOSE.strengths}
              >
                <div className="summary-insight-list">
                  {content.strengths.map((strength, index) => (
                    <SummaryInsightItem
                      key={`${strength.title}-${index}`}
                      title={strength.title}
                      description={strength.description}
                    />
                  ))}
                </div>
              </SummarySection>
            ) : null}

            {content.developmentEvidence.length > 0 ||
            content.evidenceQualification ? (
              <SummarySection
                title="Development Evidence"
                purpose={SUMMARY_SECTION_PURPOSE.developmentEvidence}
              >
                {content.developmentEvidence.length > 0 ? (
                  <div className="summary-insight-list">
                    {content.developmentEvidence.map((item, index) => (
                      <SummaryInsightItem
                        key={`${item.title}-${index}`}
                        title={item.title}
                        description={item.description}
                      />
                    ))}
                  </div>
                ) : null}

                {content.evidenceQualification ? (
                  <SummaryEvidenceNote>
                    {content.evidenceQualification}
                  </SummaryEvidenceNote>
                ) : null}
              </SummarySection>
            ) : null}

            {content.depthMode === "comprehensive" &&
            content.coachingContext ? (
              <SummarySection
                title="Management Context"
                purpose={SUMMARY_SECTION_PURPOSE.coachingContext}
              >
                <p>{content.coachingContext}</p>
              </SummarySection>
            ) : null}

            <SummarySection
              title="Agreed Actions"
              purpose={SUMMARY_SECTION_PURPOSE.commitments}
            >
              <SummaryCommitmentList commitments={content.commitments} />
            </SummarySection>

            {content.possibleNextFocus.length > 0 ? (
              <SummarySection
                title="Next Focus"
                purpose={SUMMARY_SECTION_PURPOSE.possibleNextFocus}
              >
                <ul className="summary-next-focus-list">
                  {content.possibleNextFocus.map((focus, index) => (
                    <li key={`${index}-${focus}`}>{focus}</li>
                  ))}
                </ul>
              </SummarySection>
            ) : null}

            {content.depthMode === "comprehensive" &&
            hasComprehensiveExtras(content.comprehensive) ? (
              <div
                className="summary-insights-comprehensive"
                data-testid="summary-comprehensive-block"
              >
                <p className="summary-insights-comprehensive__eyebrow">
                  Longitudinal development intelligence
                </p>

                {content.comprehensive?.developmentTrajectory ? (
                  <SummarySection title="Development Trajectory">
                    <p>{content.comprehensive.developmentTrajectory}</p>
                  </SummarySection>
                ) : null}

                {(content.comprehensive?.behaviouralPatterns?.length ?? 0) >
                0 ? (
                  <SummarySection title="Behavioural / Capability Patterns">
                    <div className="summary-insight-list">
                      {content.comprehensive!.behaviouralPatterns!.map(
                        (item, index) => (
                          <SummaryInsightItem
                            key={`${item.title}-${index}`}
                            title={item.title}
                            description={item.description}
                          />
                        )
                      )}
                    </div>
                  </SummarySection>
                ) : null}

                {content.comprehensive?.evidenceConfidenceNote ? (
                  <SummarySection title="Evidence Confidence">
                    <p>{content.comprehensive.evidenceConfidenceNote}</p>
                  </SummarySection>
                ) : null}

                {content.comprehensive?.evidenceCoverageNote ? (
                  <SummarySection title="Evidence Coverage">
                    <p>{content.comprehensive.evidenceCoverageNote}</p>
                  </SummarySection>
                ) : null}

                {(content.comprehensive?.contradictoryOrLimitedEvidence
                  ?.length ?? 0) > 0 ? (
                  <SummarySection title="Contradictory / Limited Evidence">
                    <ul className="summary-next-focus-list">
                      {content.comprehensive!.contradictoryOrLimitedEvidence!.map(
                        (item, index) => (
                          <li key={`${index}-${item}`}>{item}</li>
                        )
                      )}
                    </ul>
                  </SummarySection>
                ) : null}

                {(content.comprehensive?.developmentRisks?.length ?? 0) > 0 ? (
                  <SummarySection title="Development Risks">
                    <ul className="summary-next-focus-list">
                      {content.comprehensive!.developmentRisks!.map(
                        (item, index) => (
                          <li key={`${index}-${item}`}>{item}</li>
                        )
                      )}
                    </ul>
                  </SummarySection>
                ) : null}

                {content.comprehensive?.recommendedNextConversation ? (
                  <SummarySection title="Recommended Next Development Conversation">
                    <p>{content.comprehensive.recommendedNextConversation}</p>
                  </SummarySection>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </IdentityIntelligencePanel>
  );
}
