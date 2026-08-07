"use client";

import { useRef } from "react";
import { RelationshipIdentityBar } from "@/components/coaching-journey/relationship-identity-bar";
import { StageOrientation } from "@/components/coaching-journey/stage-orientation";
import { JourneyNextStep } from "@/components/coaching-journey/journey-next-step";
import { StagePrimaryAction } from "@/components/coaching-journey/stage-primary-action";
import { CoachingNextAction } from "@/components/coaching-journey/coaching-next-action";
import { CurrentPositionSnapshot } from "@/components/current-position/current-position-snapshot";
import { SessionTimeline } from "@/components/current-position/session-timeline";
import {
  RelationshipDetailsSummary,
  type RelationshipDetailsSummaryModel,
} from "@/components/current-position/relationship-details-summary";
import { CoachingMomentLauncher } from "@/components/coaching-moments/coaching-moment-launcher";
import { RecentCoachingMoments } from "@/components/coaching-moments/recent-coaching-moments";
import { IdentityObservation } from "@/components/identity-intelligence";
import {
  buildCurrentPositionCardModel,
  getRelationshipPrimaryAction,
  STAGE_ORIENTATION_COPY,
  type RelationshipPrimaryAction,
} from "@/lib/coaching-journey";
import type { CoachingMoment } from "@/lib/coaching-moments/coaching-moment";
import type { Client, Session } from "@/lib/types";
import type {
  InitialConversation,
  RelationshipAgreement,
} from "@/lib/relationship-meta";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import { resolveProductLanguage } from "@/lib/role-language";

export type CurrentPositionViewProps = {
  relationship: Client;
  currentSession?: Session | null;
  developmentSnapshotText?: string | null;
  outstandingCommitment?: string | null;
  relationshipDetails: RelationshipDetailsSummaryModel;
  nextSessionLabel?: string | null;
  narrative?: string | null;
  actions?: React.ReactNode;
  archived?: boolean;
  recentCoachingMoments?: CoachingMoment[];
  onPrimaryAction: (action: RelationshipPrimaryAction) => void;
  onOpenSession: (sessionId: string) => void;
  onPrepare: (sessionId?: string) => void;
  onSchedule: () => void;
  onViewDevelopment: () => void;
  onSaveAgreement: (next: RelationshipAgreement) => Promise<void>;
  onSaveInitialConversation: (next: InitialConversation) => Promise<void>;
  onNewCoachingMoment?: () => void;
  onOpenCoachingMoment?: (moment: CoachingMoment) => void;
};

export function CurrentPositionView({
  relationship,
  currentSession = null,
  developmentSnapshotText = null,
  outstandingCommitment = null,
  relationshipDetails,
  nextSessionLabel = null,
  narrative = null,
  actions,
  archived = false,
  recentCoachingMoments = [],
  onPrimaryAction,
  onOpenSession,
  onPrepare,
  onSchedule,
  onViewDevelopment,
  onSaveAgreement,
  onSaveInitialConversation,
  onNewCoachingMoment,
  onOpenCoachingMoment,
}: CurrentPositionViewProps) {
  const launcherRef = useRef<HTMLButtonElement>(null);
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);
  const primaryAction = getRelationshipPrimaryAction({
    relationship,
    currentSession,
  });
  const orientation = STAGE_ORIENTATION_COPY.current_position;

  const positionModel = buildCurrentPositionCardModel({
    narrative,
    identitySummary: relationship.identitySummary,
    currentFocus: relationship.currentFocus,
    clientName: relationship.name,
    nextSessionLabel,
    outstandingCommitment,
  });

  const nextStepNow = currentSession
    ? `Working with ${relationship.name}`
    : `Reviewing ${relationship.name}`;
  const nextStepNext = primaryAction?.label || "Choose the next coaching step";

  return (
    <>
      <div className="journey-stage-page__chrome">
        <RelationshipIdentityBar
          clientName={relationship.name}
          role={relationship.role}
          organisation={relationship.organisation}
          sessionNumber={currentSession?.sessionNumber}
          sessionTitle={currentSession?.title || currentSession?.focus}
          sessionDate={currentSession?.date}
          sessionTime={currentSession?.time}
          status={currentSession?.status}
          actions={actions}
        />
        <StageOrientation
          title={orientation.title}
          description={orientation.description}
        />
      </div>

      <main className="identity-stage-content stage-workspace">
        <CurrentPositionSnapshot model={positionModel} />

        <JourneyNextStep now={nextStepNow} next={nextStepNext} />

        <StagePrimaryAction>
          <CoachingNextAction
            action={primaryAction}
            onAction={onPrimaryAction}
          />
        </StagePrimaryAction>

        {developmentSnapshotText ? (
          <IdentityObservation
            title="Today’s observation"
            evidenceStrength="emerging"
            evidenceLabel="Drawn from the approved development record."
            reviewState="draft"
            compact
          >
            <p>{developmentSnapshotText}</p>
          </IdentityObservation>
        ) : null}

        {onNewCoachingMoment && !archived ? (
          <div className="coaching-moment-secondary-actions">
            <CoachingMomentLauncher
              buttonRef={launcherRef}
              variant="quiet"
              label={language.newMomentLabel}
              onLaunch={onNewCoachingMoment}
            />
          </div>
        ) : null}

        <SessionTimeline
          sessions={relationship.sessions}
          archived={archived}
          onOpenSession={onOpenSession}
          onPrepare={onPrepare}
          onSchedule={onSchedule}
        />

        <RecentCoachingMoments
          moments={recentCoachingMoments}
          onOpenMoment={onOpenCoachingMoment}
        />

        <RelationshipDetailsSummary
          details={relationshipDetails}
          disabled={archived}
          onSaveAgreement={onSaveAgreement}
          onSaveInitialConversation={onSaveInitialConversation}
          onOpenDevelopment={onViewDevelopment}
        />
      </main>
    </>
  );
}
