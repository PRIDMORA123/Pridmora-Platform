import type { RefObject } from "react";
import type { PreparationIntelligenceViewModel } from "@/lib/preparation-intelligence";

function IntelligenceSummaryItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="prepare-intelligence-item">
      <small>{label}</small>
      <p>{value}</p>
    </div>
  );
}

export function PreparationIntelligenceStrip({
  intelligence,
  onViewBrief,
  briefButtonRef,
}: {
  intelligence: PreparationIntelligenceViewModel;
  onViewBrief: () => void;
  briefButtonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const previousSummary =
    intelligence.previousConversation?.summary ??
    "This is the first recorded conversation.";

  const commitmentText =
    intelligence.outstandingCommitments.length === 0
      ? "No unresolved commitments."
      : `${intelligence.outstandingCommitments.length} ${
          intelligence.outstandingCommitments.length === 1
            ? "commitment remains"
            : "commitments remain"
        } open.`;

  return (
    <section className="prepare-intelligence-strip">
      <div className="prepare-intelligence-title">
        <span aria-hidden="true" />

        <div>
          <p>Preparation intelligence</p>
          <small>Suggested from reviewed coaching evidence.</small>
        </div>
      </div>

      <div className="prepare-intelligence-summary">
        <IntelligenceSummaryItem
          label="Previous conversation"
          value={previousSummary}
        />

        <IntelligenceSummaryItem
          label="Outstanding actions"
          value={commitmentText}
        />

        <IntelligenceSummaryItem
          label="Possible focus"
          value={
            intelligence.suggestedFocus ??
            "Use the agreed coaching purpose to shape this conversation."
          }
        />
      </div>

      <button
        type="button"
        ref={briefButtonRef}
        className="identity-text-action"
        onClick={onViewBrief}
      >
        View preparation brief
      </button>
    </section>
  );
}

/** @deprecated Prefer PreparationIntelligenceStrip */
export const PrepareIntelligenceStrip = PreparationIntelligenceStrip;
