"use client";

import { IdentityIntelligencePanel } from "@/components/identity-intelligence";
import { SummaryCommitmentList } from "@/components/summary-insights/summary-commitment-list";
import { SummaryEvidenceNote } from "@/components/summary-insights/summary-evidence-note";
import { SummaryInsightItem } from "@/components/summary-insights/summary-insight-item";
import { SummarySection } from "@/components/summary-insights/summary-section";
import type {
  SummaryInsightItem as InsightItem,
  SummaryInsightsContent,
} from "@/lib/summary-insights/types";
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
    return "Approved coaching record · Supported by approved coaching evidence";
  }
  if (status === "draft") {
    return "Draft · Supported by approved coaching evidence";
  }
  return "Supported by approved coaching evidence";
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
      <p className="summary-insights-panel__title">Session Summary & Insights</p>
      <div
        className={`summary-insights-content${editing ? " is-editing" : ""}`}
        data-mode={editing ? "edit" : "read"}
      >
        {editing ? (
          <>
            <SummarySection title="Session Summary">
              <label htmlFor="summary-session-summary">
                Session summary
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

            <SummarySection title="Key Insights">
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

            <SummarySection title="Strengths Observed">
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

            <SummarySection title="Development Evidence">
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

            <SummarySection title="Coaching Context">
              <label htmlFor="summary-coaching-context">
                Coaching context
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

            <SummarySection title="Agreed Commitments">
              <StringListEditor
                label="Commitment"
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

            <SummarySection title="Possible Next Focus">
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
              <SummarySection title="Session Summary">
                <p>{content.sessionSummary}</p>
              </SummarySection>
            ) : null}

            {content.keyInsights.length > 0 ? (
              <SummarySection title="Key Insights">
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
              <SummarySection title="Strengths Observed">
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
              <SummarySection title="Development Evidence">
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

            {content.coachingContext ? (
              <SummarySection title="Coaching Context">
                <p>{content.coachingContext}</p>
              </SummarySection>
            ) : null}

            <SummarySection title="Agreed Commitments">
              <SummaryCommitmentList commitments={content.commitments} />
            </SummarySection>

            {content.possibleNextFocus.length > 0 ? (
              <SummarySection title="Possible Next Focus">
                <ul className="summary-next-focus-list">
                  {content.possibleNextFocus.map((focus, index) => (
                    <li key={`${index}-${focus}`}>{focus}</li>
                  ))}
                </ul>
              </SummarySection>
            ) : null}
          </>
        )}
      </div>
    </IdentityIntelligencePanel>
  );
}
