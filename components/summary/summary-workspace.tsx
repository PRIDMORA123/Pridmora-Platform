"use client";

import { useEffect, useState } from "react";
import type { Session, SummaryStatus } from "@/lib/types";
import { IntelligenceModeIndicator } from "@/components/coaching-intelligence/intelligence-mode-indicator";
import { ActionButton } from "@/components/feedback/action-button";
import { SaveStatus } from "@/components/feedback/save-status";
import { PageSectionHeading } from "@/components/layout/page-section-heading";
import { EmergingEvidenceState } from "@/components/journey/emerging-evidence-state";
import {
  IdentityApprovedRecord,
  IdentityIntelligencePanel,
} from "@/components/identity-intelligence";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { IDENTITY_EMPTY_STATES } from "@/lib/identity-empty-states";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import { resolveProductLanguage } from "@/lib/role-language";
import { SUMMARY_STATUS_LABELS } from "@/lib/session-workflow";
import { toActionButtonStatus } from "@/types/action-feedback";
import type {
  CoachingIntelligenceMode,
  IntelligenceSource,
} from "@/types/coaching-intelligence";
import type {
  SummaryFields,
  SummaryWorkspaceViewModel,
} from "@/types/summary-workspace";
import { SessionPatternInsightBanner } from "@/components/patterns/pattern-panels";
import "@/app/workspace-refinement.css";

function SummaryStatusBanner({
  status,
  reviewedLabel,
}: {
  status: SummaryStatus;
  reviewedLabel: string;
}) {
  if (status === "approved") {
    return (
      <IdentityApprovedRecord title="Session summary">
        <p>This summary has been {reviewedLabel} and approved.</p>
      </IdentityApprovedRecord>
    );
  }

  if (status === "draft") {
    return (
      <IdentityIntelligencePanel
        level="insight"
        title="Summary draft"
        reviewState="draft"
        evidenceLabel="AI may assist with a draft. Only you can approve it."
        compact
      >
        <p>
          {SUMMARY_STATUS_LABELS[status]}. Review each section before approving.
        </p>
      </IdentityIntelligencePanel>
    );
  }

  return (
    <div className={`summary-status-banner is-${status}`} role="status">
      <strong>{SUMMARY_STATUS_LABELS[status]}</strong>
      <span>
        Generate a draft when the conversation evidence is ready for review.
      </span>
    </div>
  );
}

function ReviewCheck({ label }: { label: string }) {
  return (
    <label className="summary-review-check">
      <input type="checkbox" />
      <span>{label}</span>
    </label>
  );
}

function SummaryEditorSection({
  eyebrow,
  title,
  description,
  value,
  minHeight = 130,
  disabled,
  onChange,
}: {
  eyebrow: string;
  title: string;
  description: string;
  value: string;
  minHeight?: number;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const fieldId = `summary-${title.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <section className="summary-editor-section">
      <p>{eyebrow}</p>
      <h2>
        <label htmlFor={fieldId}>{title}</label>
      </h2>
      <span>{description}</span>

      <textarea
        id={fieldId}
        value={value}
        disabled={disabled}
        style={{ minHeight }}
        onChange={event => onChange(event.target.value)}
      />
    </section>
  );
}

export function buildSummaryViewModel(
  session: Session
): SummaryWorkspaceViewModel {
  return {
    relationshipId: session.clientId,
    conversationId: session.id,
    clientName: "",
    status: session.summaryStatus,
    summary: {
      sessionSummary: session.summary,
      keyThemes: session.emergingThemes,
      outcomes: session.outcomes,
      agreedActions: session.agreedActions || session.commitments,
    },
  };
}

export function SummaryWorkspace({
  initialData,
  readOnly = false,
  intelligenceMode = "assisted",
  usedSources = [],
  lastRefreshedAt = null,
  patternInsight = null,
  onGenerate,
  onSaveDraft,
  onApprove,
}: {
  initialData: SummaryWorkspaceViewModel;
  readOnly?: boolean;
  intelligenceMode?: CoachingIntelligenceMode;
  usedSources?: IntelligenceSource[];
  lastRefreshedAt?: string | null;
  patternInsight?: { text: string; kind: "reinforces" | "weakens" | "emerging" | "insufficient" } | null;
  onGenerate: () => Promise<SummaryFields | null>;
  onSaveDraft: (summary: SummaryFields) => Promise<void>;
  onApprove: (summary: SummaryFields) => Promise<void>;
}) {
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);
  const [summary, setSummary] = useState(initialData.summary);
  const [status, setStatus] = useState(initialData.status);
  const { feedback, isLoading, markUnsaved, runAction, reset } =
    useActionFeedback();

  useEffect(() => {
    setSummary(initialData.summary);
    setStatus(initialData.status);
    reset();
    // Re-seed when conversation or approval status changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData.conversationId, initialData.status]);

  function updateField(field: keyof SummaryFields, value: string) {
    setSummary(current => ({ ...current, [field]: value }));
    if (status === "approved") setStatus("draft");
    markUnsaved();
  }

  async function generateSummary() {
    const generated = await runAction(() => onGenerate(), {
      loadingMessage: "Reviewing conversation evidence…",
      successMessage: "Draft summary created",
      errorMessage: "Unable to create summary",
    });

    if (generated) {
      setSummary(generated);
      setStatus("draft");
    }
  }

  async function saveDraft() {
    await runAction(() => onSaveDraft(summary), {
      loadingMessage: "Saving draft…",
      successMessage: "Draft saved",
      errorMessage: "Unable to save draft",
    });
    setStatus("draft");
  }

  async function approveSummary() {
    await runAction(() => onApprove(summary), {
      loadingMessage: "Approving summary…",
      successMessage: "Summary approved",
      errorMessage: "Unable to approve summary",
    });
    setStatus("approved");
  }

  const hasSummary = summary.sessionSummary.trim().length > 0;

  return (
    <main className="summary-workspace-page">
      <PageSectionHeading
        eyebrow="Conversation record"
        title="Review the session summary"
        description="AI may prepare a draft, but only you can review and approve it."
        actions={
          <>
            <IntelligenceModeIndicator
              mode={intelligenceMode}
              usedSources={usedSources}
              lastRefreshedAt={lastRefreshedAt}
            />
            <ActionButton
              variant="secondary"
              status={
                feedback.status === "loading" &&
                feedback.message?.includes("Reviewing")
                  ? "loading"
                  : "idle"
              }
              idleLabel="Generate draft"
              loadingLabel="Generating…"
              successLabel="Draft created"
              errorLabel="Try again"
              onClick={() => void generateSummary()}
              disabled={readOnly || isLoading}
            />
          </>
        }
      />

      <SummaryStatusBanner
        status={status}
        reviewedLabel={
          organisation?.professionalRole === "manager"
            ? "manager-reviewed"
            : organisation?.professionalRole === "coach"
              ? "coach-reviewed"
              : "practitioner-reviewed"
        }
      />

      {patternInsight ? (
        <SessionPatternInsightBanner
          text={patternInsight.text}
          kind={patternInsight.kind}
        />
      ) : null}

      {!hasSummary ? (
        <div style={{ marginTop: 18 }}>
          <EmergingEvidenceState
            title={IDENTITY_EMPTY_STATES.noSummary.title}
            description={IDENTITY_EMPTY_STATES.noSummary.description}
          />
        </div>
      ) : null}

      <div className="summary-workspace-grid">
        <section className="summary-editor-card">
          <SummaryEditorSection
            eyebrow="Overview"
            title="Session summary"
            description="A concise account of the conversation and its significance."
            value={summary.sessionSummary}
            minHeight={200}
            disabled={readOnly}
            onChange={value => updateField("sessionSummary", value)}
          />

          <SummaryEditorSection
            eyebrow="Patterns"
            title="Key themes"
            description="The important themes that emerged without overstating certainty."
            value={summary.keyThemes}
            disabled={readOnly}
            onChange={value => updateField("keyThemes", value)}
          />

          <SummaryEditorSection
            eyebrow="Movement"
            title="Outcomes"
            description="What became clearer, changed or was decided during the conversation."
            value={summary.outcomes}
            disabled={readOnly}
            onChange={value => updateField("outcomes", value)}
          />

          <SummaryEditorSection
            eyebrow="Next steps"
            title="Agreed actions"
            description={`Specific commitments agreed with the ${language.personSingular}.`}
            value={summary.agreedActions}
            disabled={readOnly}
            onChange={value => updateField("agreedActions", value)}
          />
        </section>

        <aside className="summary-review-panel">
          <h2>Review before approval</h2>

          <ReviewCheck label={language.personNameConfirmLabel} />
          <ReviewCheck label="Claims are supported by evidence" />
          <ReviewCheck
            label={`Private ${language.notesLabel.toLowerCase()} are excluded`}
          />
          <ReviewCheck label="Actions reflect the conversation" />

          <div className="summary-review-panel__notice">
            Approval confirms that you have reviewed the summary and are
            satisfied it accurately represents the conversation.
          </div>
        </aside>
      </div>

      <footer className="summary-action-bar">
        <SaveStatus feedback={feedback} />

        <ActionButton
          variant="secondary"
          status={toActionButtonStatus(feedback.status)}
          idleLabel="Save draft"
          loadingLabel="Saving…"
          successLabel="Draft saved"
          errorLabel="Try again"
          onClick={() => void saveDraft()}
          disabled={readOnly || isLoading}
        />

        <ActionButton
          status={toActionButtonStatus(feedback.status)}
          idleLabel="Approve summary"
          loadingLabel="Approving…"
          successLabel="Approved"
          errorLabel="Try again"
          onClick={() => void approveSummary()}
          disabled={!hasSummary || readOnly || isLoading}
        />
      </footer>
    </main>
  );
}
