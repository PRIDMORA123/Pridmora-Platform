"use client";

import { useMemo } from "react";
import { AddSessionControl } from "@/components/relationship-workspace/add-session-control";
import { CoachingMomentsSection } from "@/components/relationship-workspace/coaching-moments-section";
import { CurrentConversationCard } from "@/components/relationship-workspace/current-conversation-card";
import { CurrentPositionPanel } from "@/components/relationship-workspace/current-position-panel";
import { PreviousConversationsGallery } from "@/components/relationship-workspace/previous-conversations-gallery";
import { RelationshipCanvasHeader } from "@/components/relationship-workspace/relationship-canvas-header";
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
import { getFutureOrOpenSession } from "@/lib/session-workflow";
import { isSessionCompleted } from "@/lib/client-journey";
import type { Client, Session } from "@/lib/types";

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
  onViewReports: () => void;
  onViewSupportingContext?: () => void;
  onCreateSession: (values: AddSessionFormValues) => Promise<void>;
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
  onViewReports,
  onCreateSession,
  onSaveAgreement,
  onSaveInitialConversation,
  onNewCoachingMoment,
  onOpenCoachingMoment,
}: RelationshipCanvasProps) {
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

  return (
    <div className="relationship-workspace relationship-canvas">
      {/* A. Relationship identity */}
      <RelationshipCanvasHeader
        clientName={relationship.name}
        role={relationship.role}
        organisation={relationship.organisation}
        startedLabel={resolvedStarted}
        status={archived ? "Archived" : relationship.status}
        actions={actions}
      />

      {/* B. Current position */}
      <CurrentPositionPanel
        narrative={narrative}
        identitySummary={relationship.identitySummary}
        developmentDirection={developmentDirection}
        currentFocus={relationship.currentFocus}
        clientName={relationship.name}
        outstandingCommitment={outstandingCommitment}
        sessions={relationship.sessions}
      />

      {/* C. One primary next action */}
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

      {/* D. Current conversation */}
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
            Current conversation
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
                archived={archived}
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

      {/* E. Development snapshot */}
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

      {/* F. Previous conversations */}
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
