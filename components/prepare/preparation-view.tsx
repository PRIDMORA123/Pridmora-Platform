"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type { Session } from "@/lib/types";
import type {
  PreparationContextSection,
  PreparationFormValues,
  PreparationIntelligenceViewModel,
} from "@/lib/preparation-intelligence";
import type { PreparationStyle } from "@/lib/preparation-style";
import { preparationStyleToMode } from "@/lib/coaching-intelligence/mode";
import { getClientFirstName } from "@/lib/session/session-display";
import {
  normalisePreparationBrief,
  type NormalisedPreparationBrief,
} from "@/lib/prepare/normalise-preparation-brief";
import {
  PreparationApproachControl,
  type PreparationRefreshState,
} from "@/components/prepare/preparation-approach-control";
import { PreparationBrief } from "@/components/prepare/preparation-brief";
import { PreparationRefinement } from "@/components/prepare/preparation-refinement";
import { PreparationForm } from "@/components/prepare/preparation-form";
import { ManagerScenarioPicker } from "@/components/prepare/manager-scenario-picker";
import type { ManagerScenario } from "@/lib/manager-scenarios";
import { BRAND } from "@/lib/brand";

export type PreparationViewProps = {
  conversationId: string;
  clientName: string;
  intelligence: PreparationIntelligenceViewModel;
  initialPreparation: Pick<
    Session,
    | "prepPurpose"
    | "prepTopics"
    | "prepQuestions"
    | "prepRisks"
    | "prepPrivateNotes"
    | "focus"
  >;
  preparationStyle: PreparationStyle;
  defaultPreparationStyle?: PreparationStyle | null;
  refreshState: PreparationRefreshState;
  refreshUpdatedLabel?: string;
  briefSummary: string;
  focusTags: string[];
  commitmentStatements: string[];
  suggestedTopics?: string[];
  suggestedQuestions?: string[];
  supportingInsight?: string | null;
  hasApprovedEvidence?: boolean;
  isFirstSession?: boolean;
  coachingPurpose?: string | null;
  developmentDirection?: string | null;
  historicalContext?: Array<{ title: string; detail: string }>;
  relevantPatterns?: Array<{
    title: string;
    description: string;
    evidenceLabel?: string | null;
  }>;
  disabled?: boolean;
  showAiPreparation?: boolean;
  insertedNotice?: string;
  error?: ReactNode;
  viewContextButtonRef?: RefObject<HTMLButtonElement | null>;
  changeApproachButtonRef?: RefObject<HTMLButtonElement | null>;
  startBusy?: boolean;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  onSave: (values: PreparationFormValues) => Promise<void>;
  onValuesChange?: (values: PreparationFormValues) => void;
  onCancelRefinement?: () => void;
  onOpenContext: (
    section: PreparationContextSection,
    trigger?: HTMLElement | null
  ) => void;
  onViewSources?: () => void;
  onChangeApproach: () => void;
  onRefreshBrief?: () => void;
  onContinueWithExisting?: () => void;
  onStartSession: () => void;
};

function buildNormalisedBrief(input: {
  initialPreparation: PreparationViewProps["initialPreparation"];
  intelligence: PreparationIntelligenceViewModel;
  briefSummary: string;
  focusTags: string[];
  suggestedTopics: string[];
  suggestedQuestions: string[];
  commitmentStatements: string[];
  supportingInsight?: string | null;
  developmentDirection?: string | null;
  historicalContext: Array<{ title: string; detail: string }>;
  relevantPatterns: Array<{
    title: string;
    description: string;
    evidenceLabel?: string | null;
  }>;
  coachingPurpose?: string | null;
  clientName: string;
  mode: "manual" | "assisted" | "comprehensive";
  isFirstSession: boolean;
  hasApprovedEvidence: boolean;
}): NormalisedPreparationBrief {
  const topicsSource =
    input.initialPreparation.prepTopics.trim() ||
    input.focusTags.join("\n") ||
    input.suggestedTopics.join("\n");

  const questionsSource =
    input.initialPreparation.prepQuestions.trim() ||
    input.suggestedQuestions.join("\n\n") ||
    input.intelligence.suggestedQuestions.join("\n\n");

  const purposeSource =
    input.initialPreparation.prepPurpose.trim() ||
    input.initialPreparation.focus.trim() ||
    input.intelligence.suggestedFocus ||
    input.briefSummary;

  return normalisePreparationBrief({
    primaryFocus: purposeSource,
    areasToExplore: topicsSource,
    questions: questionsSource,
    previousCommitment:
      input.commitmentStatements[0] ||
      input.intelligence.outstandingCommitments[0]?.statement ||
      null,
    relevantPatterns: input.relevantPatterns,
    developmentDirection:
      input.developmentDirection || input.supportingInsight || null,
    historicalContext: input.historicalContext,
    coachingPurpose: input.coachingPurpose || purposeSource,
    clientFirstName: getClientFirstName(input.clientName),
    mode: input.mode,
    isFirstSession: input.isFirstSession,
    hasApprovedEvidence: input.hasApprovedEvidence,
  });
}

/**
 * Canonical Prepare canvas: approach → briefing → refinement → primary action.
 */
export function PreparationView({
  conversationId,
  clientName,
  intelligence,
  initialPreparation,
  preparationStyle,
  defaultPreparationStyle = null,
  refreshState,
  refreshUpdatedLabel,
  briefSummary,
  focusTags,
  commitmentStatements,
  suggestedTopics = [],
  suggestedQuestions = [],
  supportingInsight = null,
  hasApprovedEvidence = false,
  isFirstSession = false,
  coachingPurpose = null,
  developmentDirection = null,
  historicalContext = [],
  relevantPatterns = [],
  disabled = false,
  showAiPreparation = true,
  insertedNotice,
  error,
  changeApproachButtonRef,
  startBusy = false,
  secondaryActionLabel,
  onSecondaryAction,
  onSave,
  onValuesChange,
  onCancelRefinement,
  onOpenContext,
  onViewSources,
  onChangeApproach,
  onRefreshBrief,
  onContinueWithExisting,
  onStartSession,
}: PreparationViewProps) {
  const refinementPanelId = useId();
  const refinementSectionRef = useRef<HTMLDivElement | null>(null);
  const shouldFocusRefinementRef = useRef(false);
  const [refinementOpen, setRefinementOpen] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [scenarioNotice, setScenarioNotice] = useState<string>("");
  const mode = preparationStyleToMode(preparationStyle);

  const handleScenarioSelect = useCallback(
    (scenario: ManagerScenario) => {
      setSelectedScenarioId(scenario.id);
      const notice =
        scenario.sensitivity === "elevated"
          ? `${BRAND.intelligenceName} can support preparation and reflection for this situation. She does not provide HR, legal, disciplinary or clinical advice.`
          : `${BRAND.intelligenceName} will use this scenario to shape preparation questions and focus.`;
      setScenarioNotice(notice);
      onValuesChange?.({
        purpose: scenario.focusPrompt,
        topics: initialPreparation.prepTopics,
        questions: initialPreparation.prepQuestions,
        desiredOutcome: initialPreparation.prepRisks,
        privateNotes: initialPreparation.prepPrivateNotes,
      });
    },
    [initialPreparation, onValuesChange]
  );

  const brief = useMemo(
    () =>
      buildNormalisedBrief({
        initialPreparation,
        intelligence,
        briefSummary,
        focusTags,
        suggestedTopics,
        suggestedQuestions,
        commitmentStatements,
        supportingInsight,
        developmentDirection,
        historicalContext,
        relevantPatterns,
        coachingPurpose,
        clientName,
        mode,
        isFirstSession,
        hasApprovedEvidence,
      }),
    [
      initialPreparation,
      intelligence,
      briefSummary,
      focusTags,
      suggestedTopics,
      suggestedQuestions,
      commitmentStatements,
      supportingInsight,
      developmentDirection,
      historicalContext,
      relevantPatterns,
      coachingPurpose,
      clientName,
      mode,
      isFirstSession,
      hasApprovedEvidence,
    ]
  );

  const handleRefinementOpenChange = useCallback((open: boolean) => {
    if (open) {
      shouldFocusRefinementRef.current = true;
    }
    setRefinementOpen(open);
  }, []);

  useEffect(() => {
    if (!refinementOpen || !shouldFocusRefinementRef.current) return;
    shouldFocusRefinementRef.current = false;
    const section = refinementSectionRef.current;
    if (section && typeof section.scrollIntoView === "function") {
      section.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    const focusTimer = window.setTimeout(() => {
      const firstField = section?.querySelector<HTMLElement>(
        "textarea, input, select, button:not(.preparation-refinement__toggle)"
      );
      firstField?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [refinementOpen]);

  const isRefreshing = refreshState === "refreshing";
  const needsRefresh = refreshState === "update_available";

  return (
    <div className="identity-prepare-workspace preparation-view">
      <ManagerScenarioPicker
        compact
        selectedId={selectedScenarioId}
        onSelect={handleScenarioSelect}
      />

      {scenarioNotice ? (
        <p className="aurelia-scenario-nudge" role="status">
          {scenarioNotice}
        </p>
      ) : null}

      <PreparationApproachControl
        value={preparationStyle}
        defaultValue={defaultPreparationStyle}
        scope="relationship"
        needsRefresh={needsRefresh}
        isRefreshing={isRefreshing}
        refreshState={refreshState}
        updatedLabel={refreshUpdatedLabel}
        disabled={disabled}
        changeButtonRef={changeApproachButtonRef}
        onChangeApproach={onChangeApproach}
        onRefresh={
          showAiPreparation && onRefreshBrief ? onRefreshBrief : undefined
        }
      />

      {error}

      <PreparationBrief
        brief={brief}
        mode={mode}
        refreshState={refreshState}
        hasApprovedEvidence={hasApprovedEvidence}
        onViewSources={onViewSources}
        onViewEvidenceProvenance={
          hasApprovedEvidence
            ? () => onOpenContext("preparation_brief")
            : undefined
        }
        onContinueWithExisting={
          refreshState === "failed" ? onContinueWithExisting : undefined
        }
      />

      <div ref={refinementSectionRef}>
        <PreparationRefinement
          open={refinementOpen}
          onOpenChange={handleRefinementOpenChange}
          panelId={refinementPanelId}
        >
          <PreparationForm
            conversationId={conversationId}
            initialPreparation={initialPreparation}
            intelligence={intelligence}
            suggestedTopics={suggestedTopics}
            disabled={disabled}
            insertedNotice={insertedNotice}
            refinementMode
            onValuesChange={onValuesChange}
            onSave={async values => {
              await onSave(values);
              setRefinementOpen(false);
            }}
            onCancel={() => {
              onCancelRefinement?.();
              setRefinementOpen(false);
            }}
          />
        </PreparationRefinement>
      </div>

      <div className="preparation-view__actions">
        <button
          type="button"
          className="identity-button is-primary identity-button--primary"
          disabled={disabled || startBusy}
          onClick={onStartSession}
        >
          {startBusy ? "Starting…" : "Start conversation"}
        </button>
        {secondaryActionLabel && onSecondaryAction ? (
          <button
            type="button"
            className="identity-button is-secondary identity-button--secondary"
            onClick={onSecondaryAction}
            disabled={startBusy}
          >
            {secondaryActionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
