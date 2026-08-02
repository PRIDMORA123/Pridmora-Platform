"use client";

import { useMemo } from "react";
import { CoachingJourneyNavigation } from "@/components/coaching-journey/coaching-journey-navigation";
import {
  buildCoachingJourneyEvidence,
  deriveAllCoachingJourneyStates,
  STAGE_TO_LEGACY_TAB,
  type CoachingJourneyStageId,
} from "@/lib/coaching-journey";
import type { Client, Session } from "@/lib/types";
import type { ClientWorkspaceTab } from "@/components/client-workspace-tabs";

export type CoachingJourneyStageProps = {
  activeStage: CoachingJourneyStageId;
  relationship: Pick<Client, "id" | "sessions" | "identitySummary" | "themes" | "goals">;
  activeSession?: Session | null;
  reportsAvailable?: boolean;
  onNavigateStage: (stage: CoachingJourneyStageId) => void;
  /** Bridge for existing home-app tab handler while migration completes. */
  onTabChange?: (tab: ClientWorkspaceTab) => void;
  children: React.ReactNode;
};

export function CoachingJourneyStage({
  activeStage,
  relationship,
  activeSession = null,
  reportsAvailable = false,
  onNavigateStage,
  onTabChange,
  children,
}: CoachingJourneyStageProps) {
  const stageStates = useMemo(() => {
    const evidence = buildCoachingJourneyEvidence(relationship, {
      activeSession,
      reportsAvailable,
    });
    return deriveAllCoachingJourneyStates(evidence, activeStage);
  }, [relationship, activeSession, reportsAvailable, activeStage]);

  return (
    <div className="identity-coaching-journey-shell">
      <CoachingJourneyNavigation
        activeStage={activeStage}
        stageStates={stageStates}
        onNavigate={stage => {
          onNavigateStage(stage);
          onTabChange?.(STAGE_TO_LEGACY_TAB[stage] as ClientWorkspaceTab);
        }}
      />
      {children}
    </div>
  );
}
