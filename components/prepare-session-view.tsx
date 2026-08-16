"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Client, Session } from "@/lib/types";
import { isClientArchived } from "@/lib/types";
import { getRelationshipDisplayName } from "@/lib/relationship-identity";
import { apiJson, AuthRequiredError, serialiseError } from "@/lib/api-client";
import { buildPreparationText } from "@/lib/session-workflow";
import type { ClientWorkspaceTab } from "@/components/client-workspace-tabs";
import { PreparationApproachDrawer } from "@/components/preparation-approach-drawer";
import { PersonFlowBackLink, PersonFlowBreadcrumb } from "@/components/identity";
import { coachingStatusLabel } from "@/lib/identity-journey-path";
import { JourneyStagePage } from "@/components/coaching-journey/journey-stage-page";
import { RelationshipIdentityBar } from "@/components/coaching-journey/relationship-identity-bar";
import { StageOrientation } from "@/components/coaching-journey/stage-orientation";
import { SessionSaveStatus } from "@/components/session/session-save-status";
import { STAGE_ORIENTATION_COPY } from "@/lib/coaching-journey";
import { getDevelopmentConversationIdentityTitle } from "@/lib/prepare/derive-longitudinal-brief-sections";
import type {
  DevelopmentProfile,
  DevelopmentUpdate,
} from "@/lib/development-updates/types";
import {
  buildSourceFingerprint,
  hasPreparationAiContent,
  parsePreparationAiBrief,
  type PreparationAiBrief,
} from "@/lib/preparation-brief";
import {
  PREPARATION_STYLE_LABELS,
  resolvePreparationStyle,
  type PreparationStyle,
} from "@/lib/preparation-style";
import {
  getModeLabel,
  modeToPreparationStyle,
  parseCoachingIntelligenceMode,
  parseCoachingIntelligenceStatus,
  parseIntelligenceSources,
  preparationStyleToMode,
} from "@/lib/coaching-intelligence/mode";
import { preparationAiBriefToGeneratedBrief } from "@/lib/coaching-intelligence/brief-map";
import {
  buildClientJourneySnapshot,
  getCoachingPurpose,
} from "@/lib/client-journey";
import { identityErrorMessages } from "@/lib/identity-language";
import { useUnsavedChanges } from "@/lib/unsaved-changes";
import {
  extractVisibleCoachNotes,
  sanitizeSessionHumanTextFields,
} from "@/lib/coach-notes";
import {
  coachPreparationDraftToSessionFields,
  resolvePreparationIntelligence,
  sanitisePreparationSessionFields,
  sessionToCoachPreparationDraft,
  type PreparationContextSection,
  type PreparationFormValues,
} from "@/lib/preparation-intelligence";
import { PreparationContextDrawer } from "@/components/prepare/preparation-context-drawer";
import { PreparationView } from "@/components/prepare/preparation-view";
import type { PreparationRefreshState } from "@/components/prepare/preparation-approach-control";
import { useToast } from "@/components/feedback/toast-provider";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { selectPatternsForPrepare } from "@/lib/patterns/prioritise";
import {
  buildPreparationAdapterContext,
  buildSessionNumberMap,
} from "@/lib/preparation/preparation-intelligence-adapter";
import type {
  CoachingIntelligenceMode,
  CoachingIntelligenceStatus,
  GeneratedPreparationBrief,
  IntelligenceSource,
} from "@/types/coaching-intelligence";
import { generatePreparationIntelligence } from "@/services/coaching-intelligence";
import type { CoachPreparationDraft } from "@/lib/preparation/derive-coach-preparation";

function resolveGeneratedBriefMode(
  session: Session,
  fallback: CoachingIntelligenceMode
): CoachingIntelligenceMode | null {
  if (!hasPreparationAiContent(session.prepAiBrief)) {
    return null;
  }
  if (session.intelligenceMode) {
    return parseCoachingIntelligenceMode(session.intelligenceMode, fallback);
  }
  if (session.prepAiBriefStyle) {
    return preparationStyleToMode(session.prepAiBriefStyle);
  }
  return fallback;
}

function cleanSessionText(session: Session): Session {
  return sanitisePreparationSessionFields({
    ...session,
    ...sanitizeSessionHumanTextFields(session),
    prepPrivateNotes: extractVisibleCoachNotes(session.prepPrivateNotes),
  });
}

function resolveInitialMode(
  coachMode: CoachingIntelligenceMode | undefined,
  coachPreparationStyle: PreparationStyle,
  clientOverride: PreparationStyle | null | undefined
): CoachingIntelligenceMode {
  if (clientOverride) {
    return preparationStyleToMode(clientOverride);
  }
  if (coachMode) return coachMode;
  return preparationStyleToMode(coachPreparationStyle);
}

export function PrepareSessionView({
  client,
  session,
  coachPreparationStyle = "guided",
  coachIntelligenceMode,
  onBack,
  onBackToPeople,
  onSaveSession,
  onStartSession,
  onClientUpdated,
  onProfileUpdated: _onProfileUpdated,
  onTabChange,
}: {
  client: Client;
  session: Session;
  coachPreparationStyle?: PreparationStyle;
  coachIntelligenceMode?: CoachingIntelligenceMode;
  onBack: () => void;
  onBackToPeople?: () => void;
  onSaveSession: (session: Session) => Promise<Session | void>;
  onStartSession: (session: Session) => Promise<void>;
  onClientUpdated?: (client: Client) => void;
  onProfileUpdated?: (profile: {
    coachingIntelligenceMode: CoachingIntelligenceMode;
    preparationStyle: PreparationStyle;
  }) => void;
  onTabChange?: (tab: ClientWorkspaceTab) => void;
}) {
  void _onProfileUpdated;
  void onTabChange;
  const archived = isClientArchived(client);
  const journey = useMemo(
    () => buildClientJourneySnapshot(client, []),
    [client]
  );

  const [intelligenceMode, setIntelligenceMode] =
    useState<CoachingIntelligenceMode>(() =>
      resolveInitialMode(
        coachIntelligenceMode,
        coachPreparationStyle,
        client.preparationStyleOverride
      )
    );

  const [intelligenceStatus, setIntelligenceStatus] =
    useState<CoachingIntelligenceStatus>(() => {
      const parsed = parseCoachingIntelligenceStatus(
        session.intelligenceStatus,
        hasPreparationAiContent(session.prepAiBrief) ? "ready" : "idle"
      );
      // Persisted "preparing" is not a live UI lock — only local refresh owns that.
      return parsed === "preparing" ? "ready" : parsed;
    });

  const [usedSources, setUsedSources] = useState<IntelligenceSource[]>(() =>
    parseIntelligenceSources(session.intelligenceSources)
  );

  const [
    intelligenceLastRefreshedAt,
    setIntelligenceLastRefreshedAt,
  ] = useState<string | null>(
    session.intelligenceLastRefreshedAt ||
      session.prepAiBriefGeneratedAt ||
      null
  );

  const [generatedBrief, setGeneratedPreparationBrief] =
    useState<GeneratedPreparationBrief>(() =>
      preparationAiBriefToGeneratedBrief(session.prepAiBrief)
    );
  const [generatedBriefMode, setGeneratedBriefMode] =
    useState<CoachingIntelligenceMode | null>(() =>
      resolveGeneratedBriefMode(
        session,
        resolveInitialMode(
          coachIntelligenceMode,
          coachPreparationStyle,
          client.preparationStyleOverride
        )
      )
    );

  const effectiveStyle = resolvePreparationStyle(
    modeToPreparationStyle(intelligenceMode),
    client.preparationStyleOverride
  );

  const [draft, setDraft] = useState(() => cleanSessionText(session));
  const [formSeed, setFormSeed] = useState(() => cleanSessionText(session));
  const [preparation, setPreparation] = useState<CoachPreparationDraft>(() =>
    sessionToCoachPreparationDraft(cleanSessionText(session))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [profile, setProfile] = useState<DevelopmentProfile | null>(null);
  const [updates, setUpdates] = useState<DevelopmentUpdate[]>([]);
  const [aiBrief, setAiBrief] = useState<PreparationAiBrief | null>(
    session.prepAiBrief
  );
  const preparationBrief = aiBrief;
  const [generatedAt, setGeneratedAt] = useState(session.prepAiBriefGeneratedAt);
  const [sourceFingerprint, setSourceFingerprint] = useState(
    session.prepAiBriefSourceFingerprint
  );
  const [confirmedAt, setConfirmedAt] = useState(session.prepAiBriefConfirmedAt);
  const [approachDrawerOpen, setApproachDrawerOpen] = useState(false);
  const [error, setError] = useState("");
  const [insertedNotice, setInsertedNotice] = useState("");
  const [aiUnavailable, setAiUnavailable] = useState("");
  const [formDirty, setFormDirty] = useState(false);
  const [drawerSection, setDrawerSection] =
    useState<PreparationContextSection | null>(null);
  const [liveValues, setLiveValues] = useState<PreparationFormValues | null>(
    null
  );
  /** Sole source of truth for the brief refresh control UI. */
  const [briefRefreshState, setBriefRefreshState] =
    useState<PreparationRefreshState>("idle");
  const [briefRefreshUpdatedLabel, setBriefRefreshUpdatedLabel] =
    useState("Brief updated");
  const briefFeedback = useActionFeedback();
  const { showToast } = useToast();

  const contextTriggerRef = useRef<HTMLElement | null>(null);
  const viewContextButtonRef = useRef<HTMLButtonElement>(null);
  const viewBriefButtonRef = useRef<HTMLButtonElement>(null);
  const changeApproachButtonRef = useRef<HTMLButtonElement>(null);
  const briefRefreshingRef = useRef(false);
  const briefUpdatedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    return () => {
      if (briefUpdatedTimerRef.current) {
        clearTimeout(briefUpdatedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const cleaned = cleanSessionText(session);
    setDraft(cleaned);
    setFormSeed(cleaned);
    setPreparation(sessionToCoachPreparationDraft(cleaned));
    setFormDirty(false);
    setLiveValues(null);
    setAiBrief(session.prepAiBrief);
    setGeneratedAt(session.prepAiBriefGeneratedAt);
    setSourceFingerprint(session.prepAiBriefSourceFingerprint);
    setConfirmedAt(session.prepAiBriefConfirmedAt);
    setGeneratedPreparationBrief(
      preparationAiBriefToGeneratedBrief(session.prepAiBrief)
    );
    setUsedSources(parseIntelligenceSources(session.intelligenceSources));
    setIntelligenceLastRefreshedAt(
      session.intelligenceLastRefreshedAt ||
        session.prepAiBriefGeneratedAt ||
        null
    );
    // Do not clobber an in-flight refresh with a stale parent session status
    // (API writes "preparing" before the brief is ready).
    if (!briefRefreshingRef.current) {
      const nextStatus = parseCoachingIntelligenceStatus(
        session.intelligenceStatus,
        hasPreparationAiContent(session.prepAiBrief) ? "ready" : "idle"
      );
      setIntelligenceStatus(
        nextStatus === "preparing" ? "ready" : nextStatus
      );
    }
    if (session.intelligenceMode) {
      setIntelligenceMode(
        parseCoachingIntelligenceMode(session.intelligenceMode, intelligenceMode)
      );
    }
    setGeneratedBriefMode(
      resolveGeneratedBriefMode(
        session,
        parseCoachingIntelligenceMode(
          session.intelligenceMode,
          intelligenceMode
        )
      )
    );
  }, [session]);

  useEffect(() => {
    setIntelligenceMode(
      resolveInitialMode(
        coachIntelligenceMode,
        coachPreparationStyle,
        client.preparationStyleOverride
      )
    );
  }, [
    coachIntelligenceMode,
    coachPreparationStyle,
    client.preparationStyleOverride,
  ]);

  const { confirmLeave } = useUnsavedChanges(formDirty && !archived);

  const loadProfile = useCallback(async () => {
    setProfile(null);
    setUpdates([]);
    try {
      const profileData = await apiJson<{
        profile: DevelopmentProfile;
        updates?: DevelopmentUpdate[];
      }>(`/api/development-profiles/${client.id}`).catch(() => null);
      if (profileData?.profile) {
        if (profileData.profile.clientId !== client.id) {
          console.error(
            "[relationship-isolation] Prepare profile ownership mismatch",
            { relationshipId: client.id, profileId: profileData.profile.id }
          );
          return;
        }
        setProfile(profileData.profile);
      }
      if (profileData?.updates) {
        const scoped = profileData.updates.filter(
          update => update.clientId === client.id
        );
        if (scoped.length !== profileData.updates.length) {
          console.error(
            "[relationship-isolation] Prepare updates ownership mismatch",
            { relationshipId: client.id }
          );
        }
        setUpdates(scoped);
      }
    } catch {
      // Form remains usable without the development profile.
    }
  }, [client.id]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const intelligence = useMemo(() => {
    const resolved = resolvePreparationIntelligence({
      client,
      conversation: draft,
      profile,
      updates,
      brief: intelligenceMode === "manual" ? null : aiBrief,
    });

    if (intelligenceMode === "manual") {
      return {
        ...resolved,
        suggestedFocus: null,
        suggestedQuestions: [],
        suggestedFramework: null,
        approachSummary: null,
      };
    }

    if (intelligenceMode === "assisted") {
      return {
        ...resolved,
        suggestedQuestions: resolved.suggestedQuestions.slice(0, 5),
        suggestedFramework: null,
      };
    }

    return resolved;
  }, [client, draft, profile, updates, aiBrief, intelligenceMode]);

  const preparationStyle = effectiveStyle;

  async function handleRefreshIntelligence() {
    if (
      intelligenceMode === "manual" ||
      briefRefreshingRef.current ||
      archived
    ) {
      return;
    }

    setError("");
    setAiUnavailable("");
    briefRefreshingRef.current = true;
    setBriefRefreshState("refreshing");
    setIntelligenceStatus("preparing");

    let refreshSucceeded = false;
    let refreshedAt = "";

    try {
      const result = await briefFeedback.runAction(
        async () => {
          const generated = await generatePreparationIntelligence({
            relationshipId: client.id,
            conversationId: session.id,
            mode: intelligenceMode,
          });

          const nextBrief =
            parsePreparationAiBrief(generated.preparationAiBrief) ??
            generatedBriefToAiBriefFallback(generated.brief);

          setUsedSources(generated.usedSources);
          setIntelligenceStatus("ready");
          setIntelligenceLastRefreshedAt(generated.generatedAt);
          setGeneratedPreparationBrief(generated.brief);
          setGeneratedBriefMode(intelligenceMode);
          setAiBrief(nextBrief);
          setGeneratedAt(generated.generatedAt);
          setSourceFingerprint(generated.sourceFingerprint ?? "");
          setConfirmedAt("");
          const seededPurpose =
            draft.prepPurpose.trim() ||
            generated.brief.purposeSuggestion?.trim() ||
            generated.brief.possibleFocus?.trim() ||
            draft.focus;
          const seededTopics =
            draft.prepTopics.trim() ||
            generated.brief.topicsToExplore.join("\n");
          const seededQuestions =
            draft.prepQuestions.trim() ||
            generated.brief.suggestedQuestions.join("\n\n");
          const nextSession: Session = {
            ...draft,
            prepPurpose: seededPurpose,
            prepTopics: seededTopics,
            prepQuestions: seededQuestions,
            focus: seededPurpose || draft.focus,
            prepAiBrief: nextBrief,
            prepAiBriefGeneratedAt: generated.generatedAt,
            prepAiBriefStyle: modeToPreparationStyle(intelligenceMode),
            prepAiBriefConfirmedAt: "",
            prepAiBriefSourceFingerprint: generated.sourceFingerprint ?? "",
            intelligenceMode,
            intelligenceStatus: "ready",
            intelligenceSources: generated.usedSources,
            intelligenceLastRefreshedAt: generated.generatedAt,
            intelligenceErrorCode: "",
          };
          setDraft(nextSession);
          setFormSeed(nextSession);
          setPreparation(sessionToCoachPreparationDraft(nextSession));
          return generated;
        },
        {
          loadingMessage: `Preparing ${getModeLabel(intelligenceMode).toLowerCase()} intelligence…`,
          successMessage: `${getModeLabel(intelligenceMode)} intelligence ready`,
          errorMessage: "Unable to refresh intelligence",
          successDurationMs: 3000,
          onSuccess: generated => {
            showToast({
              type: "success",
              title: `${getModeLabel(intelligenceMode)} intelligence ready`,
              description: `${generated.usedSources.length} reviewed evidence ${
                generated.usedSources.length === 1
                  ? "source was"
                  : "sources were"
              } used.`,
            });
          },
          onError: err => {
            if (err instanceof AuthRequiredError) {
              window.location.assign("/auth/sign-in?next=/?view=dashboard");
              return;
            }
            console.error(
              "Preparation intelligence generation failed",
              serialiseError(err)
            );
            setIntelligenceStatus("error");
            setAiUnavailable(
              `${identityErrorMessages.preparationUnavailable.title} ${identityErrorMessages.preparationUnavailable.description}`
            );
            showToast({
              type: "error",
              title: hasPreparationAiContent(aiBrief)
                ? "Preparation could not be refreshed safely"
                : "Preparation could not be generated right now.",
              description: hasPreparationAiContent(aiBrief)
                ? "Your existing preparation remains available and has not been changed."
                : "You can try again or continue without AI preparation.",
              durationMs: 5000,
            });
          },
        }
      );

      refreshSucceeded = Boolean(result);
      refreshedAt = result?.generatedAt ?? "";
    } catch {
      setIntelligenceStatus("error");
      refreshSucceeded = false;
    } finally {
      briefRefreshingRef.current = false;

      if (refreshSucceeded) {
        const label = formatBriefUpdatedClockLabel(refreshedAt);
        setBriefRefreshUpdatedLabel(
          label === "Updated" ? "Brief updated" : label.replace(/^Updated/, "Brief updated")
        );
        setBriefRefreshState("updated");
        if (briefUpdatedTimerRef.current) {
          clearTimeout(briefUpdatedTimerRef.current);
        }
        briefUpdatedTimerRef.current = setTimeout(() => {
          setBriefRefreshState(current =>
            current === "updated" ? "idle" : current
          );
        }, 2500);
      } else {
        setBriefRefreshState("failed");
        setIntelligenceStatus(current => {
          if (current !== "preparing") return current;
          return hasPreparationAiContent(aiBrief) ? "ready" : "error";
        });
      }
    }
  }

  // Auto-prepare only on first open when AI is enabled and no brief exists.
  // Mode changes must not silently regenerate existing preparation.
  useEffect(() => {
    if (archived || intelligenceMode === "manual") return;
    if (hasPreparationAiContent(aiBrief)) return;
    if (briefRefreshingRef.current || aiUnavailable) return;
    void handleRefreshIntelligence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  async function savePreparation(values: PreparationFormValues) {
    if (archived) throw new Error("Archived");
    setError("");
    setIsSaving(true);
    try {
      const cleaned = cleanSessionText({
        ...draft,
        prepPurpose: values.purpose,
        prepTopics: values.topics,
        prepQuestions: values.questions,
        prepRisks: values.desiredOutcome,
        prepPrivateNotes: values.privateNotes,
        focus: values.purpose || draft.focus,
      });
      const nextDraft: Session = {
        ...cleaned,
        prepAiBrief: aiBrief,
        prepAiBriefGeneratedAt: generatedAt,
        prepAiBriefStyle: modeToPreparationStyle(intelligenceMode),
        prepAiBriefSourceFingerprint: sourceFingerprint,
        prepAiBriefConfirmedAt: confirmedAt,
        intelligenceMode,
        intelligenceStatus,
        intelligenceSources: usedSources,
        intelligenceLastRefreshedAt: intelligenceLastRefreshedAt ?? "",
        intelligenceErrorCode: "",
        preparation: buildPreparationText(cleaned),
        status:
          cleaned.status === "planned" || cleaned.status === "prepared"
            ? "prepared"
            : cleaned.status,
      };
      const saved = cleanSessionText(
        (await onSaveSession(nextDraft)) ?? nextDraft
      );
      setDraft(saved);
      setFormSeed(saved);
      setPreparation(sessionToCoachPreparationDraft(saved));
      setFormDirty(false);
      setAiBrief(saved.prepAiBrief);
      setGeneratedAt(saved.prepAiBriefGeneratedAt);
      setSourceFingerprint(saved.prepAiBriefSourceFingerprint);
      setConfirmedAt(saved.prepAiBriefConfirmedAt);
    } catch (err) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Preparation could not be saved. Your changes remain on screen.";
      setError(message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }

  function handleApproachSaved(
    mode: CoachingIntelligenceMode,
    updatedClient: {
      id: string;
      preparationStyleOverride?: string | null;
    }
  ) {
    setIntelligenceMode(mode);
    if (mode === "manual") {
      setIntelligenceStatus("idle");
      setUsedSources([]);
    }
    onClientUpdated?.({
      ...client,
      ...updatedClient,
      preparationStyleOverride: modeToPreparationStyle(mode),
    });
  }

  async function handleStartConversation() {
    if (archived || startBusy) return;

    if (isSaving) {
      const proceed = window.confirm(
        "A save is still in progress. Wait for it to finish, or continue and risk discarding unsaved refinements?"
      );
      if (!proceed) return;
    } else if (formDirty) {
      const choice = window.confirm(
        "You have unsaved refinements. Save them before starting the session?\n\nOK = save and start · Cancel = review your changes"
      );
      if (!choice) return;
      if (liveValues) {
        try {
          await savePreparation(liveValues);
        } catch {
          const force = window.confirm(
            "Preparation could not be saved. Start the session anyway with the last saved brief?"
          );
          if (!force) return;
        }
      }
    } else if (!confirmLeave()) {
      return;
    }

    setStartBusy(true);
    try {
      await onStartSession(draft);
    } finally {
      setStartBusy(false);
    }
  }


  function formatBriefUpdatedClockLabel(
    value: string | null | undefined
  ): string {
    if (!value) return "Updated";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Updated";
    return `Updated ${new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)}`;
  }

  function openContext(
    section: PreparationContextSection,
    trigger?: HTMLElement | null
  ) {
    contextTriggerRef.current = trigger ?? viewContextButtonRef.current;
    setDrawerSection(section);
  }

  function insertQuestionFromDrawer(question: string) {
    setFormSeed(current => {
      const base = liveValues
        ? {
            ...current,
            prepPurpose: liveValues.purpose,
            prepTopics: liveValues.topics,
            prepQuestions: liveValues.questions,
            prepRisks: liveValues.desiredOutcome,
            prepPrivateNotes: liveValues.privateNotes,
            focus: liveValues.purpose || current.focus,
          }
        : current;

      return {
        ...base,
        prepQuestions: [base.prepQuestions.trim(), question]
          .filter(Boolean)
          .join("\n\n"),
      };
    });
    setFormDirty(true);
    setInsertedNotice("Added to Questions to consider");
    setDrawerSection(null);
  }

  const showAiPreparation = intelligenceMode !== "manual";
  const isBriefOutOfDate =
    generatedBriefMode !== null && generatedBriefMode !== intelligenceMode;
  const coachDefaultMode = resolveInitialMode(
    coachIntelligenceMode,
    coachPreparationStyle,
    null
  );

  const refreshState: PreparationRefreshState =
    briefRefreshState === "refreshing" ||
    briefRefreshState === "updated" ||
    briefRefreshState === "failed"
      ? briefRefreshState
      : isBriefOutOfDate || Boolean(aiUnavailable)
        ? "update_available"
        : "idle";

  const briefSummary =
    generatedBrief.previousConversation?.trim() ||
    intelligence.previousConversation?.summary?.trim() ||
    aiBrief?.exploration?.trim() ||
    (showAiPreparation
      ? "No approved preparation intelligence is available yet. Refresh when you are ready."
      : "Manual preparation is active for this relationship.");

  const focusTags = [
    ...(aiBrief?.themes.map(theme => theme.title.trim()).filter(Boolean) ?? []),
    ...(generatedBrief.topicsToExplore ?? []),
    generatedBrief.possibleFocus?.trim() || intelligence.suggestedFocus?.trim() || "",
  ]
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index)
    .filter(tag => !tag.trim().endsWith("?"))
    .slice(0, 3);

  const suggestedTopics = focusTags;

  const commitmentStatements = intelligence.outstandingCommitments.map(
    item => item.statement
  );

  const preparationAdapter = useMemo(
    () =>
      buildPreparationAdapterContext({
        client,
        currentSession: draft,
        profile,
        patterns: profile?.coachingPatterns ?? [],
      }),
    [client, draft, profile]
  );

  const relevantPatterns = useMemo(() => {
    if (preparationAdapter.relevantPatterns.length > 0) {
      return preparationAdapter.relevantPatterns.map(pattern => ({
        title: pattern.title,
        description: pattern.description,
      }));
    }
    return selectPatternsForPrepare(profile?.coachingPatterns ?? [], {
      focusText:
        draft.prepPurpose ||
        draft.focus ||
        intelligence.suggestedFocus ||
        client.currentFocus,
      limit: 2,
      beforeSessionNumber: draft.sessionNumber,
      sessionNumbers: buildSessionNumberMap(client.sessions),
    });
  }, [
    preparationAdapter,
    profile?.coachingPatterns,
    draft.prepPurpose,
    draft.focus,
    draft.sessionNumber,
    intelligence.suggestedFocus,
    client.currentFocus,
    client.sessions,
  ]);

  const orientation = STAGE_ORIENTATION_COPY.prepare;
  const prepareSessionTitle = getDevelopmentConversationIdentityTitle();

  const personName = getRelationshipDisplayName(client);

  const handleBackToPerson = () => {
    if (confirmLeave()) onBack();
  };

  return (
    <JourneyStagePage
      className="prepare-page"
      back={
        <PersonFlowBackLink personName={personName} onBack={handleBackToPerson} />
      }
      navigation={
        <PersonFlowBreadcrumb
          personName={personName}
          stageLabel="Prepare"
          onBackToPeople={() => {
            if (confirmLeave()) (onBackToPeople ?? onBack)();
          }}
          onBackToPerson={handleBackToPerson}
        />
      }
      banners={
        archived ? (
          <div className="banner warning" role="status">
            This coaching relationship is archived. Preparation can be reviewed
            but not changed.
          </div>
        ) : null
      }
      identity={
        <RelationshipIdentityBar
          clientName={getRelationshipDisplayName(client)}
          role={client.role}
          organisation={client.organisation}
          sessionNumber={draft.sessionNumber}
          totalSessions={Math.max(client.sessions.length, draft.sessionNumber)}
          sessionDate={draft.date}
          sessionTime={draft.time}
          status={draft.status}
          sessionTitle={prepareSessionTitle}
          actions={
            <SessionSaveStatus
              state={
                isSaving ? "saving" : formDirty ? "unsaved" : "idle"
              }
            />
          }
        />
      }
      orientation={null}
      nextStep={null}
      workspaceClassName="identity-prepare-workspace"
    >
      <div className="identity-prepare-workspace__stack">
        <StageOrientation
          eyebrow={orientation.eyebrow}
          title={orientation.title}
          description={orientation.description}
        />
        <PreparationView
          conversationId={draft.id}
          clientName={getRelationshipDisplayName(client)}
          intelligence={intelligence}
          initialPreparation={formSeed}
          preparationStyle={preparationStyle}
          defaultPreparationStyle={modeToPreparationStyle(coachDefaultMode)}
          refreshState={refreshState}
          refreshUpdatedLabel={briefRefreshUpdatedLabel}
          briefSummary={briefSummary}
          focusTags={focusTags}
          commitmentStatements={commitmentStatements}
          suggestedTopics={suggestedTopics}
          suggestedQuestions={(
            preparationBrief?.questions ??
            generatedBrief.suggestedQuestions ??
            intelligence.suggestedQuestions
          ).slice(0, 4)}
          supportingInsight={
            preparationBrief?.developmentDirection ||
            preparationBrief?.exploration ||
            generatedBrief.coachingGuidance?.framework ||
            null
          }
          developmentDirection={
            preparationBrief?.developmentDirection ||
            generatedBrief.coachingGuidance?.framework ||
            null
          }
          historicalContext={(preparationBrief?.historicalContext ?? []).map(
            item => ({
              title: item.title,
              detail: item.detail,
            })
          )}
          relevantPatterns={relevantPatterns.map(pattern => ({
            title: pattern.title,
            description: pattern.description || "",
            evidenceLabel: null,
          }))}
          coachingPurpose={getCoachingPurpose(client)}
          developmentFocus={
            profile?.currentFocus?.trim() || client.currentFocus.trim() || null
          }
          isFirstSession={preparationAdapter.isFirstSession}
          adapterPrimaryFocus={preparationAdapter.primaryFocusSuggestion}
          adapterAreas={preparationAdapter.areasToExplore}
          adapterQuestions={preparationAdapter.questions}
          aiPrimaryFocus={
            preparationBrief?.themes[0]?.title ||
            generatedBrief.possibleFocus ||
            null
          }
          exploration={
            preparationBrief?.exploration ||
            generatedBrief.previousConversation ||
            null
          }
          reflectionPrompt={
            preparationBrief?.reflectionPrompt ||
            generatedBrief.desiredOutcomeSuggestion ||
            null
          }
          movementSummary={
            preparationAdapter.movementSummary ||
            intelligence.approachSummary ||
            null
          }
          aiThemes={preparationBrief?.themes ?? null}
          supportedEvidence={(profile
            ? [
                ...(profile.strengths ?? []),
                ...(profile.emergingThemes ?? []),
                ...(profile.growthAreas ?? []),
              ]
            : []
          )
            .filter(
              entry =>
                entry.status === "supported" ||
                entry.status === "well_established"
            )
            .map(entry => entry.value.trim())
            .filter(Boolean)
            .slice(0, 4)}
          emergingEdges={(profile
            ? [
                ...(profile.growthAreas ?? []),
                ...(profile.emergingThemes ?? []),
              ]
            : []
          )
            .filter(entry => entry.status === "emerging")
            .map(entry => entry.value.trim())
            .filter(Boolean)
            .slice(0, 4)}
          contextualTensions={(profile?.patterns ?? [])
            .map(entry => entry.value.trim())
            .filter(Boolean)
            .slice(0, 2)}
          hasApprovedEvidence={
            usedSources.length > 0 ||
            Boolean(
              intelligence.previousConversation?.summary ||
                intelligence.outstandingCommitments.length > 0
            ) ||
            !preparationAdapter.isFirstSession
          }
          hasSavedPreparation={hasPreparationAiContent(aiBrief)}
          disabled={archived}
          showAiPreparation={showAiPreparation}
          insertedNotice={insertedNotice}
          changeApproachButtonRef={changeApproachButtonRef}
          startBusy={startBusy || isSaving}
          secondaryActionLabel={`Return to ${personName}`}
          onSecondaryAction={() => {
            if (confirmLeave()) onBack();
          }}
          onSave={savePreparation}
          onCancelRefinement={() => {
            setLiveValues(null);
            setFormSeed(cleanSessionText(draft));
            setPreparation(sessionToCoachPreparationDraft(draft));
            setFormDirty(false);
            setInsertedNotice("");
          }}
          onValuesChange={values => {
            setLiveValues(values);
            setPreparation(sessionToCoachPreparationDraft({
              prepPurpose: values.purpose,
              prepTopics: values.topics,
              prepQuestions: values.questions,
              prepRisks: values.desiredOutcome,
              prepPrivateNotes: values.privateNotes,
              focus: values.purpose,
            }));
            setFormDirty(true);
            setInsertedNotice("");
          }}
          onOpenContext={openContext}
          onViewSources={() => {
            openContext("preparation_brief", viewBriefButtonRef.current);
          }}
          onChangeApproach={() => setApproachDrawerOpen(true)}
          onRefreshBrief={() => void handleRefreshIntelligence()}
          onContinueWithExisting={() => {
            setBriefRefreshState("idle");
            setIntelligenceStatus(current =>
              hasPreparationAiContent(aiBrief) ? "ready" : current
            );
            setAiUnavailable("");
            setError("");
          }}
          onStartSession={() => {
            void handleStartConversation();
          }}
          error={error ? <p className="report-inline-error">{error}</p> : null}
        />
      </div>

      <PreparationContextDrawer
        section={drawerSection}
        intelligence={intelligence}
        relationshipSummary={{
          stage: coachingStatusLabel(client),
          focus: client.currentFocus.trim() || "Not recorded yet",
          latestConversation: journey.mostRecentCompleted
            ? journey.mostRecentSessionDateLabel
            : "No conversation yet",
          preparationApproach: PREPARATION_STYLE_LABELS[effectiveStyle],
        }}
        onClose={() => setDrawerSection(null)}
        triggerRef={contextTriggerRef}
        onInsertQuestion={insertQuestionFromDrawer}
      />

      <PreparationApproachDrawer
        open={approachDrawerOpen}
        relationshipId={client.id}
        defaultMode={coachDefaultMode}
        initialMode={intelligenceMode}
        client={{
          name: getRelationshipDisplayName(client),
          organisation: client.organisation,
          role: client.role,
          email: client.email,
        }}
        triggerRef={changeApproachButtonRef}
        onClose={() => setApproachDrawerOpen(false)}
        onSaved={handleApproachSaved}
      />

      <span
        className="sr-only"
        data-fingerprint={buildSourceFingerprint([
          draft.lastUpdated,
          profile?.updatedAt,
          liveValues?.privateNotes ? "notes" : "",
          generatedBrief.possibleFocus ?? "",
          effectiveStyle,
          usedSources.join(","),
        ])}
      />
    </JourneyStagePage>
  );
}

function generatedBriefToAiBriefFallback(
  brief: GeneratedPreparationBrief
): PreparationAiBrief {
  return {
    themes: brief.possibleFocus
      ? [{ title: brief.possibleFocus, basis: "Suggested from reviewed evidence" }]
      : [],
    exploration: brief.previousConversation ?? "",
    questions: brief.suggestedQuestions.slice(0, 4),
    reflectionPrompt: brief.desiredOutcomeSuggestion ?? "",
    patterns: [],
    developmentDirection: brief.coachingGuidance?.framework ?? "",
    historicalContext: [],
    additionalQuestions: brief.suggestedQuestions.slice(4),
    removedSections: [],
  };
}
