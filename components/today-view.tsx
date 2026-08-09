"use client";

import { useEffect, useMemo, useState } from "react";
import type { Client } from "@/lib/types";
import { apiJson } from "@/lib/api-client";
import type {
  DevelopmentUpdate,
  DevelopmentUpdateReviewTask,
} from "@/lib/development-updates/types";
import {
  CoachingPracticeOverview,
} from "@/components/identity/coaching-practice-overview";
import { ConversationsInProgress } from "@/components/identity/conversations-in-progress";
import { ManagerCommandCentre } from "@/components/identity/manager-command-centre";
import {
  NextBestAction,
  NextBestActionUpToDate,
} from "@/components/identity/next-best-action";
import { OnboardingPrompt } from "@/components/identity/onboarding-prompt";
import { PremiumWorkspaceHeader } from "@/components/identity/premium-workspace-header";
import { RecentDevelopment } from "@/components/identity/recent-development";
import { RelationshipPortfolio } from "@/components/identity/relationship-portfolio";
import type { HomeAttentionItem } from "@/lib/home-workspace";
import {
  FirstUserOnboarding,
  type FirstUserOnboardingResult,
} from "@/components/onboarding/first-user-onboarding";
import { PremiumEmptyHome } from "@/components/onboarding/premium-empty-home";
import { LatestApprovedReport } from "@/components/reports/latest-approved-report";
import {
  countConversationsInProgress,
  resolveHomeWorkspaceViewModel,
} from "@/lib/home-workspace";
import {
  clearFirstUserOnboardingDismiss,
  clearFirstUserOnboardingDraft,
  dismissFirstUserOnboarding,
  isFirstUserOnboardingDismissed,
  shouldShowFirstUserOnboarding,
} from "@/lib/first-user-onboarding";
import {
  onboardingFocusPerson,
  resolveOnboardingStageFromClients,
  type OnboardingStage,
} from "@/lib/onboarding";
import type { DevelopmentReport } from "@/lib/reports/types";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import { resolveProductLanguage } from "@/lib/role-language";
import { BRAND } from "@/lib/brand";

export function IdentityHomePage({
  clients,
  onOpenClient,
  onPrepare,
  onOpenSession,
  onOpenIntelligence,
  onOpenMyDevelopment,
  onReviewDevelopmentUpdate,
  onOpenReport,
  onCreatePerson,
  onViewPeople,
  coachName = "there",
  userId = "",
  coachId = "",
  onCreateClientForOnboarding,
  onCreateSessionForOnboarding,
  onPrepareAfterOnboarding,
  onViewRelationshipAfterOnboarding,
}: {
  clients: Client[];
  onOpenClient: (client: Client) => void;
  onPrepare: (client: Client) => void;
  onOpenSession?: (client: Client, sessionId: string) => void;
  onOpenIntelligence?: () => void;
  /** Manager own development — must not open team Development Intelligence. */
  onOpenMyDevelopment?: () => void;
  onReviewDevelopmentUpdate?: (client: Client, updateId: string) => void;
  onOpenReport?: (client: Client, reportId: string) => void;
  onCreatePerson?: () => void;
  onViewPeople?: () => void;
  coachName?: string;
  userId?: string;
  coachId?: string;
  onCreateClientForOnboarding?: (fields: {
    name?: string;
    organisation: string;
    role: string;
    currentFocus: string;
    email: string;
    identityMode?: "standard" | "confidential";
    displayLabel?: string;
    aiNameAllowed?: boolean;
  }) => Promise<{ id: string; name: string }>;
  onCreateSessionForOnboarding?: (input: {
    clientId: string;
    plannedDate: string;
    startTime: string;
    conversationFocus: string;
  }) => Promise<{ id: string }>;
  onPrepareAfterOnboarding?: (result: FirstUserOnboardingResult) => void;
  onViewRelationshipAfterOnboarding?: (result: FirstUserOnboardingResult) => void;
}) {
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);
  const [awaitingUpdates, setAwaitingUpdates] = useState<DevelopmentUpdateReviewTask[]>([]);
  const [recentlyApplied, setRecentlyApplied] = useState<
    Array<{ update: DevelopmentUpdate; clientId: string; clientName: string }>
  >([]);
  const [latestReport, setLatestReport] = useState<
    (DevelopmentReport & { personName?: string }) | null
  >(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() =>
    isFirstUserOnboardingDismissed(
      typeof window !== "undefined" ? window.localStorage : null,
      userId
    )
  );
  const [forceOnboarding, setForceOnboarding] = useState(false);
  const [retainOnboardingUi, setRetainOnboardingUi] = useState(false);
  const [onboardingInitialStep, setOnboardingInitialStep] = useState<
    "welcome" | "relationship"
  >("welcome");

  useEffect(() => {
    setOnboardingDismissed(
      isFirstUserOnboardingDismissed(
        typeof window !== "undefined" ? window.localStorage : null,
        userId
      )
    );
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiJson<{
          awaitingReview: DevelopmentUpdateReviewTask[];
          recentlyApplied?: Array<{
            update: DevelopmentUpdate;
            clientId: string;
            clientName: string;
          }>;
        }>("/api/development-updates");
        if (!cancelled) {
          setAwaitingUpdates(data.awaitingReview ?? []);
          setRecentlyApplied(data.recentlyApplied ?? []);
        }
      } catch {
        if (!cancelled) {
          setAwaitingUpdates([]);
          setRecentlyApplied([]);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [clients.length]);

  useEffect(() => {
    let cancelled = false;
    async function loadLatestReport() {
      try {
        const data = await apiJson<{
          report: (DevelopmentReport & { personName?: string }) | null;
        }>("/api/development-reports/latest");
        if (!cancelled) {
          setLatestReport(data.report ?? null);
        }
      } catch {
        if (!cancelled) setLatestReport(null);
      }
    }
    void loadLatestReport();
    return () => {
      cancelled = true;
    };
  }, [clients.length]);

  const onboardingStage = useMemo(
    () => resolveOnboardingStageFromClients(clients),
    [clients]
  );

  const viewModel = useMemo(
    () =>
      resolveHomeWorkspaceViewModel({
        clients,
        coachName,
        awaitingUpdates,
        recentlyAppliedUpdates: recentlyApplied,
        professionalRole: organisation?.professionalRole,
      }),
    [clients, coachName, awaitingUpdates, recentlyApplied, organisation?.professionalRole]
  );

  const totalConversationsInProgress = useMemo(
    () => countConversationsInProgress(clients),
    [clients]
  );

  const showFirstUserOnboarding =
    retainOnboardingUi ||
    shouldShowFirstUserOnboarding({
      clients,
      dismissed: onboardingDismissed,
      forceStart: forceOnboarding,
    });

  const showPremiumEmptyHome =
    !showFirstUserOnboarding && viewModel.emptyKind === "no_relationships";

  function clientById(id: string): Client | undefined {
    return clients.find(client => client.id === id);
  }

  function releaseOnboardingUi() {
    setRetainOnboardingUi(false);
    setForceOnboarding(false);
  }

  function handleDismissOnboarding() {
    dismissFirstUserOnboarding(
      typeof window !== "undefined" ? window.localStorage : null,
      userId,
      typeof window !== "undefined" ? window.sessionStorage : null
    );
    setOnboardingDismissed(true);
    releaseOnboardingUi();
  }

  function handleStartRelationshipFromEmpty() {
    clearFirstUserOnboardingDismiss(
      typeof window !== "undefined" ? window.localStorage : null,
      userId
    );
    clearFirstUserOnboardingDraft(
      typeof window !== "undefined" ? window.sessionStorage : null,
      userId
    );
    setOnboardingDismissed(false);
    setOnboardingInitialStep("relationship");
    setForceOnboarding(true);
  }

  function runAttentionAction(action: {
    actionKind: HomeAttentionItem["actionKind"] | NonNullable<typeof viewModel.nextBestAction>["actionKind"];
    relationshipId: string;
    sessionId?: string;
    updateId?: string;
  }) {
    if (action.actionKind === "create_person") {
      if (showPremiumEmptyHome) {
        handleStartRelationshipFromEmpty();
      } else {
        onCreatePerson?.();
      }
      return;
    }

    if (action.actionKind === "review_relationships") {
      onViewPeople?.();
      return;
    }

    const client = clientById(action.relationshipId);
    if (!client) return;

    if (
      (action.actionKind === "continue_conversation" ||
        action.actionKind === "complete_reflection" ||
        action.actionKind === "start_conversation") &&
      action.sessionId
    ) {
      if (onOpenSession) {
        onOpenSession(client, action.sessionId);
      } else {
        onOpenClient(client);
      }
      return;
    }

    if (action.actionKind === "review_development_update" && action.updateId) {
      if (onReviewDevelopmentUpdate) {
        onReviewDevelopmentUpdate(client, action.updateId);
      } else if (onOpenIntelligence) {
        onOpenIntelligence();
      } else {
        onOpenClient(client);
      }
      return;
    }

    if (action.actionKind === "prepare") {
      onPrepare(client);
      return;
    }

    onOpenClient(client);
  }

  function handleNextAction() {
    const action = viewModel.nextBestAction;
    if (!action) {
      onViewPeople?.();
      return;
    }
    runAttentionAction(action);
  }

  function handleAttentionItem(item: HomeAttentionItem) {
    runAttentionAction(item);
  }

  function handleOnboardingContinue(
    stage: Exclude<OnboardingStage, "welcome" | "complete">
  ) {
    if (stage === "create_person") {
      onCreatePerson?.();
      return;
    }

    const person = onboardingFocusPerson(clients, stage);
    if (!person) {
      onCreatePerson?.();
      return;
    }

    if (stage === "define_purpose") {
      onOpenClient(person);
      return;
    }

    onPrepare(person);
  }

  if (
    showFirstUserOnboarding &&
    onCreateClientForOnboarding &&
    onCreateSessionForOnboarding &&
    userId &&
    coachId
  ) {
    return (
      <section className="identity-home">
        <FirstUserOnboarding
          key={`${userId}-${onboardingInitialStep}-${forceOnboarding ? "force" : "auto"}`}
          userId={userId}
          coachId={coachId}
          initialStep={onboardingInitialStep}
          onDismiss={handleDismissOnboarding}
          onCreateClient={onCreateClientForOnboarding}
          onCreateSession={onCreateSessionForOnboarding}
          onFlowActive={() => setRetainOnboardingUi(true)}
          onPrepare={result => {
            releaseOnboardingUi();
            onPrepareAfterOnboarding?.(result);
          }}
          onViewRelationship={result => {
            releaseOnboardingUi();
            onViewRelationshipAfterOnboarding?.(result);
          }}
        />
      </section>
    );
  }

  if (showPremiumEmptyHome) {
    return (
      <section className="identity-home">
        <PremiumEmptyHome onCreateRelationship={handleStartRelationshipFromEmpty} />
      </section>
    );
  }

  const continueStage =
    onboardingStage === "define_purpose" || onboardingStage === "prepare"
      ? onboardingStage
      : null;
  const continuePerson = continueStage
    ? onboardingFocusPerson(clients, continueStage)
    : undefined;

  // Prefer the signature Next Best Action when it already expresses the same next step.
  const showOnboardingPrompt = Boolean(
    continueStage &&
      !(
        viewModel.nextBestAction &&
        continuePerson &&
        viewModel.nextBestAction.relationshipId === continuePerson.id &&
        ((continueStage === "prepare" &&
          viewModel.nextBestAction.actionKind === "prepare") ||
          (continueStage === "define_purpose" &&
            viewModel.nextBestAction.actionKind === "open_relationship"))
      )
  );

  const isManager = organisation?.professionalRole === "manager";

  if (isManager) {
    return (
      <section className="identity-home identity-reveal">
        {showOnboardingPrompt && continueStage ? (
          <OnboardingPrompt
            stage={continueStage}
            personName={continuePerson?.name}
            onContinue={() => handleOnboardingContinue(continueStage)}
          />
        ) : null}
        <ManagerCommandCentre
          greeting={viewModel.greeting}
          coachName={viewModel.coachName}
          todayAttention={viewModel.todayAttention}
          recentDevelopment={viewModel.recentDevelopment}
          overview={viewModel.overview}
          canOpenOrganisation={Boolean(organisation?.showOrganisationNav)}
          onAttentionAction={handleAttentionItem}
          onOpenPerson={relationshipId => {
            const client = clientById(relationshipId);
            if (client) onOpenClient(client);
          }}
          onOpenPeople={() => onViewPeople?.()}
          onOpenMyDevelopment={() => onOpenMyDevelopment?.()}
          onOpenOrganisation={() => {
            window.location.href = "/organisation/intelligence";
          }}
          onOpenEvidence={
            awaitingUpdates.length > 0
              ? () => {
                  const first = awaitingUpdates[0];
                  const client = first ? clientById(first.clientId) : undefined;
                  if (client && first && onReviewDevelopmentUpdate) {
                    onReviewDevelopmentUpdate(client, first.update.id);
                  } else {
                    onViewPeople?.();
                  }
                }
              : () => onViewPeople?.()
          }
        />
      </section>
    );
  }

  return (
    <section className="identity-home identity-reveal">
      <PremiumWorkspaceHeader
        coachName={viewModel.coachName}
        greeting={viewModel.greeting}
        summary={viewModel.workspaceSummary || language.homeSummary}
        eyebrow={language.homeTitle}
        onCreatePerson={() => onCreatePerson?.()}
      />

      {showOnboardingPrompt && continueStage ? (
        <OnboardingPrompt
          stage={continueStage}
          personName={continuePerson?.name}
          onContinue={() => handleOnboardingContinue(continueStage)}
        />
      ) : null}

      <div className="identity-home-sections">
        {awaitingUpdates.length > 0 ? (
          <p className="aurelia-home-nudge" role="status">
            <strong>{BRAND.intelligenceName}:</strong>{" "}
            {awaitingUpdates.length === 1
              ? "One team member has an action or update awaiting review."
              : `${awaitingUpdates.length} team members have actions or updates awaiting review.`}
          </p>
        ) : null}

        <div className="home-primary-grid">
          {viewModel.nextBestAction ? (
            <NextBestAction
              personName={viewModel.nextBestAction.personName}
              role={viewModel.nextBestAction.role}
              organisation={viewModel.nextBestAction.organisation}
              eyebrow={viewModel.nextBestAction.eyebrow}
              title={viewModel.nextBestAction.title}
              explanation={viewModel.nextBestAction.explanation}
              evidence={viewModel.nextBestAction.evidence}
              status={viewModel.nextBestAction.status}
              actionLabel={viewModel.nextBestAction.actionLabel}
              onAction={handleNextAction}
              onOpenRelationship={
                viewModel.nextBestAction.relationshipId
                  ? () => {
                      const client = clientById(
                        viewModel.nextBestAction!.relationshipId
                      );
                      if (client) onOpenClient(client);
                    }
                  : undefined
              }
            />
          ) : (
            <NextBestActionUpToDate
              title={language.workUpToDateTitle}
              onReviewRelationships={() => onViewPeople?.()}
            />
          )}

          <CoachingPracticeOverview
            eyebrow={language.overviewEyebrow}
            title={language.overviewTitle}
            description={language.overviewDescription}
            items={[
              {
                label: language.peopleISupport,
                value: viewModel.overview.activeRelationships,
              },
              {
                label: "Conversations in progress",
                value: viewModel.overview.conversationsInProgress,
              },
              {
                label: "Awaiting preparation",
                value: viewModel.overview.awaitingPreparation,
              },
              {
                label: "Recent reflections",
                value: viewModel.overview.recentReflections,
                supportingText: "Last 30 days",
              },
            ]}
          />
        </div>

        <div className="home-secondary-grid">
          <ConversationsInProgress
            items={viewModel.conversationsInProgress.map(item => ({
              id: item.id,
              personName: item.personName,
              context: item.context,
              state: item.state,
              stateDescription: item.stateDescription,
              updatedLabel: item.updatedLabel,
              actionLabel: item.actionLabel,
              onAction: () => {
                const client = clientById(item.relationshipId);
                if (!client) return;
                if (onOpenSession) {
                  onOpenSession(client, item.sessionId);
                } else {
                  onOpenClient(client);
                }
              },
            }))}
            totalCount={totalConversationsInProgress}
            onViewAll={() => onViewPeople?.()}
            description={language.activeWorkDescription}
          />

          <RecentDevelopment
            items={viewModel.recentDevelopment}
            description={language.recentDevelopmentDescription}
            onOpen={id => {
              const item = viewModel.recentDevelopment.find(entry => entry.id === id);
              const client = item ? clientById(item.relationshipId) : undefined;
              if (client) onOpenClient(client);
            }}
          />
        </div>

        {latestReport && latestReport.status === "approved" ? (
          <div className="home-latest-report">
            <LatestApprovedReport
              report={latestReport}
              onOpen={() => {
                const client = clientById(latestReport.relationshipId);
                if (!client || !onOpenReport) return;
                onOpenReport(client, latestReport.id);
              }}
            />
          </div>
        ) : null}

        {viewModel.relationships.length > 0 ? (
          <RelationshipPortfolio
            items={viewModel.relationships}
            title={`Your ${language.relationshipPlural}`}
            description={`A focused view of your active ${language.relationshipPlural}.`}
            onOpen={id => {
              const client = clientById(id);
              if (client) onOpenClient(client);
            }}
            onViewAll={() => onViewPeople?.()}
          />
        ) : null}
      </div>
    </section>
  );
}

/** @deprecated Prefer IdentityHomePage — kept for existing HomeApp imports. */
export const TodayView = IdentityHomePage;
