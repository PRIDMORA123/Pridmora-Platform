"use client";

import { useMemo } from "react";
import { AddSessionControl } from "@/components/relationship-workspace/add-session-control";
import { CoachingMomentsSection } from "@/components/relationship-workspace/coaching-moments-section";
import { CurrentConversationCard } from "@/components/relationship-workspace/current-conversation-card";
import { CurrentPositionPanel } from "@/components/relationship-workspace/current-position-panel";
import { PreviousConversationsGallery } from "@/components/relationship-workspace/previous-conversations-gallery";
import { RelationshipCanvasHeader } from "@/components/relationship-workspace/relationship-canvas-header";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import { resolveProductLanguage } from "@/lib/role-language";
import { RelationshipDevelopmentPreview } from "@/components/relationship-workspace/relationship-development-preview";
import {
  buildReportsPreviewModel,
  RelationshipReportsPreview,
} from "@/components/relationship-workspace/relationship-reports-preview";
import {
  RelationshipDetailsSummary,
  type RelationshipDetailsSummaryModel,
} from "@/components/current-position/relationship-details-summary";
import type { RelationshipPrimaryAction } from "@/lib/coaching-journey";
import type { CoachingMoment } from "@/lib/coaching-moments/coaching-moment";
import type { AddSessionFormValues } from "@/lib/relationship-workspace";
import type { SessionModuleId } from "@/lib/relationship-workspace";
import {
  buildRelationshipActionState,
  getPrimaryRelationshipAction,
  primaryActionToModuleId,
} from "@/lib/relationship-workspace/get-primary-relationship-action";
import { buildPersonNextConversationModel } from "@/lib/relationship-workspace/person-next-conversation";
import type {
  InitialConversation,
  RelationshipAgreement,
} from "@/lib/relationship-meta";
import {
  buildPersonSummary,
  limitToOneSentence,
} from "@/lib/development-evidence/display-copy";
import { getFutureOrOpenSession } from "@/lib/session-workflow";
import { isSessionCompleted } from "@/lib/client-journey";
import type { Client, Session } from "@/lib/types";

export type RelationshipCanvasProps = {
  relationship: Client;
  currentSession?: Session | null;
  narrative?: string | null;
  outstandingCommitment?: string | null;
  /** Canonical open commitments (profile open + open actions). Not session history. */
  openCommitments?: string[];
  developmentDirection?: string | null;
  /** Present-state developmental picture for “Who is …?” — not a forward focus. */
  presentDevelopmentalState?: string | null;
  developmentStrengths?: string[];
  developmentPriorities?: string[];
  developmentPattern?: string | null;
  relationshipDetails: RelationshipDetailsSummaryModel;
  startedLabel?: string | null;
  archived?: boolean;
  actions?: React.ReactNode;
  recentCoachingMoments?: CoachingMoment[];
  sessionsLoadError?: boolean;
  developmentLoadError?: boolean;
  reportsLoadError?: boolean;
  coachingMomentsLoadError?: boolean;
  onRetrySessions?: () => void;
  onRetryDevelopment?: () => void;
  onRetryCoachingMoments?: () => void;
  onPrimaryAction: (action: RelationshipPrimaryAction) => void;
  onModuleAction: (sessionId: string, moduleId: SessionModuleId) => void;
  onOpenSession: (sessionId: string) => void;
  onViewDevelopment: () => void;
  onAddEvidence?: () => void;
  /** Prepare for the given session id (canonical next-conversation session). */
  onPrepareConversation?: (sessionId?: string) => void;
  /** Open/record the given session id without requiring Aurelia preparation. */
  onRecordConversation?: (sessionId?: string) => void;
  onViewReports: () => void;
  onViewSupportingContext?: () => void;
  onCreateSession: (values: AddSessionFormValues) => Promise<void>;
  /** Disables create-conversation controls while a create is in flight. */
  busy?: boolean;
  onSaveAgreement: (next: RelationshipAgreement) => Promise<void>;
  onSaveInitialConversation: (next: InitialConversation) => Promise<void>;
  onNewCoachingMoment?: () => void;
  onOpenCoachingMoment?: (moment: CoachingMoment) => void;
};

function formatStartedLabel(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function RelationshipCanvas({
  relationship,
  currentSession = null,
  narrative = null,
  outstandingCommitment = null,
  openCommitments = [],
  developmentDirection = null,
  presentDevelopmentalState = null,
  developmentStrengths = [],
  developmentPriorities = [],
  relationshipDetails,
  startedLabel = null,
  archived = false,
  actions,
  recentCoachingMoments = [],
  sessionsLoadError = false,
  developmentLoadError = false,
  reportsLoadError = false,
  coachingMomentsLoadError = false,
  onRetrySessions,
  onRetryDevelopment,
  onRetryCoachingMoments,
  onPrimaryAction,
  onModuleAction,
  onOpenSession,
  onViewDevelopment,
  onAddEvidence,
  onPrepareConversation,
  onRecordConversation,
  onViewReports,
  onCreateSession,
  busy = false,
  onSaveAgreement,
  onSaveInitialConversation,
  onNewCoachingMoment,
  onOpenCoachingMoment,
}: RelationshipCanvasProps) {
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);
  const clientFirstName = relationship.name.trim().split(/\s+/)[0] || undefined;
  // Lower-page current conversation detail may still surface awaiting work.
  const activeSession =
    currentSession ?? getFutureOrOpenSession(relationship.sessions) ?? null;
  // Top next-conversation strip uses prepare-canonical selection so identity
  // and Prepare/Record destinations cannot disagree.
  const nextConversation = buildPersonNextConversationModel(
    relationship.sessions,
    { clientFirstName }
  );
  const nextSession = nextConversation.session;

  const resolvedStarted =
    startedLabel ?? formatStartedLabel(relationship.createdAt);

  const completed = relationship.sessions.filter(isSessionCompleted);
  const approvedSummaries = relationship.sessions.filter(
    session =>
      session.summaryStatus === "approved" || session.aiSummaryApproved
  );
  const latestCompleted = [...completed].sort(
    (a, b) => b.sessionNumber - a.sessionNumber
  )[0];

  const reportsModel = useMemo(
    () =>
      buildReportsPreviewModel({
        completedSessionCount: completed.length,
        approvedSummaryCount: approvedSummaries.length,
        hasDevelopmentSummary: Boolean(
          developmentDirection?.trim() || relationship.identitySummary.trim()
        ),
        latestSessionNumber: latestCompleted?.sessionNumber ?? null,
      }),
    [
      completed.length,
      approvedSummaries.length,
      developmentDirection,
      relationship.identitySummary,
      latestCompleted?.sessionNumber,
    ]
  );

  const actionState = buildRelationshipActionState({
    session: activeSession,
    relationshipActive: !archived,
  });
  const workspacePrimary = getPrimaryRelationshipAction(actionState);

  // One primary CTA after Current Position only when a current conversation exists.
  // Empty-state "Plan next conversation" lives solely inside Current Conversation.
  const showSpinePrimary =
    Boolean(activeSession) &&
    workspacePrimary.action !== "none" &&
    workspacePrimary.action !== "plan_conversation";

  const strengthModels =
    relationship.strengths.length > 0
      ? relationship.strengths
      : developmentStrengths.map((name, index) => ({
          id: `strength-${index}`,
          name,
          stage: "Developing" as const,
          evidence: "",
        }));

  function handleSpinePrimary() {
    if (!activeSession) {
      onPrimaryAction({
        kind: "schedule_conversation",
        label: workspacePrimary.label,
        stage: "current_position",
      });
      return;
    }
    const moduleId = primaryActionToModuleId(workspacePrimary.action);
    if (moduleId) {
      onModuleAction(activeSession.id, moduleId);
    }
  }

  const personSummary = buildPersonSummary({
    name: relationship.name,
    // Present-state intelligence first — never use forward focus as “who”.
    presentDevelopmentalState,
    currentPosition: presentDevelopmentalState
      ? null
      : relationship.identitySummary || narrative,
    strengths: strengthModels.map(item => item.name),
    priorities:
      developmentPriorities.length > 0
        ? developmentPriorities
        : relationship.themes.slice(0, 3),
    direction: presentDevelopmentalState ? null : developmentDirection,
    completedConversationCount: completed.length,
  });

  const priorityItems = (
    developmentPriorities.length > 0
      ? developmentPriorities
      : relationship.themes
  ).slice(0, 3);

  const recentProgress = completed
    .slice()
    .sort((a, b) => b.sessionNumber - a.sessionNumber)
    .slice(0, 3)
    .map(session => {
      const text =
        session.emergingThemes?.trim() ||
        session.focus?.trim() ||
        session.summary?.trim() ||
        "";
      return text.split(/[.!?]/)[0]?.trim() || text;
    })
    .filter(Boolean);

  const currentPositionStatement = limitToOneSentence(
    developmentDirection ||
      relationship.identitySummary ||
      relationship.currentFocus ||
      narrative ||
      ""
  );

  return (
    <div className="relationship-workspace relationship-canvas">
      {/* A. Relationship identity */}
      <RelationshipCanvasHeader
        clientName={relationship.name}
        role={relationship.role}
        organisation={relationship.organisation}
        startedLabel={resolvedStarted}
        status={archived ? "Archived" : relationship.status}
        relationshipLabel={
          language.relationshipSingular.charAt(0).toUpperCase() +
          language.relationshipSingular.slice(1)
        }
        actions={actions}
      />

      {!archived ? (
        <section
          className="person-next-conversation"
          aria-labelledby="person-next-conversation-title"
          data-testid="person-next-conversation"
          data-next-session-id={nextSession?.id ?? ""}
          data-next-kind={nextConversation.kind}
        >
          <p className="person-next-conversation__eyebrow" id="person-next-conversation-title">
            Next conversation
          </p>
          {nextConversation.headline ? (
            <h2 className="person-next-conversation__headline">
              {nextConversation.headline}
            </h2>
          ) : (
            <h2 className="person-next-conversation__headline">
              No conversation is planned yet
            </h2>
          )}
          {nextConversation.supportingCopy ? (
            <p className="person-next-conversation__copy">
              {nextConversation.supportingCopy}
            </p>
          ) : null}

          <div
            className="person-overview-actions person-next-conversation__actions"
            role="group"
            aria-label="Next conversation actions"
          >
            {nextConversation.primaryAction === "plan" ? (
              <AddSessionControl
                sessions={relationship.sessions}
                clientName={relationship.name}
                clientId={relationship.id}
                archived={archived}
                busy={busy}
                showProminent
                label={nextConversation.primaryLabel}
                onCreate={onCreateSession}
                onContinueSession={onOpenSession}
              />
            ) : (
              <button
                type="button"
                className="identity-button is-primary"
                data-testid="person-next-primary"
                onClick={() => {
                  if (!nextSession) return;
                  if (nextConversation.primaryAction === "prepare") {
                    if (onPrepareConversation) {
                      onPrepareConversation(nextSession.id);
                      return;
                    }
                    onModuleAction(nextSession.id, "prepare");
                    return;
                  }
                  if (onRecordConversation) {
                    onRecordConversation(nextSession.id);
                    return;
                  }
                  onOpenSession(nextSession.id);
                }}
              >
                {nextConversation.primaryLabel}
              </button>
            )}
            {nextConversation.secondaryAction === "open" && nextSession ? (
              <button
                type="button"
                className="secondary"
                data-testid="person-next-secondary"
                onClick={() => {
                  if (onRecordConversation) {
                    onRecordConversation(nextSession.id);
                    return;
                  }
                  onOpenSession(nextSession.id);
                }}
              >
                {nextConversation.secondaryLabel}
              </button>
            ) : null}
            {onAddEvidence ? (
              <button
                type="button"
                className="secondary person-next-conversation__evidence"
                data-testid="person-add-development-evidence"
                onClick={onAddEvidence}
              >
                + Add Development Evidence
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* B. Who is this person? — longitudinal, not latest event */}
      <section
        className="person-overview-summary"
        aria-labelledby="who-is-person-title"
      >
        <h2 id="who-is-person-title">Who is {clientFirstName}?</h2>
        <p>{personSummary}</p>
      </section>

      {/* C. Current Development — one section, concise subsections */}
      <section
        className="person-overview-current-development"
        aria-labelledby="current-development-title"
      >
        <h2 id="current-development-title">Current Development</h2>
        {currentPositionStatement ? (
          <div className="person-overview-current-development__block">
            <h3>Current position</h3>
            <p>{currentPositionStatement}</p>
          </div>
        ) : null}

        {priorityItems.length > 0 ? (
          <div className="person-overview-current-development__block">
            <h3>Current priorities</h3>
            <ul className="development-evidence-list">
              {priorityItems.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {recentProgress.length > 0 ? (
          <div className="person-overview-current-development__block">
            <h3>Recent progress</h3>
            <ul className="development-evidence-list">
              {recentProgress.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {outstandingCommitment?.trim() ? (
          <div className="person-overview-current-development__block">
            <h3>Outstanding commitment</h3>
            <p>{outstandingCommitment.trim()}</p>
          </div>
        ) : null}

        {!currentPositionStatement &&
        priorityItems.length === 0 &&
        recentProgress.length === 0 &&
        !outstandingCommitment?.trim() ? (
          <p className="muted">
            No current development position identified yet.
          </p>
        ) : null}

        {/* Keep detailed panel available but visually secondary */}
        <details className="person-overview-current-development__detail">
          <summary>View supporting detail</summary>
          <CurrentPositionPanel
            narrative={narrative}
            identitySummary={relationship.identitySummary}
            developmentDirection={developmentDirection}
            currentFocus={relationship.currentFocus}
            clientName={relationship.name}
            outstandingCommitment={outstandingCommitment}
            openCommitments={openCommitments}
            sessions={relationship.sessions}
          />
        </details>
      </section>

      {/* Development snapshot — highly rated in UAT */}
      <RelationshipDevelopmentPreview
        currentDirection={
          developmentDirection ||
          relationship.identitySummary ||
          relationship.currentFocus
        }
        strengths={strengthModels}
        priorities={
          developmentPriorities.length > 0
            ? developmentPriorities
            : relationship.themes.slice(0, 4)
        }
        currentFocus={relationship.currentFocus}
        completedSessionCount={completed.length}
        loadError={developmentLoadError}
        onViewDevelopment={onViewDevelopment}
        onRetry={onRetryDevelopment}
      />

      <div className="person-overview-intelligence-link">
        <button
          type="button"
          className="identity-button is-secondary"
          onClick={onViewDevelopment}
        >
          Development Intelligence
        </button>
      </div>

      {/* Current conversation — after understanding the person */}
      {showSpinePrimary ? (
        <div className="relationship-workspace__primary-action">
          <button
            type="button"
            className="identity-button is-primary"
            onClick={handleSpinePrimary}
          >
            {workspacePrimary.label}
          </button>
        </div>
      ) : null}

      {activeSession ? (
        <CurrentConversationCard
          session={activeSession}
          clientFirstName={clientFirstName}
          onModuleAction={moduleId =>
            onModuleAction(activeSession.id, moduleId)
          }
        />
      ) : (
        <section
          className="current-conversation-card current-conversation-card--empty current-conversation-card--primary-surface"
          aria-labelledby="current-conversation-title"
        >
          <p className="current-conversation-card__eyebrow">
            Recent conversations
          </p>
          <h2
            id="current-conversation-title"
            className="current-conversation-card__title"
          >
            No conversation is planned yet.
          </h2>
          <p className="current-conversation-card__empty-copy">
            Create the next conversation when you are ready to continue the
            relationship.
          </p>
          {!archived && nextConversation.kind !== "plan" ? (
            <div className="current-conversation-card__primary">
              <AddSessionControl
                sessions={relationship.sessions}
                clientName={relationship.name}
                clientId={relationship.id}
                archived={archived}
                busy={busy}
                showProminent
                label="Plan next conversation"
                onCreate={onCreateSession}
                onContinueSession={onOpenSession}
              />
            </div>
          ) : archived ? (
            <p className="muted">
              Restore this relationship to plan the next conversation.
            </p>
          ) : null}
        </section>
      )}

      {/* Conversation history after person understanding */}
      <PreviousConversationsGallery
        sessions={relationship.sessions}
        currentSessionId={activeSession?.id}
        onOpenSession={onOpenSession}
        loadError={sessionsLoadError}
        onRetry={onRetrySessions}
      />

      {/* G. Reports */}
      {reportsLoadError ? (
        <section
          className="relationship-reports-preview relationship-reports-preview--secondary"
          aria-labelledby="reports-title"
        >
          <h2 id="reports-title">Reports</h2>
          <div className="relationship-canvas__recoverable" role="alert">
            <p>Reports temporarily unavailable</p>
          </div>
        </section>
      ) : (
        <RelationshipReportsPreview
          model={reportsModel}
          onViewReports={onViewReports}
        />
      )}

      {/* H. Coaching Moments */}
      <CoachingMomentsSection
        moments={recentCoachingMoments}
        archived={archived}
        loadError={coachingMomentsLoadError}
        onNewMoment={onNewCoachingMoment}
        onOpenMoment={onOpenCoachingMoment}
        onRetry={onRetryCoachingMoments}
      />

      {/* I. Relationship details */}
      <RelationshipDetailsSummary
        details={relationshipDetails}
        disabled={archived}
        onSaveAgreement={onSaveAgreement}
        onSaveInitialConversation={onSaveInitialConversation}
      />
    </div>
  );
}
