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
import { BRAND } from "@/lib/brand";

export type RelationshipCanvasProps = {
  relationship: Client;
  currentSession?: Session | null;
  narrative?: string | null;
  outstandingCommitment?: string | null;
  developmentDirection?: string | null;
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
  onPrepareConversation?: () => void;
  onRecordConversation?: () => void;
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
  developmentDirection = null,
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
  const activeSession =
    currentSession ?? getFutureOrOpenSession(relationship.sessions) ?? null;

  const clientFirstName = relationship.name.trim().split(/\s+/)[0] || undefined;
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
    // Prefer longitudinal identity summary over latest session narrative.
    currentPosition:
      relationship.identitySummary || developmentDirection || narrative,
    strengths: strengthModels.map(item => item.name),
    priorities:
      developmentPriorities.length > 0
        ? developmentPriorities
        : relationship.themes.slice(0, 3),
    direction: developmentDirection,
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
        <div className="person-overview-actions" role="group" aria-label="Primary actions">
          <button
            type="button"
            className="identity-button is-primary"
            onClick={() => {
              if (onPrepareConversation) {
                onPrepareConversation();
                return;
              }
              handleSpinePrimary();
            }}
          >
            Prepare with {BRAND.intelligenceName}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (onRecordConversation) {
                onRecordConversation();
                return;
              }
              if (activeSession) {
                onOpenSession(activeSession.id);
                return;
              }
              handleSpinePrimary();
            }}
          >
            Record Conversation
          </button>
          {onAddEvidence ? (
            <button type="button" className="secondary" onClick={onAddEvidence}>
              + Add Development Evidence
            </button>
          ) : null}
        </div>
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
          {!archived ? (
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
          ) : (
            <p className="muted">
              Restore this relationship to plan the next conversation.
            </p>
          )}
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
