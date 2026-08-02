"use client";

import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Client, CoachingAction, Session } from "@/lib/types";
import { isClientArchived } from "@/lib/types";
import {
  canCompleteSession,
  formatSessionDateTime,
  overviewPrimaryAction,
  preparationCompletionLabel,
  previousCompletedSession,
  SESSION_STATUS_LABELS,
  SUMMARY_STATUS_LABELS,
  type SessionWorkspaceStage,
  unresolvedActionsForPreparation,
} from "@/lib/session-workflow";
import {
  deriveCurrentWorkflowStage,
  deriveSessionStageCompletion,
  hasDebriefEvidence,
  unavailableStageExplanation,
  workspaceStageFromWorkflow,
  workflowStageFromWorkspace,
  type SessionWorkflowStage,
} from "@/lib/session/session-workflow";
import { guardWorkflowTransition } from "@/lib/session/session-guards";
import {
  runCreateSummaryInsightsFlow,
  shouldResetWorkspaceStage,
  type CreateSummaryInsightsPhase,
} from "@/lib/session/create-summary-insights-flow";
import { parseDraftSummary } from "@/lib/sessions";
import {
  apiJson,
  AuthRequiredError,
  errorMessage,
  isNetworkFetchError,
  NETWORK_ERROR_MESSAGE,
  serialiseError,
} from "@/lib/api-client";
import { ApiRequestError } from "@/lib/api-failure";
import { BRAND } from "@/lib/brand";
import { buildCoachWorkspaceViewModel } from "@/lib/coach-workspace";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  ScheduleSessionDialog,
  type ScheduleSessionValues,
} from "@/components/schedule-session-dialog";
import { LiveSessionWorkspace } from "@/components/coach/live-session-workspace";
import { ActionButton } from "@/components/feedback/action-button";
import { SaveStatus } from "@/components/feedback/save-status";
import { useToast } from "@/components/feedback/toast-provider";
import { IdentityProcessingState } from "@/components/identity/identity-processing-state";
import {
  SessionDebriefForm,
  applyDebriefValuesToSession,
  type SessionDebriefValues,
} from "@/components/reflect/session-debrief-form";
import { SessionSummaryReview } from "@/components/summary/session-summary-review";
import { SessionNextSteps } from "@/components/actions/session-next-steps";
import { JourneyStagePage } from "@/components/coaching-journey/journey-stage-page";
import { RelationshipIdentityBar } from "@/components/coaching-journey/relationship-identity-bar";
import { StageOrientation } from "@/components/coaching-journey/stage-orientation";
import { JourneyNextStep } from "@/components/coaching-journey/journey-next-step";
import { SessionErrorMessage } from "@/components/session/session-error-message";
import type { ClientWorkspaceTab } from "@/components/client-workspace-tabs";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { toActionButtonStatus } from "@/types/action-feedback";
import type { CoachingIntelligenceMode } from "@/types/coaching-intelligence";
import type { SummaryFields } from "@/types/summary-workspace";
import {
  SESSION_NOTES_LIVE_DESCRIPTION,
  SESSION_NOTES_OUTCOME_COPY,
  STAGE_ORIENTATION_COPY,
} from "@/lib/coaching-journey";
import { getSessionDisplayTitle } from "@/lib/session/session-display";
import type { SessionModuleId } from "@/lib/relationship-workspace";
import "@/components/coach/coach-workspace.css";

const JOURNEY_STAGE: SessionWorkspaceStage = "overview";

function cloneSession(session: Session): Session {
  return { ...session, coachingQuestions: [...session.coachingQuestions] };
}

function sessionsEqual(a: Session, b: Session): boolean {
  const keys = Object.keys(a) as Array<keyof Session>;
  return keys.every(key => {
    const left = a[key];
    const right = b[key];
    if (Array.isArray(left) && Array.isArray(right)) {
      return JSON.stringify(left) === JSON.stringify(right);
    }
    return left === right;
  });
}

export function SessionWorkspace({
  client,
  session: initialSession,
  initialStage = null,
  flashMessage = "",
  coachingIntelligenceMode,
  onBack,
  onSave,
  onSaveAction,
  onScheduleNext,
  onReturnOverview,
  onReviewDevelopmentUpdate,
  onOpenSessionModule,
  onTabChange,
}: {
  client: Client;
  session: Session;
  /** Preferred workspace stage from Relationship Canvas module navigation. */
  initialStage?: SessionWorkspaceStage | null;
  flashMessage?: string;
  coachingIntelligenceMode?: CoachingIntelligenceMode;
  onBack: () => void;
  onSave: (session: Session) => Promise<Session | void>;
  onSaveAction: (action: CoachingAction & { clientId: string }) => Promise<CoachingAction>;
  onScheduleNext: (values: ScheduleSessionValues) => Promise<void>;
  onReturnOverview?: () => void;
  onPrepareNext?: () => void;
  onReviewDevelopmentUpdate?: (updateId: string) => void;
  /** Keep parent module focus aligned after in-workspace navigation. */
  onOpenSessionModule?: (
    sessionId: string,
    moduleId: SessionModuleId
  ) => void;
  onTabChange?: (tab: ClientWorkspaceTab) => void;
}) {
  void coachingIntelligenceMode;
  const archived = isClientArchived(client);
  const [session, setSession] = useState(() => cloneSession(initialSession));
  const [savedSnapshot, setSavedSnapshot] = useState(() => cloneSession(initialSession));
  const [stage, setStage] = useState<SessionWorkspaceStage>(() =>
    initialStage ??
    workspaceStageFromWorkflow(deriveCurrentWorkflowStage(initialSession))
  );
  const stageNavRef = useRef({
    sessionId: initialSession.id,
    initialStage: initialStage ?? null,
  });
  const {
    feedback,
    isLoading,
    runAction,
    reset: resetFeedback,
  } = useActionFeedback();
  const { showToast } = useToast();
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(flashMessage);
  const [readOnlyOverride, setReadOnlyOverride] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedulePromptOpen, setSchedulePromptOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [generatingUpdate, setGeneratingUpdate] = useState(false);
  const [generatedUpdateId, setGeneratedUpdateId] = useState<string | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [updateFailed, setUpdateFailed] = useState(false);
  const [updateOutcome, setUpdateOutcome] = useState<
    "idle" | "ready_for_review" | "no_meaningful_change" | "failed" | "network"
  >("idle");
  const [updateNotice, setUpdateNotice] = useState("");
  const [retryUpdateKey, setRetryUpdateKey] = useState(0);
  const createSummaryLockRef = useRef(false);
  const dirty = useMemo(() => !sessionsEqual(session, savedSnapshot), [session, savedSnapshot]);
  const readOnly =
    (session.status === "completed" && !readOnlyOverride) || archived;

  // Sync persisted session evidence into local state when the parent updates.
  // Do NOT reset the active stage here — that caused Create Summary & Insights
  // to bounce back to Capture outcome after notes/summary saves.
  useEffect(() => {
    setSession(cloneSession(initialSession));
    setSavedSnapshot(cloneSession(initialSession));
    setReadOnlyOverride(false);
  }, [
    initialSession.id,
    initialSession.lastUpdated,
    initialSession.notesSavedAt,
    initialSession.summaryStatus,
    initialSession.summary,
    initialSession.notes,
    initialSession.reflectWhatSurprised,
    initialSession.commitments,
  ]);

  // Apply stage only on intentional session/module navigation.
  useEffect(() => {
    const previous = stageNavRef.current;
    const nextInitial = initialStage ?? null;
    const shouldReset = shouldResetWorkspaceStage({
      previousSessionId: previous.sessionId,
      nextSessionId: initialSession.id,
      previousInitialStage: previous.initialStage,
      nextInitialStage: nextInitial,
    });
    stageNavRef.current = {
      sessionId: initialSession.id,
      initialStage: nextInitial,
    };
    if (!shouldReset) return;
    setStage(
      nextInitial ??
        workspaceStageFromWorkflow(deriveCurrentWorkflowStage(initialSession))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only session/module navigation
  }, [initialSession.id, initialStage]);

  useEffect(() => {
    setFlash(flashMessage);
  }, [flashMessage]);

  useEffect(() => {
    if (!dirty || stage === "coach") return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, stage]);

  const previous = previousCompletedSession(client.sessions, session);
  const outstanding = unresolvedActionsForPreparation(client, session.id);
  const sessionActions = client.actions.filter(action => action.sessionId === session.id);
  const primary = overviewPrimaryAction(session);

  async function persistSession(next: Session): Promise<Session> {
    try {
      const result = await onSave(next);
      const saved = result ? cloneSession(result) : cloneSession(next);
      setSession(saved);
      setSavedSnapshot(saved);
      return saved;
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        window.location.assign("/auth/sign-in?next=/?view=dashboard");
      }
      throw err;
    }
  }

  async function persist(
    next: Session,
    options: {
      loadingMessage?: string;
      successMessage?: string;
      errorMessage?: string;
      toastTitle?: string;
      toastErrorTitle?: string;
      toastErrorDescription?: string;
      silent?: boolean;
    } = {}
  ): Promise<Session | null> {
    if (isLoading && !options.silent) return null;

    setError("");

    if (options.silent) {
      try {
        return await persistSession(next);
      } catch (err) {
        setError(errorMessage(err, options.errorMessage ?? "Unable to save"));
        throw err;
      }
    }

    return runAction(
      async () => persistSession(next),
      {
        loadingMessage: options.loadingMessage ?? "Saving…",
        successMessage: options.successMessage ?? "Saved",
        errorMessage: options.errorMessage ?? "Unable to save",
        onSuccess: () => {
          if (options.toastTitle || options.successMessage) {
            setFlash(options.successMessage ?? options.toastTitle ?? "Saved");
            showToast({
              type: "success",
              title: options.toastTitle ?? options.successMessage ?? "Saved",
            });
          }
        },
        onError: err => {
          if (err instanceof AuthRequiredError) return;
          console.error("Session save failed", {
            operation: "session_save",
            sessionId: next.id,
            relationshipId: next.clientId,
            status: next.status,
            ...serialiseError(err),
          });
          setError(
            errorMessage(err, options.errorMessage ?? "Unable to save. Please try again.")
          );
          showToast({
            type: "error",
            title: options.toastErrorTitle ?? "Changes could not be saved",
            description:
              options.toastErrorDescription ??
              "Your changes remain on screen. Please try again.",
            durationMs: 5000,
          });
        },
      }
    );
  }

  const workflowStage =
    workflowStageFromWorkspace(stage) ?? deriveCurrentWorkflowStage(session);
  const stageCompletion = deriveSessionStageCompletion(session);

  function requestWorkflowStageChange(next: SessionWorkflowStage) {
    const nextWorkspace = workspaceStageFromWorkflow(next);
    if (nextWorkspace === stage) return;

    const guard = guardWorkflowTransition({
      from: workflowStage,
      to: next,
      session,
    });

    if (!guard.ok) {
      setError(guard.reason || unavailableStageExplanation(next));
      return;
    }

    if (dirty && stage !== "coach") {
      const leave = window.confirm(
        "You have unsaved changes. Leave this stage without saving?"
      );
      if (!leave) return;
      setSession(cloneSession(savedSnapshot));
      resetFeedback();
    }

    setError("");
    setStage(nextWorkspace);
  }

  function requestStageChange(next: SessionWorkspaceStage) {
    if (next === JOURNEY_STAGE) {
      if (dirty) {
        const leave = window.confirm(
          "You have unsaved changes. Leave this stage without saving?"
        );
        if (!leave) return;
        setSession(cloneSession(savedSnapshot));
        resetFeedback();
      }
      setStage(JOURNEY_STAGE);
      return;
    }

    const workflow = workflowStageFromWorkspace(next);
    if (!workflow) {
      setStage(next);
      return;
    }
    requestWorkflowStageChange(workflow);
  }

  async function handleStartOrContinue() {
    if (isLoading) return;
    setStage("coach");
  }

  function handleCoachSessionUpdated(next: Session) {
    const saved = cloneSession(next);
    setSession(saved);
    setSavedSnapshot(saved);
    resetFeedback();
  }

  async function persistCoachSession(next: Session): Promise<Session> {
    const result = await onSave(next);
    const saved = result ? cloneSession(result) : cloneSession(next);
    handleCoachSessionUpdated(saved);
    return saved;
  }

  async function handleSaveDebrief(values: SessionDebriefValues) {
    const next = applyDebriefValuesToSession(session, values);
    setSession(next);
    const saved = await persist(next, {
      silent: true,
      errorMessage: "Unable to save debrief",
    });
    return saved ?? next;
  }

  async function handleCreateSummaryFromDebrief(
    values: SessionDebriefValues,
    options?: { onPhase?: (phase: CreateSummaryInsightsPhase) => void }
  ): Promise<boolean> {
    if (createSummaryLockRef.current || isLoading) return false;
    if (!session.id) {
      throw new Error(
        "Cannot create Summary & Insights without a session ID."
      );
    }

    const selectedSessionId = session.id;
    createSummaryLockRef.current = true;
    setError("");

    try {
      let savedSession: Session | null = null;

      const result = await runCreateSummaryInsightsFlow({
        relationshipId: client.id,
        sessionId: selectedSessionId,
        onPhase: options?.onPhase,
        saveNotes: async () => {
          const saved = await handleSaveDebrief(values);
          if (!saved?.id) {
            throw new Error("Session notes save did not return a session ID.");
          }
          if (saved.id !== selectedSessionId) {
            throw new Error(
              "Session notes were saved to a different session than the one selected."
            );
          }
          savedSession = saved;
          return { id: saved.id };
        },
        generateSummary: async sessionId => {
          if (sessionId !== selectedSessionId) {
            throw new Error(
              "Summary generation session ID does not match the selected session."
            );
          }
          if (!savedSession || savedSession.id !== sessionId) {
            throw new Error(
              "Cannot generate Summary & Insights before notes are saved for this session."
            );
          }
          const fields = await handleGenerateSummary(savedSession);
          if (!fields) {
            throw new Error("Summary generation did not complete");
          }
          return fields;
        },
      });

      if (!result.ok) {
        if (result.reason === "save_failed") {
          throw Object.assign(
            new Error(
              "Session notes could not be saved. Your text remains available."
            ),
            { code: "save_failed", cause: result.error }
          );
        }
        throw Object.assign(
          new Error(
            "Summary & Insights could not be created. Your session notes remain saved and unchanged."
          ),
          { code: "generate_failed", cause: result.error }
        );
      }

      options?.onPhase?.("opening");
      setStage("summary");
      // Align parent focus so later opens keep Summary & Insights for this session.
      onOpenSessionModule?.(result.sessionId, "identity_intelligence");
      return true;
    } finally {
      createSummaryLockRef.current = false;
    }
  }

  async function handleGenerateSummary(
    sourceSession: Session = session
  ): Promise<SummaryFields | null> {
    setError("");

    // Private coach notes are excluded from the AI payload.
    const debriefEvidence = [
      sourceSession.reflectWhatSurprised,
      sourceSession.reflectWhatShifted,
      sourceSession.reflectWhatWorked,
      sourceSession.reflectDifferently,
      sourceSession.notes,
      sourceSession.commitments,
    ]
      .map(value => value.trim())
      .filter(Boolean)
      .join("\n\n");

    try {
      const data = await apiJson<{
        summary?: string;
        sections?: ReturnType<typeof parseDraftSummary>;
        structuredContent?: {
          sessionSummary?: string | null;
          keyInsights?: Array<{ title: string; description: string }>;
          strengths?: Array<{ title: string; description: string }>;
          developmentEvidence?: Array<{ title: string; description: string }>;
          coachingContext?: string | null;
          commitments?: string[];
          possibleNextFocus?: string[];
          evidenceQualification?: string | null;
        } | null;
        rawDraft?: string;
      }>("/api/draft-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: debriefEvidence || sourceSession.notes,
          focus: sourceSession.focus || sourceSession.title,
          preparation: sourceSession.preparation,
          clientName: client.name,
        }),
      });

      const sections =
        data.sections ?? parseDraftSummary(data.rawDraft || data.summary || "");
      const fields: SummaryFields = {
        sessionSummary: sections.aiDraftSummary || data.summary || "",
        keyThemes: sections.emergingThemes,
        outcomes: sections.suggestedFocus || sourceSession.outcomes,
        agreedActions: sections.agreedActions || sourceSession.commitments,
        strengthsObserved: sections.strengthsObserved,
        coachingContext: sections.valuesBecomingVisible,
        developmentEvidence: sections.professionalIdentityDevelopment,
        suggestedFocus: sections.suggestedFocus,
        evidenceQualification: sections.coachReflection,
      };

      // Do not overwrite an approved summary without explicit coach confirmation upstream.
      if (
        sourceSession.summaryStatus === "approved" ||
        sourceSession.aiSummaryApproved
      ) {
        const confirmed = window.confirm(
          "This summary is already approved. Create a new draft without replacing the approved record until you approve again?"
        );
        if (!confirmed) return null;
      }

      const next: Session = {
        ...sourceSession,
        summary: fields.sessionSummary,
        emergingThemes: fields.keyThemes,
        strengthsObserved: fields.strengthsObserved ?? "",
        valuesBecomingVisible: fields.coachingContext ?? "",
        professionalIdentityDevelopment: fields.developmentEvidence ?? "",
        agreedActions: fields.agreedActions,
        commitments: fields.agreedActions,
        outcomes: fields.outcomes,
        suggestedFocus: fields.suggestedFocus ?? "",
        coachReflection: fields.evidenceQualification ?? "",
        summaryStatus: "draft",
        aiSummaryApproved: false,
      };
      setSession(next);
      await persist(next, { silent: true });
      return fields;
    } catch (err) {
      console.error("Summary generation failed", {
        operation: "generate_summary",
        sessionId: sourceSession.id,
        relationshipId: sourceSession.clientId,
        ...serialiseError(err),
      });
      setError(
        "The session summary could not be created. Your debrief has been saved and has not been changed. Try again."
      );
      throw err;
    }
  }

  async function handleSaveDraftSummary(summary: SummaryFields) {
    const hasContent =
      summary.sessionSummary.trim() ||
      summary.keyThemes.trim() ||
      summary.agreedActions.trim() ||
      (summary.strengthsObserved ?? "").trim() ||
      (summary.developmentEvidence ?? "").trim();
    const next: Session = {
      ...session,
      summary: summary.sessionSummary,
      emergingThemes: summary.keyThemes,
      strengthsObserved: summary.strengthsObserved ?? session.strengthsObserved,
      valuesBecomingVisible:
        summary.coachingContext ?? session.valuesBecomingVisible,
      professionalIdentityDevelopment:
        summary.developmentEvidence ??
        session.professionalIdentityDevelopment,
      outcomes: summary.outcomes,
      agreedActions: summary.agreedActions,
      commitments: summary.agreedActions,
      suggestedFocus: summary.suggestedFocus ?? session.suggestedFocus,
      coachReflection:
        summary.evidenceQualification ?? session.coachReflection,
      summaryStatus: hasContent ? "draft" : "not_generated",
      aiSummaryApproved: false,
    };
    setSession(next);
    await persist(next, {
      silent: true,
      errorMessage: "Unable to save draft",
    });
  }

  async function handleApproveSummary(summary: SummaryFields) {
    const next: Session = {
      ...session,
      summary: summary.sessionSummary,
      emergingThemes: summary.keyThemes,
      strengthsObserved: summary.strengthsObserved ?? session.strengthsObserved,
      valuesBecomingVisible:
        summary.coachingContext ?? session.valuesBecomingVisible,
      professionalIdentityDevelopment:
        summary.developmentEvidence ??
        session.professionalIdentityDevelopment,
      outcomes: summary.outcomes,
      agreedActions: summary.agreedActions,
      commitments: summary.agreedActions,
      suggestedFocus: summary.suggestedFocus ?? session.suggestedFocus,
      coachReflection:
        summary.evidenceQualification ?? session.coachReflection,
      summaryStatus: "approved",
      aiSummaryApproved: true,
    };
    setSession(next);
    await persist(next, {
      silent: true,
      errorMessage: "Unable to approve summary",
    });

    // Longitudinal pattern analysis after summary approval (idempotent server path).
    void apiJson("/api/patterns/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: client.id, force: true }),
      operation: "generate_relationship_patterns",
      relationshipId: client.id,
      sessionId: session.id,
    }).catch(err => {
      console.error("[patterns] post-approval generation failed", {
        operation: "generate_relationship_patterns",
        relationshipId: client.id,
        sessionId: session.id,
        message: err instanceof Error ? err.message : String(err),
        status:
          err && typeof err === "object" && "status" in err
            ? (err as { status?: number }).status
            : undefined,
      });
    });
  }

  async function handleComplete() {
    if (isLoading) return;
    const gate = canCompleteSession(session);
    if (!gate.ok) {
      setError(gate.reason);
      setCompleteOpen(false);
      return;
    }
    const next: Session = {
      ...session,
      status: "completed",
      completedAt: new Date().toISOString(),
    };
    const saved = await persist(next, {
      loadingMessage: "Completing…",
      successMessage: "Completed",
      errorMessage: "Unable to complete conversation",
      toastTitle: "Conversation completed",
      toastErrorTitle: "Conversation could not be completed",
    });
    setCompleteOpen(false);
    if (!saved) return saved;

    setReadOnlyOverride(false);
    setCompletionOpen(true);
    setGeneratingUpdate(true);
    setGeneratedUpdateId(null);
    setUpdateReady(false);
    setUpdateFailed(false);
    setUpdateOutcome("idle");
    setUpdateNotice("");

    try {
      const data = await apiJson<{
        update?: { id: string; hasMeaningfulChanges?: boolean };
        notice?: string;
        outcome?: string;
      }>("/api/development-updates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: client.id,
          sessionId: saved.id,
        }),
        relationshipId: client.id,
        sessionId: saved.id,
        operation: "development_updates_generate",
      });
      applyDevelopmentGenerateResult(data);
    } catch (err) {
      applyDevelopmentGenerateError(err);
    } finally {
      setGeneratingUpdate(false);
    }

    return saved;
  }

  function applyDevelopmentGenerateResult(data: {
    update?: { id: string; hasMeaningfulChanges?: boolean };
    notice?: string;
    outcome?: string;
  }) {
    if (data.update?.id) {
      setGeneratedUpdateId(data.update.id);
      setUpdateReady(true);
      setUpdateFailed(false);
      if (
        data.outcome === "no_meaningful_change" ||
        data.update.hasMeaningfulChanges === false
      ) {
        setUpdateOutcome("no_meaningful_change");
        setUpdateNotice(
          data.notice ||
            "No meaningful change was identified from this conversation. Your existing development profile remains current."
        );
      } else {
        setUpdateOutcome("ready_for_review");
        setUpdateNotice(
          data.notice || "A suggested development update is ready for review."
        );
      }
      return;
    }
    setUpdateOutcome("ready_for_review");
    setUpdateNotice(data.notice || "Development updated. You can continue when ready.");
  }

  function applyDevelopmentGenerateError(err: unknown) {
    const message = errorMessage(
      err,
      "Your conversation notes and summary remain saved. The existing development profile has not been changed."
    );
    const isNetwork =
      isNetworkFetchError(err) ||
      (err instanceof ApiRequestError &&
        !err.status &&
        message === NETWORK_ERROR_MESSAGE);

    setUpdateFailed(true);
    if (isNetwork) {
      setUpdateOutcome("network");
      setUpdateNotice(NETWORK_ERROR_MESSAGE);
      return;
    }
    setUpdateOutcome("failed");
    setUpdateNotice(
      "Your conversation notes and summary remain saved. The existing development profile has not been changed."
    );
  }

  async function retryDevelopmentUpdate() {
    if (!session.id || generatingUpdate) return;
    setGeneratingUpdate(true);
    setUpdateFailed(false);
    setUpdateReady(false);
    setUpdateOutcome("idle");
    setUpdateNotice("");
    setRetryUpdateKey(key => key + 1);
    try {
      const data = await apiJson<{
        update?: { id: string; hasMeaningfulChanges?: boolean };
        notice?: string;
        outcome?: string;
      }>("/api/development-updates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: client.id,
          sessionId: session.id,
        }),
        relationshipId: client.id,
        sessionId: session.id,
        operation: "development_updates_generate",
      });
      applyDevelopmentGenerateResult(data);
    } catch (err) {
      applyDevelopmentGenerateError(err);
    } finally {
      setGeneratingUpdate(false);
    }
  }

  const coachWorkspaceData = useMemo(
    () => buildCoachWorkspaceViewModel(client, session),
    [client, session]
  );

  const previousCommitment =
    outstanding[0]?.title ||
    previous?.agreedActions?.trim() ||
    previous?.commitments?.trim() ||
    "";

  const sessionTitle = getSessionDisplayTitle({
    title: session.title,
    focus: session.focus,
    purpose: session.prepPurpose,
    sessionNumber: session.sessionNumber,
  });

  const isLiveNotes = stage === "coach";
  const isOutcomeNotes = stage === "reflect";
  const isSummaryStage = stage === "summary";
  const isActionsStage = stage === "actions";
  const usesJourneyComposition =
    isLiveNotes || isOutcomeNotes || isSummaryStage || isActionsStage;

  const sessionEyebrow = `Session ${session.sessionNumber} · ${
    isOutcomeNotes ||
    session.status === "awaiting_completion" ||
    session.status === "completed"
      ? "Conversation ended"
      : session.status === "in_progress" || session.status === "paused"
        ? "In progress"
        : SESSION_STATUS_LABELS[session.status]
  }`;

  const orientation = isActionsStage
    ? {
        eyebrow: "After the session",
        title: "Carry forward what matters",
        description:
          "Confirm commitments and the focus for next time. AI may suggest; you decide.",
        optional: false,
      }
    : isSummaryStage
      ? STAGE_ORIENTATION_COPY.summary_insights
      : isOutcomeNotes
        ? SESSION_NOTES_OUTCOME_COPY
        : STAGE_ORIENTATION_COPY.session_notes;

  const orientationDescription = isLiveNotes
    ? SESSION_NOTES_LIVE_DESCRIPTION
    : orientation.description;

  const orientationEyebrow = isActionsStage
    ? orientation.eyebrow || "After the session"
    : isSummaryStage
      ? orientation.eyebrow || "Summary & Insights"
      : sessionEyebrow;

  const nextSessionDateLabel = (() => {
    const upcoming = [...client.sessions]
      .filter(
        item =>
          item.id !== session.id &&
          item.status !== "completed" &&
          item.sessionNumber > session.sessionNumber
      )
      .sort((a, b) => a.sessionNumber - b.sessionNumber)[0];
    if (upcoming?.date?.trim()) return upcoming.date.trim();

    const fallback = client.nextSession?.trim() || "";
    if (!fallback || /not scheduled/i.test(fallback)) return null;

    // Avoid showing the current session date as the next session.
    const currentDate = session.date?.trim();
    if (currentDate && fallback.toLowerCase().includes(currentDate.toLowerCase())) {
      return null;
    }
    return fallback;
  })();

  const backControl = (
    <button
      type="button"
      className="back"
      onClick={() => {
        if (dirty) {
          const leave = window.confirm(
            "You have unsaved changes. Leave this session?"
          );
          if (!leave) return;
        }
        if (onReturnOverview) {
          onReturnOverview();
          return;
        }
        onBack();
      }}
    >
      <ArrowLeft size={16} /> {`Back to Session ${session.sessionNumber}`}
    </button>
  );

  const journeyNav = null;

  const banners = (
    <>
      {flash ? (
        <div className="inline-notice" role="status">
          {flash}
        </div>
      ) : null}
      {archived ? (
        <div className="inline-notice archived-banner" role="status">
          This client is archived. Restore them to edit coaching activity.
        </div>
      ) : null}
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );

  const identityBar = (
    <RelationshipIdentityBar
      clientName={client.name}
      role={client.role}
      organisation={client.organisation}
      sessionNumber={session.sessionNumber}
      totalSessions={Math.max(client.sessions.length, session.sessionNumber)}
      sessionDate={session.date}
      sessionTime={session.time}
      status={session.status}
      sessionTitle={sessionTitle}
      actions={
        <div className="session-workspace-header-actions">
          <SaveStatus feedback={feedback} />
          {session.status === "completed" ? (
            <button
              type="button"
              className="secondary"
              onClick={() => setReadOnlyOverride(current => !current)}
            >
              {readOnlyOverride ? "Done editing" : "Edit"}
            </button>
          ) : null}
        </div>
      }
    />
  );

  const stageBody = (
    <>

      {stage === "overview" ? (
        <div className="two-grid">
          <article className="panel">
            <h2>Current Position</h2>
            <dl className="meta-list">
              <div>
                <dt>Client</dt>
                <dd>{client.name}</dd>
              </div>
              <div>
                <dt>Date and time</dt>
                <dd>{formatSessionDateTime(session)}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{session.durationMinutes} minutes</dd>
              </div>
              <div>
                <dt>Session status</dt>
                <dd>{SESSION_STATUS_LABELS[session.status]}</dd>
              </div>
              <div>
                <dt>Preparation</dt>
                <dd>{preparationCompletionLabel(session)}</dd>
              </div>
              <div>
                <dt>Summary approval</dt>
                <dd>{SUMMARY_STATUS_LABELS[session.summaryStatus]}</dd>
              </div>
            </dl>

            <div className="button-row" style={{ marginTop: 22 }}>
              {primary.action === "complete" ? (
                <button
                  type="button"
                  className="primary"
                  disabled={archived}
                  onClick={() => setCompleteOpen(true)}
                >
                  Complete session
                </button>
              ) : session.status === "prepared" || session.status === "planned" ? (
                <ActionButton
                  variant="primary"
                  status={toActionButtonStatus(feedback.status)}
                  idleLabel={primary.label}
                  loadingLabel="Opening conversation…"
                  successLabel="Opened"
                  errorLabel="Try again"
                  disabled={archived || isLoading}
                  onClick={() => {
                    if (primary.stage === "prepare") {
                      setStage("prepare");
                      return;
                    }
                    void handleStartOrContinue();
                  }}
                />
              ) : (
                <ActionButton
                  variant="primary"
                  idleLabel={primary.label}
                  loadingLabel="Opening conversation…"
                  onClick={() => {
                    if (session.status === "completed") {
                      setStage(primary.stage);
                      return;
                    }
                    void handleStartOrContinue();
                  }}
                />
              )}
              {session.status === "completed" ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={archived}
                  onClick={() => setScheduleOpen(true)}
                >
                  Schedule next session
                </button>
              ) : null}
            </div>
          </article>

          <div className="stack-gap">
            <article className="panel">
              <h3>Previous session summary</h3>
              <p className="muted">
                {previous?.summary?.trim() ||
                  previous?.suggestedFocus?.trim() ||
                  "No previous session summary yet."}
              </p>
            </article>
            <article className="panel">
              <h3>Outstanding actions</h3>
              {outstanding.length === 0 ? (
                <p className="muted">No unresolved actions.</p>
              ) : (
                <ul className="clean-list">
                  {outstanding.map(action => (
                    <li key={action.id}>
                      <strong>{action.title}</strong>
                      {action.due ? <small> · due {action.due}</small> : null}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </div>
        </div>
      ) : null}

      {stage === "prepare" ? (
        <article className="panel session-brief-redirect">
          <h2>Prepare</h2>
          <p>
            Review preparation and start the conversation when ready.
          </p>
          {outstanding.length > 0 ? (
            <div className="focus-box" style={{ marginTop: 18 }}>
              <small>Previous commitments to review</small>
              <ul className="clean-list" style={{ marginTop: 10 }}>
                {outstanding.slice(0, 3).map(action => (
                  <li key={action.id}>{action.title}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="button-row" style={{ marginTop: 22 }}>
            <ActionButton
              variant="primary"
              idleLabel="Start conversation"
              loadingLabel="Opening…"
              disabled={archived || isLoading}
              onClick={() => {
                void handleStartOrContinue();
              }}
            />
            <button
              type="button"
              className="secondary"
              onClick={() => {
                if (onReturnOverview) onReturnOverview();
                else onBack();
              }}
            >
              Return to Current Position
            </button>
          </div>
        </article>
      ) : null}

      {stage === "coach" ? (
        <LiveSessionWorkspace
          key={session.id}
          initialData={coachWorkspaceData}
          session={session}
          clientName={client.name}
          previousCommitment={previousCommitment}
          onPersist={persistCoachSession}
          onSessionUpdated={handleCoachSessionUpdated}
          onEnded={() => setStage("reflect")}
        />
      ) : null}

      {stage === "reflect" ? (
        <SessionDebriefForm
          key={`debrief-${session.id}`}
          session={session}
          readOnly={readOnly}
          onSave={handleSaveDebrief}
          onCreateSummary={handleCreateSummaryFromDebrief}
        />
      ) : null}

      {stage === "summary" ? (
        hasDebriefEvidence(session) ||
        session.summaryStatus !== "not_generated" ||
        Boolean(session.summary.trim()) ? (
          <SessionSummaryReview
            key={`summary-${session.id}-${session.summaryStatus}`}
            session={session}
            readOnly={readOnly}
            onGenerate={() => handleGenerateSummary()}
            onSaveDraft={handleSaveDraftSummary}
            onApprove={handleApproveSummary}
            onContinue={() => setStage("actions")}
            onSkip={() => {
              if (onReturnOverview) onReturnOverview();
              else onBack();
            }}
          />
        ) : (
          <article className="panel">
            <SessionErrorMessage message="Session notes are needed before Summary & Insights can be created." />
            <div className="button-row" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setStage("reflect");
                  onOpenSessionModule?.(session.id, "session_notes");
                }}
              >
                Return to Session Notes
              </button>
            </div>
          </article>
        )
      ) : null}

      {stage === "actions" ? (
        <SessionNextSteps
          clientName={client.name}
          clientId={client.id}
          session={session}
          actions={sessionActions}
          nextSessionDate={nextSessionDateLabel}
          readOnly={readOnly}
          hideStageHeader={usesJourneyComposition}
          onSaveAction={onSaveAction}
          onCompleteSession={
            session.status === "awaiting_completion"
              ? () => setCompleteOpen(true)
              : undefined
          }
          onScheduleNext={() => setScheduleOpen(true)}
          onReturnToJourney={() => {
            if (onReturnOverview) onReturnOverview();
            else onBack();
          }}
        />
      ) : null}
    </>
  );

  const page = usesJourneyComposition ? (
    <JourneyStagePage
      className={`session-workspace${isLiveNotes ? " is-live-session" : ""}`}
      back={backControl}
      navigation={journeyNav}
      banners={banners}
      identity={identityBar}
      orientation={
        <StageOrientation
          eyebrow={orientationEyebrow}
          title={orientation.title}
          description={orientationDescription}
          optional={orientation.optional}
        />
      }
      nextStep={
        isSummaryStage ? (
          <JourneyNextStep
            now="Reviewing Summary & Insights"
            next="Approve the summary or skip it and continue to Development."
          />
        ) : null
      }
      nextStepPosition="after"
    >
      {stageBody}
    </JourneyStagePage>
  ) : (
    <section className="page session-workspace identity-page-shell journey-stage-page">
      {backControl}
      {journeyNav}
      {banners}
      <div className="journey-stage-page__chrome">{identityBar}</div>
      {stageBody}
    </section>
  );

  const dialogs = (
    <>
      <ConfirmDialog
        open={completeOpen}
        title="Complete this session?"
        onClose={() => setCompleteOpen(false)}
        footer={
          <>
            <button type="button" className="secondary" onClick={() => setCompleteOpen(false)}>
              Cancel
            </button>
            <ActionButton
              variant="primary"
              status={toActionButtonStatus(feedback.status)}
              idleLabel="Complete session"
              loadingLabel="Completing…"
              successLabel="Completed"
              errorLabel="Try again"
              disabled={isLoading}
              onClick={() => {
                void handleComplete();
              }}
            />
          </>
        }
      >
        <p>
          Completing marks the session as finished and read-only. You can still
          edit later with Edit.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={completionOpen}
        title="Conversation saved"
        onClose={() => {
          if (generatingUpdate) return;
          setCompletionOpen(false);
          if (onReturnOverview) onReturnOverview();
          else onBack();
        }}
        footer={
          <>
            {updateOutcome === "failed" || updateOutcome === "network" ? (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setCompletionOpen(false);
                    setSchedulePromptOpen(true);
                  }}
                >
                  Continue
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    void retryDevelopmentUpdate();
                  }}
                >
                  Try again
                </button>
              </>
            ) : updateOutcome === "no_meaningful_change" ? (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setCompletionOpen(false);
                    if (onTabChange) onTabChange("intelligence");
                    else if (onReturnOverview) onReturnOverview();
                    else onBack();
                  }}
                >
                  View development
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setCompletionOpen(false);
                    setSchedulePromptOpen(true);
                  }}
                >
                  Continue
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="secondary"
                  disabled={generatingUpdate}
                  title={
                    generatingUpdate
                      ? `${BRAND.intelligenceName} is completing the development update`
                      : undefined
                  }
                  onClick={() => {
                    setCompletionOpen(false);
                    if (onReturnOverview) onReturnOverview();
                    else onBack();
                  }}
                >
                  Return to person
                </button>
                {updateReady &&
                generatedUpdateId &&
                updateOutcome === "ready_for_review" &&
                onReviewDevelopmentUpdate ? (
                  <button
                    type="button"
                    className="primary"
                    disabled={generatingUpdate}
                    onClick={() => {
                      setCompletionOpen(false);
                      onReviewDevelopmentUpdate(generatedUpdateId);
                    }}
                  >
                    Review development update
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    disabled={generatingUpdate}
                    onClick={() => {
                      setCompletionOpen(false);
                      setSchedulePromptOpen(true);
                    }}
                  >
                    {generatingUpdate ? "Updating…" : "Continue"}
                  </button>
                )}
              </>
            )}
          </>
        }
      >
        <p>Your notes and summary are ready.</p>
        {generatingUpdate ? (
          <IdentityProcessingState
            key={retryUpdateKey}
            title="Updating development"
            description="Comparing this conversation with the approved development record."
            busy
            compact
          />
        ) : updateOutcome === "network" ? (
          <div role="status" aria-live="polite" aria-busy="false">
            <p className="identity-processing-state__title">
              Unable to reach the server
            </p>
            <p className="muted">{updateNotice || NETWORK_ERROR_MESSAGE}</p>
          </div>
        ) : updateOutcome === "failed" || updateFailed ? (
          <div role="status" aria-live="polite" aria-busy="false">
            <p className="identity-processing-state__title">
              Development was not updated
            </p>
            <p className="muted">
              {updateNotice ||
                "Your conversation notes and summary remain saved. The existing development profile has not been changed."}
            </p>
          </div>
        ) : updateOutcome === "no_meaningful_change" ? (
          <div role="status" aria-live="polite" aria-busy="false">
            <p className="identity-processing-state__title">
              Development remains current
            </p>
            <p className="muted">
              {updateNotice ||
                "No meaningful change was identified from this conversation. Your existing development profile remains current."}
            </p>
          </div>
        ) : (
          <div role="status" aria-live="polite" aria-busy="false">
            <IdentityProcessingState
              title="Development updated"
              description={updateNotice || "You can continue when ready."}
              busy={false}
              compact
            />
          </div>
        )}
        {generatingUpdate ? (
          <p className="muted" style={{ marginTop: 8 }}>
            {BRAND.intelligenceName} is completing the update. Continue will be
            available when this finishes.
          </p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={schedulePromptOpen}
        title="Schedule next session"
        onClose={() => {
          setSchedulePromptOpen(false);
          if (onReturnOverview) onReturnOverview();
        }}
        footer={
          <>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setSchedulePromptOpen(false);
                if (onReturnOverview) onReturnOverview();
                else onBack();
              }}
            >
              Not now
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                setSchedulePromptOpen(false);
                setScheduleOpen(true);
              }}
            >
              Schedule next session
            </button>
          </>
        }
      >
        <p>This session is complete. Schedule the next session to continue the coaching journey.</p>
      </ConfirmDialog>

      <ScheduleSessionDialog
        open={scheduleOpen}
        clientName={client.name}
        onClose={() => setScheduleOpen(false)}
        onSchedule={onScheduleNext}
      />
    </>
  );

  return (
    <>
      {page}
      {dialogs}
    </>
  );
}
