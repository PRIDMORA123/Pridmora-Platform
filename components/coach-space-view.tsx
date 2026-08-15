"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Client } from "@/lib/types";
import { isClientArchived } from "@/lib/types";
import { apiJson } from "@/lib/api-client";
import type {
  DevelopmentProfile,
  DevelopmentUpdate,
} from "@/lib/development-updates/types";
import { buildScopedJourneyPageViewModel } from "@/lib/journey/build-scoped-journey-page";
import { assertJourneySourcesForRelationship } from "@/lib/journey/load-journey-view-model";
import { RelationshipScopeIntegrityError } from "@/lib/relationship-scope";
import { SkeletonCard } from "@/components/skeleton";
import { ClientActionsMenu } from "@/components/client-actions-menu";
import {
  EditClientDialog,
  relationshipStatusFromClient,
  type EditClientValues,
} from "@/components/edit-client-dialog";
import {
  ScheduleSessionDialog,
  type ScheduleSessionValues,
} from "@/components/schedule-session-dialog";
import type { ClientWorkspaceTab } from "@/components/client-workspace-tabs";
import {
  EMPTY_AGREEMENT,
  EMPTY_INITIAL_CONVERSATION,
} from "@/lib/relationship-meta";
import { IdentityBackLink } from "@/components/identity";
import { RelationshipIsolationFailsafe } from "@/components/relationship-isolation-failsafe";
import { coachingStatusLabel } from "@/lib/identity-journey-path";
import { getPrepareRoute } from "@/lib/prepare-route";
import { CoachingMomentWorkspace } from "@/components/coaching-moments/coaching-moment-workspace";
import {
  getCurrentPositionSnapshot,
  type RelationshipPrimaryAction,
} from "@/lib/coaching-journey";
import type { CoachingMoment } from "@/lib/coaching-moments/coaching-moment";
import { getFutureOrOpenSession } from "@/lib/session-workflow";
import { buildProfileCurrentPosition } from "@/lib/development-evidence/compose-headline-intelligence";
import { getRelationshipDisplayName } from "@/lib/relationship-identity";
import { RelationshipCanvas } from "@/components/relationship-workspace";
import type { AddSessionFormValues } from "@/lib/relationship-workspace";
import type { SessionModuleId } from "@/lib/relationship-workspace";

export function CoachSpaceView({
  client,
  preferredSessionId = null,
  onBack,
  onOpenSession,
  onOpenSessionModule,
  onScheduleSession,
  onPrepare,
  onReviewIntelligence: _onReviewIntelligence,
  onReviewDevelopmentUpdate: _onReviewDevelopmentUpdate,
  onTabChange,
  loadingSessions = false,
  sessionsLoadError = false,
  onRetrySessions,
  lifecycleBusy = false,
  flashMessage = "",
  onEditClient,
  onArchiveClient,
  onRestoreClient,
  onPermanentlyDeleteClient,
  allowPermanentDelete = true,
  coachPreparationStyle: _coachPreparationStyle = "guided",
}: {
  client: Client;
  /** When returning from a session destination, keep that session current. */
  preferredSessionId?: string | null;
  onBack: () => void;
  onOpenSession: (sessionId: string) => void;
  onOpenSessionModule?: (
    sessionId: string,
    moduleId: SessionModuleId
  ) => void;
  onScheduleSession: (
    values: ScheduleSessionValues,
    options?: { openWorkspace?: boolean }
  ) => Promise<void>;
  onPrepare: (sessionId?: string) => void;
  onReviewIntelligence: () => void;
  onReviewDevelopmentUpdate?: (updateId: string) => void;
  onTabChange?: (tab: ClientWorkspaceTab) => void;
  loadingSessions?: boolean;
  sessionsLoadError?: boolean;
  onRetrySessions?: () => void;
  lifecycleBusy?: boolean;
  flashMessage?: string;
  coachPreparationStyle?: import("@/lib/preparation-style").PreparationStyle;
  onEditClient: (fields: {
    name: string;
    organisation: string;
    role: string;
    email: string;
    currentFocus?: string;
    status?: "Active" | "Paused";
    preparationStyleOverride?: import("@/lib/preparation-style").PreparationStyle | null;
    relationshipAgreement?: Client["relationshipAgreement"];
    initialConversation?: Client["initialConversation"];
    supportingContext?: Client["supportingContext"];
  }) => Promise<void>;
  onArchiveClient: () => Promise<void>;
  onRestoreClient: () => Promise<void>;
  onPermanentlyDeleteClient: () => Promise<void>;
  /** Managers must not see permanent delete; coaches/admins keep existing behaviour. */
  allowPermanentDelete?: boolean;
}) {
  const archived = isClientArchived(client);
  const [editOpen, setEditOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [coachingMomentOpen, setCoachingMomentOpen] = useState(false);
  const [activeCoachingMoment, setActiveCoachingMoment] =
    useState<CoachingMoment | null>(null);
  const coachingMomentTriggerRef = useRef<HTMLButtonElement>(null);

  const [profile, setProfile] = useState<DevelopmentProfile | null>(null);
  const [updates, setUpdates] = useState<DevelopmentUpdate[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [isolationError, setIsolationError] = useState(false);

  const [recentCoachingMoments, setRecentCoachingMoments] = useState<
    CoachingMoment[]
  >([]);
  const [coachingMomentsLoadError, setCoachingMomentsLoadError] =
    useState(false);
  const [developmentLoadError, setDevelopmentLoadError] = useState(false);

  const loadRecentCoachingMoments = useCallback(async () => {
    setCoachingMomentsLoadError(false);
    try {
      const data = await apiJson<{ moments: CoachingMoment[] }>(
        `/api/coaching-moments?clientId=${encodeURIComponent(client.id)}&recent=1&limit=3`
      );
      setRecentCoachingMoments(data.moments ?? []);
    } catch {
      setRecentCoachingMoments([]);
      setCoachingMomentsLoadError(true);
    }
  }, [client.id]);

  const loadProfile = useCallback(async () => {
    setProfile(null);
    setUpdates([]);
    setIsolationError(false);
    setDevelopmentLoadError(false);
    setProfileLoading(true);
    try {
      const data = await apiJson<{
        profile: DevelopmentProfile;
        pendingUpdate: DevelopmentUpdate | null;
        updates?: DevelopmentUpdate[];
      }>(`/api/development-profiles/${client.id}`);
      const nextUpdates =
        data.updates ?? (data.pendingUpdate ? [data.pendingUpdate] : []);
      assertJourneySourcesForRelationship(client.id, {
        conversations: client.sessions,
        updates: nextUpdates,
        profile: data.profile,
      });
      setProfile(data.profile);
      setUpdates(nextUpdates);
    } catch (err) {
      if (
        err instanceof RelationshipScopeIntegrityError ||
        (err instanceof Error &&
          err.message.includes("Relationship-scoped data integrity"))
      ) {
        console.error(
          "[relationship-isolation] Current Position integrity check failed",
          {
            relationshipId: client.id,
            error:
              err instanceof Error
                ? { name: err.name, message: err.message }
                : { message: String(err) },
          }
        );
        setIsolationError(true);
      } else {
        setDevelopmentLoadError(true);
      }
      setProfile(null);
      setUpdates([]);
    } finally {
      setProfileLoading(false);
    }
  }, [client.id, client.sessions]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    void loadRecentCoachingMoments();
  }, [loadRecentCoachingMoments]);

  useEffect(() => {
    setEditOpen(false);
    setScheduleOpen(false);
    setCoachingMomentOpen(false);
    setActiveCoachingMoment(null);
  }, [client.id]);

  const statusLabel = useMemo(
    () => coachingStatusLabel(client, updates),
    [client, updates]
  );

  const pageResult = useMemo(() => {
    if (profileLoading) {
      return {
        page: null as ReturnType<typeof buildScopedJourneyPageViewModel> | null,
        error: null as string | null,
      };
    }
    try {
      const page = buildScopedJourneyPageViewModel(
        client,
        profile,
        updates,
        statusLabel
      );
      return { page, error: null };
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Current Position integrity check failed.";
      console.error(
        "[relationship-isolation] Relationship Canvas render integrity check failed",
        {
          relationshipId: client.id,
          personName: getRelationshipDisplayName(client),
          error:
            err instanceof Error
              ? { name: err.name, message: err.message }
              : { message: String(err) },
        }
      );
      return { page: null, error: message };
    }
  }, [client, profile, updates, statusLabel, profileLoading]);

  const page = pageResult.page;
  const renderIsolationError = isolationError || Boolean(pageResult.error);
  const isLoading = loadingSessions || profileLoading;
  const preferredSession = preferredSessionId
    ? client.sessions.find(session => session.id === preferredSessionId)
    : null;
  const currentSession =
    preferredSession && preferredSession.status !== "completed"
      ? preferredSession
      : getFutureOrOpenSession(client.sessions) ?? null;

  const developmentSnapshotText = useMemo(() => {
    if (!page) return "";
    const source =
      page.currentPosition.emergingDirection ||
      page.currentPosition.headline ||
      page.lookingAhead.nextFocus ||
      "";
    return getCurrentPositionSnapshot(source, { clientName: getRelationshipDisplayName(client) });
  }, [page, client]);

  const presentDevelopmentalState = useMemo(() => {
    if (!profile) return null;
    const demonstrated = (profile.strengths ?? [])
      .filter(
        entry =>
          entry.status === "supported" || entry.status === "well_established"
      )
      .map(entry => entry.value.trim())
      .filter(Boolean);
    const themes = (profile.emergingThemes ?? [])
      .map(entry => entry.value.trim())
      .filter(Boolean);
    const behaviouralPatterns = (profile.patterns ?? [])
      .map(entry => entry.value.trim())
      .filter(Boolean);
    const growthAreas = (profile.growthAreas ?? [])
      .map(entry => entry.value.trim())
      .filter(Boolean);
    if (
      demonstrated.length === 0 &&
      themes.length === 0 &&
      behaviouralPatterns.length === 0 &&
      growthAreas.length === 0
    ) {
      return null;
    }
    return buildProfileCurrentPosition({
      demonstratedStrengths: demonstrated,
      themes,
      behaviouralPatterns,
      growthAreas,
    });
  }, [profile]);

  function handlePrimaryAction(action: RelationshipPrimaryAction) {
    switch (action.kind) {
      case "prepare_session":
      case "start_conversation":
        void getPrepareRoute(client.id);
        onPrepare(action.sessionId);
        return;
      case "continue_session_notes":
      case "review_summary_insights":
        if (action.sessionId) {
          if (action.kind === "review_summary_insights") {
            onOpenSessionModule?.(action.sessionId, "identity_intelligence");
          } else {
            onOpenSessionModule?.(action.sessionId, "session_notes");
          }
          if (!onOpenSessionModule) onOpenSession(action.sessionId);
        }
        return;
      case "view_development":
        onTabChange?.("intelligence");
        return;
      case "schedule_conversation":
        setScheduleOpen(true);
        return;
      default:
        return;
    }
  }

  function handleModuleAction(sessionId: string, moduleId: SessionModuleId) {
    if (moduleId === "prepare") {
      void getPrepareRoute(client.id);
      onPrepare(sessionId);
      return;
    }
    if (onOpenSessionModule) {
      onOpenSessionModule(sessionId, moduleId);
      return;
    }
    onOpenSession(sessionId);
  }

  async function handleCreateSession(values: AddSessionFormValues) {
    setScheduling(true);
    try {
      await onScheduleSession(
        {
          date: values.plannedDate,
          startTime: values.startTime,
          title: values.title,
          durationMinutes: 60,
          location: "",
          focus: values.focus,
        },
        { openWorkspace: false }
      );
    } finally {
      setScheduling(false);
    }
  }

  if (renderIsolationError) {
    return <RelationshipIsolationFailsafe />;
  }

  if (!isLoading && !page) {
    return <RelationshipIsolationFailsafe />;
  }

  return (
    <section className="page client-journey-page identity-reveal identity-page-shell relationship-canvas-page">
      <IdentityBackLink onClick={onBack}>Back to People</IdentityBackLink>

      {flashMessage ? (
        <div className="inline-notice" role="status">
          {flashMessage}
        </div>
      ) : null}

      {archived ? (
        <div className="inline-notice archived-banner" role="status">
          This person is archived. Restore them to add new development activity.
        </div>
      ) : null}

      {isLoading || !page ? (
        <div
          className="client-journey-sections"
          aria-busy="true"
          aria-live="polite"
        >
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={4} />
        </div>
      ) : (
        <>
          <RelationshipCanvas
            relationship={client}
            currentSession={currentSession}
            narrative={page.currentPosition.narrative || client.identitySummary}
            outstandingCommitment={
              page.lookingAhead.commitments[0] ||
              page.currentPosition.commitment ||
              null
            }
            developmentDirection={
              page.currentPosition.emergingDirection ||
              developmentSnapshotText ||
              page.lookingAhead.nextFocus
            }
            presentDevelopmentalState={presentDevelopmentalState}
            developmentStrengths={client.strengths.map(item => item.name)}
            developmentPriorities={
              client.themes.length > 0
                ? client.themes
                : client.goals.slice(0, 3)
            }
            developmentPattern={page.emergingPattern || null}
            relationshipDetails={{
              agreement: client.relationshipAgreement ?? EMPTY_AGREEMENT,
              initialConversation:
                client.initialConversation ?? EMPTY_INITIAL_CONVERSATION,
              supportingContext: client.supportingContext ?? [],
              reviewPoint:
                client.relationshipAgreement?.reviewDate?.trim() || null,
            }}
            archived={archived}
            actions={
              <ClientActionsMenu
                client={client}
                busy={lifecycleBusy}
                onEdit={() => setEditOpen(true)}
                onArchive={onArchiveClient}
                onRestore={onRestoreClient}
                onPermanentlyDelete={onPermanentlyDeleteClient}
                allowPermanentDelete={allowPermanentDelete}
              />
            }
            recentCoachingMoments={recentCoachingMoments}
            sessionsLoadError={sessionsLoadError}
            developmentLoadError={developmentLoadError}
            coachingMomentsLoadError={coachingMomentsLoadError}
            onRetrySessions={onRetrySessions}
            onRetryDevelopment={() => {
              void loadProfile();
            }}
            onRetryCoachingMoments={() => {
              void loadRecentCoachingMoments();
            }}
            onPrimaryAction={handlePrimaryAction}
            onModuleAction={handleModuleAction}
            onOpenSession={onOpenSession}
            onViewDevelopment={() => onTabChange?.("intelligence")}
            onAddEvidence={() => onTabChange?.("evidence")}
            onPrepareConversation={sessionId => {
              onPrepare(sessionId);
            }}
            onRecordConversation={sessionId => {
              if (sessionId) {
                onOpenSession(sessionId);
                return;
              }
              onPrepare();
            }}
            onViewReports={() => onTabChange?.("reports")}
            onCreateSession={handleCreateSession}
            busy={scheduling}
            onNewCoachingMoment={() => {
              setActiveCoachingMoment(null);
              setCoachingMomentOpen(true);
            }}
            onOpenCoachingMoment={moment => {
              setActiveCoachingMoment(moment);
              setCoachingMomentOpen(true);
            }}
            onSaveAgreement={async agreement => {
              await onEditClient({
                name: getRelationshipDisplayName(client),
                organisation: client.organisation,
                role: client.role,
                email: client.email,
                relationshipAgreement: agreement,
              });
            }}
            onSaveInitialConversation={async initialConversation => {
              await onEditClient({
                name: getRelationshipDisplayName(client),
                organisation: client.organisation,
                role: client.role,
                email: client.email,
                initialConversation,
              });
            }}
          />

          <EditClientDialog
            isOpen={editOpen}
            clientId={client.id}
            isSaving={lifecycleBusy}
            initialValues={{
              name: getRelationshipDisplayName(client),
              role: client.role,
              organisation: client.organisation,
              email: client.email ?? "",
              coachingPurpose: client.currentFocus ?? "",
              relationshipStatus: relationshipStatusFromClient(client.status),
            }}
            onClose={() => setEditOpen(false)}
            onSave={async (values: EditClientValues) => {
              const currentlyArchived = isClientArchived(client);

              if (values.relationshipStatus === "archived") {
                await onEditClient({
                  name: values.name,
                  role: values.role,
                  organisation: values.organisation,
                  email: values.email,
                  currentFocus: values.coachingPurpose,
                });
                if (!currentlyArchived) {
                  await onArchiveClient();
                }
              } else {
                if (currentlyArchived) {
                  await onRestoreClient();
                }
                await onEditClient({
                  name: values.name,
                  role: values.role,
                  organisation: values.organisation,
                  email: values.email,
                  currentFocus: values.coachingPurpose,
                  status:
                    values.relationshipStatus === "completed"
                      ? "Paused"
                      : "Active",
                });
              }

              setEditOpen(false);
            }}
          />

          <ScheduleSessionDialog
            open={scheduleOpen}
            clientName={getRelationshipDisplayName(client)}
            busy={scheduling}
            onClose={() => {
              if (!scheduling) setScheduleOpen(false);
            }}
            onSchedule={async values => {
              setScheduling(true);
              try {
                await onScheduleSession(values, { openWorkspace: false });
                setScheduleOpen(false);
              } finally {
                setScheduling(false);
              }
            }}
          />

          <CoachingMomentWorkspace
            open={coachingMomentOpen}
            clientId={client.id}
            clientName={getRelationshipDisplayName(client)}
            initialMoment={activeCoachingMoment}
            triggerRef={coachingMomentTriggerRef}
            onClose={() => {
              setCoachingMomentOpen(false);
              setActiveCoachingMoment(null);
            }}
            onSaved={() => {
              void loadRecentCoachingMoments();
            }}
          />
        </>
      )}
    </section>
  );
}
