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
import { selectPrimaryPreviousCommitment } from "@/lib/preparation/commitment-selection";
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
  hasSavedPreparation?: boolean;
  isFirstSession?: boolean;
  coachingPurpose?: string | null;
  developmentDirection?: string | null;
  historicalContext?: Array<{ title: string; detail: string }>;
  relevantPatterns?: Array<{
    title: string;
    description: string;
    evidenceLabel?: string | null;
  }>;
  adapterPrimaryFocus?: string | null;
  adapterAreas?: string[];
  adapterQuestions?: string[];
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

/** Leftover first-session intake copy — not treated as deliberate coach authorship. */
export function looksLikeFirstSessionBoilerplate(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  return (
    /define a clear coaching purpose/i.test(text) ||
    /agree how progress will be recognised/i.test(text) ||
    /identify current (work-related )?priorities/i.test(text) ||
    /preferred ways of working/i.test(text) ||
    /immediate opportunities, challenges or decisions/i.test(text) ||
    /current responsibilities and priorities/i.test(text) ||
    /what would you most like this coaching space/i.test(text) ||
    /if this coaching relationship were valuable/i.test(text) ||
    /how would you like us to work together/i.test(text) ||
    /clarify what would make this conversation/i.test(text)
  );
}

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
  /** Adapter seeds used when coach-authored fields are empty. */
  adapterPrimaryFocus?: string | null;
  adapterAreas?: string[];
  adapterQuestions?: string[];
}): NormalisedPreparationBrief {
  const coachPurpose = input.initialPreparation.prepPurpose.trim();
  const coachFocus = input.initialPreparation.focus.trim();
  const storedFocus = coachPurpose || coachFocus;
  const focusIsBoilerplate = looksLikeFirstSessionBoilerplate(storedFocus);
  const coachAuthoredFocus = Boolean(
    storedFocus && (input.isFirstSession || !focusIsBoilerplate)
  );

  // Continuing relationships: do not let leftover first-session boilerplate
  // override the bounded Preparation adapter.
  const purposeSource = coachAuthoredFocus
    ? storedFocus
    : input.isFirstSession
      ? storedFocus ||
        input.adapterPrimaryFocus ||
        input.intelligence.suggestedFocus ||
        input.briefSummary
      : input.adapterPrimaryFocus ||
        input.intelligence.suggestedFocus ||
        (focusIsBoilerplate ? "" : storedFocus) ||
        input.briefSummary;

  const storedTopics = input.initialPreparation.prepTopics.trim();
  const topicLines = storedTopics
    ? storedTopics.split(/\n|;/).map(item => item.trim()).filter(Boolean)
    : [];
  const topicsAreBoilerplate =
    topicLines.length > 0 &&
    topicLines.every(line => looksLikeFirstSessionBoilerplate(line));
  const topicsSource =
    storedTopics && (input.isFirstSession || !topicsAreBoilerplate)
      ? storedTopics
      : (input.adapterAreas && input.adapterAreas.length > 0
          ? input.adapterAreas.join("\n")
          : "") ||
        input.focusTags.join("\n") ||
        input.suggestedTopics.join("\n");

  const storedQuestions = input.initialPreparation.prepQuestions.trim();
  const questionLines = storedQuestions
    ? storedQuestions.split(/\n\s*\n|\n/).map(item => item.trim()).filter(Boolean)
    : [];
  const questionsAreBoilerplate =
    questionLines.length > 0 &&
    questionLines.every(line => looksLikeFirstSessionBoilerplate(line));
  const questionsSource =
    storedQuestions && (input.isFirstSession || !questionsAreBoilerplate)
      ? storedQuestions
      : (input.adapterQuestions && input.adapterQuestions.length > 0
          ? input.adapterQuestions.join("\n\n")
          : "") ||
        input.suggestedQuestions.join("\n\n") ||
        input.intelligence.suggestedQuestions.join("\n\n");

  return normalisePreparationBrief({
    primaryFocus: purposeSource,
    areasToExplore: topicsSource,
    questions: questionsSource,
    previousCommitment:
      selectPrimaryPreviousCommitment(input.commitmentStatements) ||
      selectPrimaryPreviousCommitment(
        input.intelligence.outstandingCommitments.map(item => item.statement)
      ) ||
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
  hasSavedPreparation = false,
  isFirstSession = false,
  coachingPurpose = null,
  developmentDirection = null,
  historicalContext = [],
  relevantPatterns = [],
  adapterPrimaryFocus = null,
  adapterAreas = [],
  adapterQuestions = [],
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
        adapterPrimaryFocus,
        adapterAreas,
        adapterQuestions,
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
      adapterPrimaryFocus,
      adapterAreas,
      adapterQuestions,
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
    <div className="identity-prepare-workspace preparation-view preparation-view--simple">
      <header className="preparation-view__aurelia-intro">
        <p className="eyebrow">Prepare with {BRAND.intelligenceName}</p>
        <h2>Optional conversation preparation</h2>
        <p>
          {BRAND.intelligenceName} uses who this person is, recent evidence and
          open commitments. Review the brief, then start when ready.
        </p>
      </header>

      {error}

      <PreparationBrief
        brief={brief}
        mode={mode}
        refreshState={refreshState}
        hasApprovedEvidence={hasApprovedEvidence}
        hasSavedPreparation={hasSavedPreparation}
        onViewSources={onViewSources}
        onViewEvidenceProvenance={
          hasApprovedEvidence
            ? () => onOpenContext("preparation_brief")
            : undefined
        }
        onContinueWithExisting={
          refreshState === "failed" && hasSavedPreparation
            ? onContinueWithExisting
            : undefined
        }
      />

      <details className="preparation-view__optional">
        <summary>Refine preparation (optional)</summary>
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
      </details>

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
          {startBusy ? "Starting…" : "Start / Record Conversation"}
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
