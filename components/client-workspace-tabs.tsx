"use client";

import { useMemo } from "react";
import { CoachingJourneyNavigation } from "@/components/coaching-journey/coaching-journey-navigation";
import {
  buildCoachingJourneyEvidence,
  deriveAllCoachingJourneyStates,
  legacyTabToStage,
  STAGE_TO_LEGACY_TAB,
  type CoachingJourneyStageId,
} from "@/lib/coaching-journey";
import type { Client, Session } from "@/lib/types";

/**
 * Legacy tab ids retained for SPA routing in home-app.
 * Visible navigation is the six-stage coaching journey only.
 */
export type ClientWorkspaceTab =
  | "overview"
  | "prepare"
  | "sessions"
  | "reflect"
  | "summary"
  | "intelligence"
  | "history"
  | "reports"
  | "actions"
  | "journey"
  | "identity-journey";

export function ClientWorkspaceTabs({
  active,
  onChange,
  client,
  activeSession = null,
  reportsAvailable,
  activeStage: activeStageProp,
}: {
  active?: ClientWorkspaceTab | null;
  onChange: (tab: ClientWorkspaceTab) => void;
  clientName?: string;
  client?: Pick<
    Client,
    "id" | "sessions" | "identitySummary" | "themes" | "goals"
  > | null;
  activeSession?: Session | null;
  reportsAvailable?: boolean;
  activeStage?: CoachingJourneyStageId | null;
}) {
  const activeStage: CoachingJourneyStageId =
    activeStageProp ?? legacyTabToStage(active) ?? "current_position";

  const stageStates = useMemo(() => {
    const evidence = buildCoachingJourneyEvidence(client ?? null, {
      activeSession,
      ...(reportsAvailable === undefined ? {} : { reportsAvailable }),
    });
    return deriveAllCoachingJourneyStates(evidence, activeStage);
  }, [client, activeSession, reportsAvailable, activeStage]);

  return (
    <CoachingJourneyNavigation
      activeStage={activeStage}
      stageStates={stageStates}
      onNavigate={stage => {
        onChange(STAGE_TO_LEGACY_TAB[stage] as ClientWorkspaceTab);
      }}
    />
  );
}
