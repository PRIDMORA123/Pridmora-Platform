"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell, type AppView } from "@/components/app-shell";
import { TodayView } from "@/components/today-view";
import { ClientsView } from "@/components/clients-view";
import { CoachSpaceView } from "@/components/coach-space-view";
import { PrepareSessionView } from "@/components/prepare-session-view";
import { SessionWorkspace } from "@/components/session-workspace";
import { PersonIntelligenceView } from "@/components/person-intelligence-view";
import { DevelopmentEvidenceView } from "@/components/development-evidence/development-evidence-view";
import { TeamIntelligenceView } from "@/components/development-evidence/team-intelligence-view";
import { DevelopmentUpdateReviewView } from "@/components/development-update-review";
import { PersonActionsView } from "@/components/person-actions-view";
import { GlobalIntelligenceView } from "@/components/global-intelligence-view";
import { SessionsView } from "@/components/sessions-view";
import { MyDevelopmentView } from "@/components/my-development-view";
import { SettingsView } from "@/components/settings-view";
import { JourneyView } from "@/components/journey-view";
import { CareerJourneyView } from "@/components/career-journey-view";
import { CoachingReportView } from "@/components/coaching-report-view";
import { RelationshipReportsView } from "@/components/reports/relationship-reports-view";
import { NewClientDialog } from "@/components/new-client-dialog";
import type { ScheduleSessionValues } from "@/components/schedule-session-dialog";
import { PageSkeleton } from "@/components/skeleton";
import type { ClientWorkspaceTab } from "@/components/client-workspace-tabs";
import type { Client, CoachingAction, Session } from "@/lib/types";
import type { CoachProfile } from "@/lib/auth/types";
import { getBrowserAuthUser, isUuid } from "@/lib/auth/browser";
import { initialsFromFullName } from "@/lib/auth/session-client";
import { AuthRequiredError, errorMessage, toError } from "@/lib/errors";
import { apiJson } from "@/lib/api-client";
import {
  createActionRecord,
  createClientRecord,
  createSessionRecord,
  loadClients,
  loadSessionsForClient,
  saveSessionRecord,
  updateClientRecord,
  archiveClientRecord,
  restoreClientRecord,
  permanentlyDeleteClientRecord,
} from "@/lib/storage";
import {
  buildStructuredSessionRecord,
  createBlankSession,
  formatDisplayDateFromIso,
  nextSessionNumber,
} from "@/lib/sessions";
import { getFutureOrOpenSession } from "@/lib/session-workflow";
import { getPrepareRoute, PREPARE_VIEW } from "@/lib/prepare-route";
import { resolveAccountRoleTitle } from "@/lib/role-language";
import { buildSessionModuleRoute } from "@/lib/session-module-route";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { isClientArchived } from "@/lib/types";
import { identityErrorMessages, identityMessages } from "@/lib/identity-language";
import { SessionsLoadError } from "@/components/feedback/sessions-load-error";
import { ApiRequestError } from "@/lib/api-failure";
import {
  OrganisationProvider,
  type OrganisationWorkspaceState,
} from "@/lib/organisations/organisation-context";

type ProfilePayload = CoachProfile & { initials: string; email: string | null };

/**
 * Authenticated coaching workspace. Only mounted after the server page
 * confirms a Supabase Auth user — never on /auth/sign-in.
 */
export function HomeApp() {
  const activeRef = useRef(true);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [authError, setAuthError] = useState("");
  const [view, setView] = useState<AppView>("dashboard");
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [sessionsLoadError, setSessionsLoadError] = useState(false);
  const [sessionsRetryRelationshipId, setSessionsRetryRelationshipId] =
    useState("");
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingClientSessions, setLoadingClientSessions] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryingSessions, setRetryingSessions] = useState(false);
  const sessionsRetryLockRef = useRef(false);
  const [focusSessionId, setFocusSessionId] = useState<string | null>(null);
  const [focusSessionStage, setFocusSessionStage] = useState<
    "coach" | "reflect" | "summary" | "actions" | null
  >(null);
  const [focusUpdateId, setFocusUpdateId] = useState<string | null>(null);
  const [focusReportId, setFocusReportId] = useState<string | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [clientsFlash, setClientsFlash] = useState("");
  const [sessionFlash, setSessionFlash] = useState("");
  const [clientFlash, setClientFlash] = useState("");
  const [organisationState, setOrganisationState] =
    useState<OrganisationWorkspaceState | null>(null);

  const coachId = profile?.id ?? "";
  const coachDisplayName = profile?.fullName || "Coach";
  const organisationRole = organisationState?.professionalRole ?? null;
  const coachTitle = resolveAccountRoleTitle({
    professionalRole: organisationRole,
    profileTitle: profile?.professionalTitle,
  });
  const coachInitials = profile?.initials || initialsFromFullName(coachDisplayName);
  const coachFirstName = coachDisplayName.trim().split(/\s+/)[0] || "Coach";

  const leaveToSignIn = useCallback(() => {
    // Hard navigation tears down the coaching shell so no in-flight
    // effects can keep calling protected APIs on the sign-in screen.
    window.location.assign("/auth/sign-in?next=/?view=dashboard");
  }, []);

  const handleAuthFailure = useCallback(
    (error?: unknown) => {
      activeRef.current = false;
      setClients([]);
      setSelectedId("");
      setProfile(null);

      // Expected 401 / missing session → quiet redirect, not a console Error.
      if (!error || error instanceof AuthRequiredError) {
        leaveToSignIn();
        return;
      }

      setAuthError(errorMessage(error, "Unable to verify your session. Please sign in again."));
      setAuthReady(true);
    },
    [leaveToSignIn]
  );

  const refreshClients = useCallback(async () => {
    if (!authReady || !profile || !activeRef.current) return;

    setLoadingClients(true);
    setStorageError("");
    try {
      const loaded = await loadClients();
      if (!activeRef.current) return;
      const owned = loaded.filter(client => isUuid(client.id));
      setClients(owned);
      setSelectedId(current => {
        if (current && owned.some(client => client.id === current)) return current;
        return owned[0]?.id || "";
      });
    } catch (error) {
      if (!activeRef.current) return;
      if (error instanceof AuthRequiredError) {
        handleAuthFailure(error);
        return;
      }
      setClients([]);
      setSelectedId("");
      setStorageError(
        errorMessage(
          error,
          `${identityErrorMessages.loadFailure.title} ${identityErrorMessages.loadFailure.description}`
        )
      );
    } finally {
      if (activeRef.current) {
        setHydrated(true);
        setLoadingClients(false);
      }
    }
  }, [authReady, profile, handleAuthFailure]);

  useEffect(() => {
    activeRef.current = true;
    let cancelled = false;

    async function bootstrap() {
      setAuthError("");
      setLoadingClients(false);
      setHydrated(false);

      try {
        // 1) Confirm browser Auth session before any protected API call.
        const user = await getBrowserAuthUser();
        if (cancelled || !activeRef.current) return;

        if (!user) {
          leaveToSignIn();
          return;
        }

        // 2) Load coach profile (authenticated).
        const profilePayload = await apiJson<{
          profile?: ProfilePayload;
          error?: string;
        }>("/api/profile", { method: "GET" });

        if (cancelled || !activeRef.current) return;

        if (!profilePayload.profile) {
          setAuthError(
            profilePayload.error || "Unable to load your coach profile. Please sign in again."
          );
          setAuthReady(true);
          return;
        }

        setProfile({
          ...profilePayload.profile,
          coachingIntelligenceMode:
            profilePayload.profile.coachingIntelligenceMode ??
            (profilePayload.profile.preparationStyle === "minimal"
              ? "manual"
              : profilePayload.profile.preparationStyle === "enhanced"
                ? "comprehensive"
                : "assisted"),
        });

        // 2b) Resolve organisation context (personal org is auto-created).
        try {
          const orgPayload = await apiJson<{
            current: OrganisationWorkspaceState;
            organisations: OrganisationWorkspaceState["organisations"];
          }>("/api/organisations/current");
          if (!cancelled && activeRef.current) {
            setOrganisationState({
              ...orgPayload.current,
              organisations: orgPayload.organisations,
            });
          }
        } catch {
          // Pre-migration environments continue without organisation UI.
          setOrganisationState(null);
        }

        setAuthReady(true);

        // 3) Only then load coaching data for this authenticated coach.
        setLoadingClients(true);
        setStorageError("");
        try {
          const loaded = await loadClients();
          if (cancelled || !activeRef.current) return;
          const owned = loaded.filter(client => isUuid(client.id));
          setClients(owned);
          setSelectedId(owned[0]?.id || "");
        } catch (error) {
          if (cancelled || !activeRef.current) return;
          if (error instanceof AuthRequiredError) {
            leaveToSignIn();
            return;
          }
          setClients([]);
          setSelectedId("");
          setStorageError(
            errorMessage(
              error,
              `${identityErrorMessages.loadFailure.title} ${identityErrorMessages.loadFailure.description}`
            )
          );
        } finally {
          if (!cancelled && activeRef.current) {
            setHydrated(true);
            setLoadingClients(false);
          }
        }
      } catch (error) {
        if (cancelled || !activeRef.current) return;
        handleAuthFailure(error);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
      activeRef.current = false;
    };
  }, [leaveToSignIn, handleAuthFailure]);

  const selected =
    (selectedId && clients.find(client => client.id === selectedId)) || undefined;

  function navigate(next: AppView) {
    setView(next);
    setMobileOpen(false);
    if (next !== "session") {
      setFocusSessionId(null);
      setFocusSessionStage(null);
    }
    if (next !== "clients") {
      setClientsFlash("");
    }
  }

  function handleWorkspaceTab(tab: ClientWorkspaceTab) {
    if (!selected) return;
    if (tab === "overview") {
      navigate("coach-space");
      return;
    }
    if (tab === "sessions" || tab === "reflect") {
      const next =
        selected.sessions.find(
          session =>
            session.status === "in_progress" || session.status === "paused"
        ) ||
        selected.sessions.find(
          session => session.status === "awaiting_completion"
        ) ||
        selected.sessions.find(session => session.status === "completed") ||
        getFutureOrOpenSession(selected.sessions);
      setFocusSessionId(next?.id ?? null);
      if (
        next &&
        (next.status === "awaiting_completion" || next.status === "completed")
      ) {
        setFocusSessionStage("reflect");
      } else if (
        next &&
        (next.status === "in_progress" || next.status === "paused")
      ) {
        setFocusSessionStage("coach");
      } else {
        setFocusSessionStage("coach");
      }
      navigate("session");
      return;
    }
    if (tab === "summary") {
      const next =
        selected.sessions.find(
          session =>
            session.summaryStatus === "draft" ||
            session.status === "awaiting_completion"
        ) ||
        selected.sessions.find(
          session =>
            session.summaryStatus === "approved" || session.aiSummaryApproved
        ) ||
        selected.sessions.find(session => session.status === "completed") ||
        getFutureOrOpenSession(selected.sessions);
      setFocusSessionId(next?.id ?? null);
      setFocusSessionStage("summary");
      navigate("session");
      return;
    }
    if (tab === "prepare") {
      void prepare(selected);
      return;
    }
    if (tab === "intelligence") {
      navigate("intelligence");
      return;
    }
    if (tab === "evidence") {
      navigate("development-evidence");
      return;
    }
    if (tab === "history") {
      // Records remain available but are no longer a primary journey stage.
      navigate("career-journey");
      return;
    }
    if (tab === "reports") {
      navigate("reports");
      return;
    }
    if (tab === "actions") {
      navigate("person-actions");
      return;
    }
    if (tab === "journey") {
      navigate("coach-space");
      return;
    }
    if (tab === "identity-journey") {
      navigate("journey");
      void refreshSessionsForClient(selected.id);
    }
  }

  async function refreshSessionsForClient(clientId: string) {
    if (!authReady || !profile || !activeRef.current) return;
    if (!isUuid(clientId)) {
      setStorageError("Select a valid client before loading sessions.");
      return;
    }
    // Only refresh sessions for clients this coach actually owns in memory.
    if (!clients.some(client => client.id === clientId)) {
      setStorageError("Select one of your clients before loading sessions.");
      return;
    }

    setLoadingClientSessions(true);
    setSessionsLoadError(false);
    try {
      const sessions = await loadSessionsForClient(clientId);
      if (!activeRef.current) return;
      setClients(current =>
        current.map(item => (item.id === clientId ? { ...item, sessions } : item))
      );
      setSessionsLoadError(false);
      setSessionsRetryRelationshipId("");
    } catch (error) {
      if (!activeRef.current) return;
      if (error instanceof AuthRequiredError) {
        handleAuthFailure(error);
        return;
      }
      // Preserve already-loaded relationship/session data; show isolated recovery.
      setSessionsLoadError(true);
      setSessionsRetryRelationshipId(clientId);
      if (!(error instanceof ApiRequestError)) {
        console.error("[sessions] load_relationship_sessions unexpected failure", {
          operation: "load_relationship_sessions",
          relationshipId: clientId,
          message: errorMessage(error),
        });
      }
    } finally {
      if (activeRef.current) setLoadingClientSessions(false);
    }
  }

  async function retrySessionsLoad() {
    if (sessionsRetryLockRef.current || retryingSessions) return;
    const relationshipId = sessionsRetryRelationshipId || selectedId;
    if (!relationshipId) return;
    sessionsRetryLockRef.current = true;
    setRetryingSessions(true);
    try {
      await refreshSessionsForClient(relationshipId);
    } finally {
      setRetryingSessions(false);
      sessionsRetryLockRef.current = false;
    }
  }

  async function openClient(client: Client) {
    if (!isUuid(client.id) || !authReady || !profile) return;
    setSelectedId(client.id);
    setStorageError("");
    setClientFlash("");
    setSessionFlash("");
    navigate("coach-space");
    await refreshSessionsForClient(client.id);
  }

  async function prepare(client: Client, sessionId?: string) {
    // Canonical Prepare entry — Home, People, Journey, tabs and CTAs all use this.
    const destination = getPrepareRoute(client.id);
    if (!isUuid(destination.personId) || !authReady || !profile) return;
    if (isClientArchived(client)) {
      setStorageError("This client is archived. Restore them to add new coaching activity.");
      return;
    }
    setSelectedId(destination.personId);
    setStorageError("");
    setClientFlash("");
    try {
      const sessions = await loadSessionsForClient(destination.personId);
      if (!activeRef.current) return;
      setClients(current =>
        current.map(item =>
          item.id === destination.personId ? { ...item, sessions } : item
        )
      );
      let next =
        (sessionId ? sessions.find(session => session.id === sessionId) : undefined) ??
        getFutureOrOpenSession(sessions);

      // Preparation can proceed without a scheduled future session by opening
      // an unscheduled planned conversation workspace.
      if (!next) {
        const blank = createBlankSession({
          id: crypto.randomUUID(),
          clientId: destination.personId,
          coachId,
          sessionNumber: nextSessionNumber(sessions),
          status: "planned",
          preparation: "",
        });
        next = await createSessionRecord(blank);
        if (!activeRef.current) return;
        setClients(current =>
          current.map(item => {
            if (item.id !== destination.personId) return item;
            return {
              ...item,
              sessions: [next!, ...item.sessions.filter(session => session.id !== next!.id)],
            };
          })
        );
      }

      setFocusSessionId(next.id);
      setSessionFlash("");
      navigate(destination.view);
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        handleAuthFailure(error);
        return;
      }
      setSessionsLoadError(true);
      setSessionsRetryRelationshipId(destination.personId);
    }
  }

  async function openSessionWorkspace(sessionId: string) {
    if (!selected || !isUuid(selected.id) || !authReady || !profile) return;
    setFocusSessionId(sessionId);
    setSessionFlash("");
    navigate("session");
    await refreshSessionsForClient(selected.id);
  }

  async function openSessionFromJourney(sessionId: string) {
    await openSessionWorkspace(sessionId);
  }

  function openNewClientForm() {
    if (!authReady || !profile) return;
    setStorageError("");
    setClientsFlash("");
    setNewClientOpen(true);
  }

  async function createClient(fields: {
    name?: string;
    organisation: string;
    role: string;
    currentFocus: string;
    email: string;
    identityMode?: "standard" | "confidential";
    displayLabel?: string;
    aiNameAllowed?: boolean;
    privateRealName?: string;
    privateEmail?: string;
    privatePhone?: string;
    privateNotes?: string;
  }) {
    if (creatingClient || !authReady || !profile) return;
    setStorageError("");
    setCreatingClient(true);

    try {
      const saved = await createClientRecord(fields);
      if (!activeRef.current) return;
      setClients(current => [saved, ...current]);
      setSelectedId(saved.id);
      setNewClientOpen(false);
      setClientsFlash(identityMessages.personCreated);
      navigate("coach-space");
      await refreshSessionsForClient(saved.id);
    } catch (error) {
      if (!activeRef.current) return;
      if (error instanceof AuthRequiredError) {
        handleAuthFailure(error);
        return;
      }
      // Keep the modal open and surface the error inside it.
      throw toError(
        error,
        "Unable to create the client in Supabase. Please try again."
      );
    } finally {
      if (activeRef.current) setCreatingClient(false);
    }
  }

  /** Quiet client create for first-user onboarding — no navigation. */
  async function createClientForOnboarding(fields: {
    name?: string;
    organisation: string;
    role: string;
    currentFocus: string;
    email: string;
    identityMode?: "standard" | "confidential";
    displayLabel?: string;
    aiNameAllowed?: boolean;
    privateRealName?: string;
    privateEmail?: string;
    privatePhone?: string;
    privateNotes?: string;
  }): Promise<{ id: string; name: string }> {
    if (!authReady || !profile) {
      throw new Error("Sign in before creating a relationship.");
    }
    setStorageError("");
    const saved = await createClientRecord(fields);
    if (!activeRef.current) {
      return { id: saved.id, name: saved.name };
    }
    setClients(current => {
      if (current.some(client => client.id === saved.id)) return current;
      return [saved, ...current];
    });
    setSelectedId(saved.id);
    return { id: saved.id, name: saved.name };
  }

  /** Quiet Session 1 create for first-user onboarding — no navigation. */
  async function createSessionForOnboarding(input: {
    clientId: string;
    plannedDate: string;
    startTime: string;
    conversationFocus: string;
  }): Promise<{ id: string }> {
    if (!coachId || !authReady || !profile) {
      throw new Error("Sign in before scheduling a conversation.");
    }

    const dateValue = input.plannedDate.trim()
      ? formatDisplayDateFromIso(input.plannedDate)
      : "";
    const focusValue = input.conversationFocus.trim();

    // Prefer live state; fall back to empty sessions for a just-created relationship.
    const existingSessions =
      clients.find(item => item.id === input.clientId)?.sessions ?? [];

    const blank = createBlankSession({
      id: crypto.randomUUID(),
      clientId: input.clientId,
      coachId,
      sessionNumber: nextSessionNumber(existingSessions),
      date: dateValue,
      time: input.startTime.trim(),
      title: "",
      focus: focusValue,
      durationMinutes: 60,
      location: "",
      status: "planned",
      preparation: "",
    });

    const saved = await createSessionRecord(blank);
    if (activeRef.current) {
      setClients(current => {
        const existing = current.find(item => item.id === input.clientId);
        if (!existing) return current;
        const sessions = [
          saved,
          ...existing.sessions.filter(session => session.id !== saved.id),
        ];
        const nextLabel = saved.date
          ? `${saved.date}${saved.time ? `, ${saved.time}` : ""}`
          : "Date not set";
        return current.map(item =>
          item.id === input.clientId
            ? { ...item, sessions, nextSession: nextLabel }
            : item
        );
      });
      setSelectedId(input.clientId);
      setFocusSessionId(saved.id);
      await refreshSessionsForClient(input.clientId);
    }
    return { id: saved.id };
  }

  function prepareAfterOnboarding(result: {
    clientId: string;
    sessionId: string;
    personName: string;
  }) {
    const client = clients.find(item => item.id === result.clientId);
    if (client) {
      void prepare(client, result.sessionId);
      return;
    }
    // Client state may still be settling — open Prepare by relationship id.
    setSelectedId(result.clientId);
    setFocusSessionId(result.sessionId);
    setStorageError("");
    setClientFlash("");
    navigate(PREPARE_VIEW);
    void refreshSessionsForClient(result.clientId);
  }

  function viewRelationshipAfterOnboarding(result: {
    clientId: string;
    personName: string;
  }) {
    const client = clients.find(item => item.id === result.clientId);
    if (client) {
      void openClient(client);
      return;
    }
    setSelectedId(result.clientId);
    setStorageError("");
    setClientFlash("");
    navigate("coach-space");
    void refreshSessionsForClient(result.clientId);
  }

  async function saveSession(updated: Session): Promise<Session> {
    if (!selected || !coachId || !authReady || !profile) {
      throw new Error("Sign in and select a client before saving a session.");
    }
    if (isClientArchived(selected)) {
      throw new Error("This client is archived. Restore them to add new coaching activity.");
    }
    setStorageError("");

    const record = buildStructuredSessionRecord(updated, {
      clientId: selected.id,
      coachId,
      sessionNumber: updated.sessionNumber,
    });

    const saved = await saveSessionRecord(record);
    setClients(current =>
      current.map(client => {
        if (client.id !== selected.id) return client;
        return {
          ...client,
          sessions: client.sessions.map(session =>
            session.id === saved.id ? saved : session
          ),
          nextSession:
            saved.status !== "completed" && saved.date
              ? `${saved.date}${saved.time ? `, ${saved.time}` : ""}`
              : client.nextSession,
        };
      })
    );
    return saved;
  }

  async function scheduleSessionForClient(
    client: Client,
    values: ScheduleSessionValues,
    options?: { openWorkspace?: boolean }
  ): Promise<Session> {
    if (!client?.id) {
      throw new Error(
        "This relationship is missing required context. Refresh and try again."
      );
    }
    if (!coachId || !authReady || !profile) {
      throw new Error("Select a client before scheduling a session.");
    }
    if (isClientArchived(client)) {
      throw new Error("This client is archived. Restore them to add new coaching activity.");
    }
    setStorageError("");

    const dateValue = values.date.trim()
      ? formatDisplayDateFromIso(values.date)
      : "";
    const focusValue = (values.focus ?? values.title).trim();

    const blank = createBlankSession({
      id: crypto.randomUUID(),
      clientId: client.id,
      coachId,
      sessionNumber: nextSessionNumber(client.sessions),
      date: dateValue,
      time: values.startTime.trim(),
      title: values.title.trim(),
      focus: focusValue,
      durationMinutes: values.durationMinutes || 60,
      location: values.location,
      status: "planned",
      preparation: "",
    });

    const saved = await createSessionRecord(blank);
    const nextLabel = saved.date
      ? `${saved.date}${saved.time ? `, ${saved.time}` : ""}`
      : "Date not set";
    setClients(current =>
      current.map(item => {
        if (item.id !== client.id) return item;
        const sessions = [saved, ...item.sessions.filter(session => session.id !== saved.id)];
        return { ...item, sessions, nextSession: nextLabel };
      })
    );
    setSelectedId(client.id);
    setFocusSessionId(saved.id);
    setSessionFlash("");
    setClientFlash("Conversation created.");
    if (options?.openWorkspace !== false) {
      navigate("session");
    } else {
      // Remain on the relationship canvas and keep the new session focused.
      // Avoid navigate("coach-space") — it clears focusSessionId.
      setView("coach-space");
      setMobileOpen(false);
    }
    return saved;
  }

  async function saveActionForClient(
    action: CoachingAction & { clientId: string }
  ): Promise<CoachingAction> {
    if (!authReady || !profile) {
      throw new Error("Sign in before saving an action.");
    }
    const saved = await createActionRecord(action);
    setClients(current =>
      current.map(client => {
        if (client.id !== action.clientId) return client;
        const actions = [
          saved,
          ...client.actions.filter(item => item.id !== saved.id),
        ];
        return { ...client, actions };
      })
    );
    return saved;
  }

  async function editSelectedClient(fields: {
    name: string;
    organisation: string;
    role: string;
    email: string;
    currentFocus?: string;
    status?: "Active" | "Paused";
    preparationStyleOverride?: Client["preparationStyleOverride"];
    relationshipAgreement?: Client["relationshipAgreement"];
    initialConversation?: Client["initialConversation"];
    supportingContext?: Client["supportingContext"];
  }) {
    if (!selected || lifecycleBusy) return;
    setLifecycleBusy(true);
    setStorageError("");
    try {
      const updated = await updateClientRecord(selected.id, fields);
      if (!activeRef.current) return;
      setClients(current =>
        current.map(client =>
          client.id === updated.id
            ? {
                ...client,
                name: updated.name,
                organisation: updated.organisation,
                role: updated.role,
                email: updated.email ?? "",
                initials: updated.initials,
                status: updated.status,
                archivedAt: updated.archivedAt,
                currentFocus:
                  typeof updated.currentFocus === "string"
                    ? updated.currentFocus
                    : client.currentFocus,
                preparationStyleOverride:
                  updated.preparationStyleOverride !== undefined
                    ? updated.preparationStyleOverride
                    : client.preparationStyleOverride,
                relationshipAgreement:
                  updated.relationshipAgreement ??
                  fields.relationshipAgreement ??
                  client.relationshipAgreement,
                initialConversation:
                  updated.initialConversation ??
                  fields.initialConversation ??
                  client.initialConversation,
                supportingContext:
                  updated.supportingContext ??
                  fields.supportingContext ??
                  client.supportingContext,
              }
            : client
        )
      );
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        handleAuthFailure(error);
        throw error;
      }
      throw toError(error, "Unable to update the client. Please try again.");
    } finally {
      if (activeRef.current) setLifecycleBusy(false);
    }
  }

  async function archiveSelectedClient() {
    if (!selected || lifecycleBusy) return;
    const clientId = selected.id;
    setLifecycleBusy(true);
    setStorageError("");
    try {
      const updated = await archiveClientRecord(clientId);
      if (!activeRef.current) return;
      setClients(current =>
        current.map(client =>
          client.id === updated.id
            ? {
                ...client,
                status: "Archived",
                archivedAt: updated.archivedAt ?? new Date().toISOString(),
              }
            : client
        )
      );
      setClientsFlash("Person archived.");
      navigate("people");
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        handleAuthFailure(error);
        throw error;
      }
      throw toError(error, "Unable to archive the client. Please try again.");
    } finally {
      if (activeRef.current) setLifecycleBusy(false);
    }
  }

  async function restoreSelectedClient() {
    if (!selected || lifecycleBusy) return;
    const clientId = selected.id;
    setLifecycleBusy(true);
    setStorageError("");
    try {
      const updated = await restoreClientRecord(clientId);
      if (!activeRef.current) return;
      setClients(current =>
        current.map(client =>
          client.id === updated.id
            ? {
                ...client,
                status: "Active",
                archivedAt: null,
              }
            : client
        )
      );
      setClientsFlash("Person restored.");
      navigate("people");
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        handleAuthFailure(error);
        throw error;
      }
      throw toError(error, "Unable to restore the client. Please try again.");
    } finally {
      if (activeRef.current) setLifecycleBusy(false);
    }
  }

  async function permanentlyDeleteSelectedClient() {
    if (!selected || lifecycleBusy) return;
    const clientId = selected.id;
    setLifecycleBusy(true);
    setStorageError("");
    try {
      await permanentlyDeleteClientRecord(clientId);
      if (!activeRef.current) return;
      setClients(current => current.filter(client => client.id !== clientId));
      setSelectedId(current => (current === clientId ? "" : current));
      setClientsFlash("Client permanently deleted");
      navigate("people");
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        handleAuthFailure(error);
        throw error;
      }
      throw toError(error, "Unable to delete the client. Please try again.");
    } finally {
      if (activeRef.current) setLifecycleBusy(false);
    }
  }

  async function handleSignOut() {
    activeRef.current = false;
    setClients([]);
    setSelectedId("");
    setProfile(null);
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      // Still leave the workspace even if the network call fails.
    }
    window.location.assign("/auth/sign-in");
  }

  // Auth / profile still resolving — never mount AppShell or coaching views.
  if (!authReady && !authError) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="login-card">
            <p className="eyebrow">Development Intelligence Platform</p>
            <h2>Opening your workspace…</h2>
            <p className="muted">Checking your secure session.</p>
          </div>
        </section>
      </main>
    );
  }

  if (authError || !profile) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="login-card">
            <p className="eyebrow">SESSION</p>
            <h2>Unable to open your workspace</h2>
            <p className="muted">{authError || "Your profile could not be loaded."}</p>
            <button className="primary full" type="button" onClick={() => leaveToSignIn()}>
              Return to sign in
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <OrganisationProvider
      initial={organisationState}
      onOrganisationSwitched={() => {
        setSelectedId("");
        setClients([]);
        setFocusSessionId(null);
        setFocusSessionStage(null);
        setFocusUpdateId(null);
        setFocusReportId(null);
      }}
    >
    <AppShell
      view={view}
      onNavigate={navigate}
      onNewClient={() => {
        openNewClientForm();
      }}
      onSignOut={() => {
        void handleSignOut();
      }}
      mobileOpen={mobileOpen}
      setMobileOpen={setMobileOpen}
      creatingClient={creatingClient}
      coachName={coachDisplayName}
      coachTitle={coachTitle}
      coachInitials={coachInitials}
    >
      <NewClientDialog
        open={newClientOpen}
        busy={creatingClient}
        onClose={() => {
          if (!creatingClient) setNewClientOpen(false);
        }}
        onCreate={async fields => {
          await createClient(fields);
        }}
      />

      {storageError && (
        <div className="storage-error" role="alert">
          <p>{storageError}</p>
          <button
            type="button"
            disabled={retrying}
            aria-busy={retrying}
            onClick={() => {
              setRetrying(true);
              setStorageError("");
              void refreshClients().finally(() => setRetrying(false));
            }}
          >
            {retrying ? "Retrying..." : "Try again"}
          </button>
        </div>
      )}

      {sessionsLoadError ? (
        <SessionsLoadError
          retrying={retryingSessions || loadingClientSessions}
          onRetry={() => {
            void retrySessionsLoad();
          }}
          onReturn={() => {
            setSessionsLoadError(false);
            setFocusSessionId(null);
            setFocusSessionStage(null);
            navigate("coach-space");
          }}
        />
      ) : null}

      {loadingClients && !hydrated ? (
        <PageSkeleton cards={3} columns="three" />
      ) : (
        <>
          {(view === "today" || view === "dashboard") && (
            <TodayView
              clients={clients}
              coachName={coachFirstName}
              userId={coachId}
              coachId={coachId}
              onCreatePerson={() => {
                openNewClientForm();
              }}
              onViewPeople={() => navigate("people")}
              onOpenClient={client => {
                void openClient(client);
              }}
              onPrepare={client => {
                void prepare(client);
              }}
              onOpenSession={(client, sessionId) => {
                setSelectedId(client.id);
                setFocusSessionId(sessionId);
                navigate("session");
                void refreshSessionsForClient(client.id);
              }}
              onOpenIntelligence={() => navigate("global-intelligence")}
              onOpenMyDevelopment={() => navigate("my-development")}
              onReviewDevelopmentUpdate={(client, updateId) => {
                setSelectedId(client.id);
                setFocusUpdateId(updateId);
                navigate("development-update");
                void refreshSessionsForClient(client.id);
              }}
              onOpenReport={(client, reportId) => {
                setSelectedId(client.id);
                setFocusReportId(reportId);
                navigate("reports");
                void refreshSessionsForClient(client.id);
              }}
              onCreateClientForOnboarding={createClientForOnboarding}
              onCreateSessionForOnboarding={createSessionForOnboarding}
              onPrepareAfterOnboarding={prepareAfterOnboarding}
              onViewRelationshipAfterOnboarding={viewRelationshipAfterOnboarding}
            />
          )}
          {(view === "clients" || view === "people") && (
            <ClientsView
              clients={clients}
              creating={creatingClient}
              flashMessage={clientsFlash}
              onOpen={client => {
                setClientsFlash("");
                void openClient(client);
              }}
              onAdd={() => {
                openNewClientForm();
              }}
            />
          )}
          {view === "sessions" && (
            <SessionsView
              clients={clients}
              onOpenSession={(clientId, sessionId) => {
                setSelectedId(clientId);
                setFocusSessionId(sessionId);
                navigate("session");
                void refreshSessionsForClient(clientId);
              }}
            />
          )}
          {view === "global-intelligence" && (
            <GlobalIntelligenceView
              clients={clients}
              onOpenClient={client => {
                setSelectedId(client.id);
                navigate("intelligence");
                void refreshSessionsForClient(client.id);
              }}
              onReviewUpdate={(client, updateId) => {
                setSelectedId(client.id);
                setFocusUpdateId(updateId);
                navigate("development-update");
                void refreshSessionsForClient(client.id);
              }}
              onOpenMyDevelopment={() => navigate("my-development")}
            />
          )}
          {view === "my-development" && (
            <MyDevelopmentView
              isPersonalWorkspace={
                organisationState?.organisation.organisationType === "personal"
              }
              onOpenPeople={() => navigate("people")}
              onOpenTeamIntelligence={() => navigate("team-intelligence")}
              onOpenPersonalEvidence={() => {
                if (selected) {
                  navigate("development-evidence");
                  return;
                }
                navigate("people");
              }}
              onSwitchToPersonal={() => {
                const personal = organisationState?.organisations.find(
                  entry => entry.organisation.organisationType === "personal"
                );
                if (personal) {
                  void (async () => {
                    const { apiJson } = await import("@/lib/api-client");
                    await apiJson("/api/organisations/current", {
                      method: "POST",
                      body: JSON.stringify({
                        organisationId: personal.organisation.id,
                      }),
                    });
                    setSelectedId("");
                    setClients([]);
                    setFocusSessionId(null);
                    window.location.assign("/?view=dashboard");
                  })();
                }
              }}
            />
          )}
          {view === "team-intelligence" && (
            <TeamIntelligenceView
              onBack={() => navigate("my-development")}
            />
          )}
          {view === "settings" && profile && (
            <SettingsView
              profile={profile}
              onProfileUpdated={next =>
                setProfile(current =>
                  current
                    ? {
                        ...current,
                        ...next,
                        initials: next.fullName
                          ? initialsFromFullName(next.fullName)
                          : current.initials,
                        email: next.email ?? current.email,
                      }
                    : current
                )
              }
            />
          )}
          {view === "coach-space" && selected && (
            <CoachSpaceView
              key={selected.id}
              client={selected}
              preferredSessionId={focusSessionId}
              coachPreparationStyle={profile?.preparationStyle ?? "guided"}
              loadingSessions={loadingClientSessions}
              lifecycleBusy={lifecycleBusy}
              flashMessage={clientFlash}
              onBack={() => navigate("people")}
              onOpenSession={sessionId => {
                setFocusSessionStage(null);
                void openSessionWorkspace(sessionId);
              }}
              onOpenSessionModule={(sessionId, moduleId) => {
                const route = buildSessionModuleRoute({
                  relationshipId: selected.id,
                  sessionId,
                  module: moduleId,
                });
                setFocusSessionId(sessionId);
                setFocusSessionStage(
                  route.stage === "coach" ||
                    route.stage === "reflect" ||
                    route.stage === "summary" ||
                    route.stage === "actions"
                    ? route.stage
                    : null
                );
                setSessionFlash("");
                if (moduleId === "prepare") {
                  void prepare(selected, sessionId);
                  return;
                }
                navigate("session");
                void refreshSessionsForClient(selected.id);
              }}
              onPrepare={sessionId => {
                void prepare(selected, sessionId);
              }}
              onReviewIntelligence={() => navigate("intelligence")}
              onReviewDevelopmentUpdate={updateId => {
                setFocusUpdateId(updateId);
                navigate("development-update");
              }}
              onTabChange={handleWorkspaceTab}
              onScheduleSession={async (values, options) => {
                try {
                  if (!selected) {
                    throw new Error(
                      "This relationship is missing required context. Refresh and try again."
                    );
                  }
                  await scheduleSessionForClient(selected, values, options);
                } catch (error) {
                  if (error instanceof AuthRequiredError) {
                    handleAuthFailure(error);
                    throw toError(error, "Your session has expired. Please sign in again.");
                  }
                  throw toError(
                    error,
                    "Unable to schedule the session in Supabase. Please try again."
                  );
                }
              }}
              onEditClient={fields => editSelectedClient(fields)}
              onArchiveClient={() => archiveSelectedClient()}
              onRestoreClient={() => restoreSelectedClient()}
              onPermanentlyDeleteClient={() => permanentlyDeleteSelectedClient()}
            />
          )}
          {view === PREPARE_VIEW && selected && (() => {
            const destination = getPrepareRoute(selected.id);
            const prepSession =
              (focusSessionId
                ? selected.sessions.find(session => session.id === focusSessionId)
                : undefined) ?? getFutureOrOpenSession(selected.sessions);
            if (!prepSession) {
              return (
                <section className="page">
                  <article className="panel empty-panel">
                    <h2>No conversation to prepare</h2>
                    <p className="muted empty-state">
                      Schedule a conversation from Current Position before preparing.
                    </p>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => navigate("coach-space")}
                    >
                      Back to Current Position
                    </button>
                  </article>
                </section>
              );
            }
            return (
              <PrepareSessionView
                key={`${destination.path}:${prepSession.id}`}
                client={selected}
                session={prepSession}
                coachPreparationStyle={profile?.preparationStyle ?? "guided"}
                coachIntelligenceMode={
                  profile?.coachingIntelligenceMode ??
                  (profile?.preparationStyle === "minimal"
                    ? "manual"
                    : profile?.preparationStyle === "enhanced"
                      ? "comprehensive"
                      : "assisted")
                }
                onBack={() => {
                  setFocusSessionId(prepSession.id);
                  setFocusSessionStage(null);
                  navigate("coach-space");
                }}
                onBackToPeople={() => navigate("people")}
                onSaveSession={async session => saveSession(session)}
                onStartSession={async session => {
                  const now = new Date().toISOString();
                  const started = await saveSession({
                    ...session,
                    status: "in_progress",
                    sessionStartedAt: session.sessionStartedAt || now,
                    timerStartedAt: session.timerStartedAt || now,
                  });
                  setFocusSessionId(started.id);
                  setFocusSessionStage("coach");
                  navigate("session");
                }}
                onClientUpdated={updated => {
                  setClients(current =>
                    current.map(item =>
                      item.id === updated.id
                        ? {
                            ...item,
                            preparationStyleOverride: updated.preparationStyleOverride,
                          }
                        : item
                    )
                  );
                }}
                onProfileUpdated={next => {
                  setProfile(current =>
                    current
                      ? {
                          ...current,
                          coachingIntelligenceMode: next.coachingIntelligenceMode,
                          preparationStyle: next.preparationStyle,
                        }
                      : current
                  );
                }}
                onTabChange={handleWorkspaceTab}
              />
            );
          })()}
          {view === "session" && selected && (() => {
            const activeSession =
              (focusSessionId
                ? selected.sessions.find(session => session.id === focusSessionId)
                : undefined) ?? getFutureOrOpenSession(selected.sessions);

            if (!activeSession) {
              return (
                <section className="page">
                  <article className="panel empty-panel">
                    <h2>No session selected</h2>
                    <p className="muted empty-state">
                      Schedule a conversation from Current Position to open Session Notes.
                    </p>
                    <div className="button-row">
                      <button
                        type="button"
                        className="primary"
                        onClick={() => navigate("coach-space")}
                      >
                        Back to Current Position
                      </button>
                    </div>
                  </article>
                </section>
              );
            }

            return (
              <SessionWorkspace
                key={`${selected.id}:${activeSession.id}`}
                client={selected}
                session={activeSession}
                initialStage={focusSessionStage}
                flashMessage={sessionFlash}
                coachingIntelligenceMode={
                  profile?.coachingIntelligenceMode ??
                  (profile?.preparationStyle === "minimal"
                    ? "manual"
                    : profile?.preparationStyle === "enhanced"
                      ? "comprehensive"
                      : "assisted")
                }
                onTabChange={handleWorkspaceTab}
                onOpenSessionModule={(sessionId, moduleId) => {
                  const route = buildSessionModuleRoute({
                    relationshipId: selected.id,
                    sessionId,
                    module: moduleId,
                  });
                  setFocusSessionId(sessionId);
                  setFocusSessionStage(
                    route.stage === "coach" ||
                      route.stage === "reflect" ||
                      route.stage === "summary" ||
                      route.stage === "actions"
                      ? route.stage
                      : null
                  );
                }}
                onBack={() => {
                  setSessionFlash("");
                  setFocusSessionStage(null);
                  navigate("coach-space");
                }}
                onBackToPeople={() => navigate("people")}
                onReturnOverview={() => {
                  setSessionFlash("");
                  setFocusSessionStage(null);
                  navigate("coach-space");
                }}
                onPrepareNext={() => {
                  void prepare(selected);
                }}
                onSave={async session => {
                  try {
                    return await saveSession(session);
                  } catch (error) {
                    if (error instanceof AuthRequiredError) {
                      handleAuthFailure(error);
                      throw error;
                    }
                    const normalized = toError(
                      error,
                      "Unable to save the session in Supabase. Please try again."
                    );
                    setStorageError(normalized.message);
                    throw normalized;
                  }
                }}
                onSaveAction={async action => {
                  try {
                    return await saveActionForClient(action);
                  } catch (error) {
                    if (error instanceof AuthRequiredError) {
                      handleAuthFailure(error);
                      throw error;
                    }
                    throw toError(error, "Unable to save the action. Please try again.");
                  }
                }}
                onScheduleNext={async values => {
                  try {
                    await scheduleSessionForClient(selected, values);
                  } catch (error) {
                    if (error instanceof AuthRequiredError) {
                      handleAuthFailure(error);
                      throw error;
                    }
                    throw toError(
                      error,
                      "Unable to schedule the next session. Please try again."
                    );
                  }
                }}
                onReviewDevelopmentUpdate={updateId => {
                  setFocusUpdateId(updateId);
                  navigate("development-update");
                }}
              />
            );
          })()}
          {view === "intelligence" && selected && (
            <PersonIntelligenceView
              key={selected.id}
              client={selected}
              onBack={() => navigate("coach-space")}
              onTabChange={handleWorkspaceTab}
              onOpenEvidence={() => navigate("development-evidence")}
              onClientUpdated={updated => {
                setClients(current =>
                  current.map(client =>
                    client.id === updated.id
                      ? {
                          ...client,
                          supportingContext: updated.supportingContext,
                          relationshipAgreement: updated.relationshipAgreement,
                          initialConversation: updated.initialConversation,
                        }
                      : client
                  )
                );
              }}
              onReviewUpdate={updateId => {
                setFocusUpdateId(updateId);
                navigate("development-update");
              }}
            />
          )}
          {view === "development-evidence" && selected && (
            <DevelopmentEvidenceView
              key={`evidence-${selected.id}`}
              client={selected}
              onBack={() => navigate("coach-space")}
              onOpenIntelligence={() => navigate("intelligence")}
            />
          )}
          {view === "development-update" && focusUpdateId && (
            <DevelopmentUpdateReviewView
              updateId={focusUpdateId}
              onBack={() => {
                setFocusUpdateId(null);
                navigate(selected ? "intelligence" : "global-intelligence");
              }}
              onBackToPerson={
                selected
                  ? () => {
                      setFocusUpdateId(null);
                      navigate("coach-space");
                    }
                  : undefined
              }
              onBackToPeople={() => {
                setFocusUpdateId(null);
                navigate("people");
              }}
              onApplied={() => {
                void refreshClients();
                if (selected) void refreshSessionsForClient(selected.id);
              }}
              onDiscarded={() => {
                if (selected) void refreshSessionsForClient(selected.id);
              }}
            />
          )}
          {view === "person-actions" && selected && (
            <PersonActionsView
              client={selected}
              onBack={() => navigate("coach-space")}
              onTabChange={handleWorkspaceTab}
            />
          )}
          {view === "career-journey" && selected && (
            <CareerJourneyView
              key={selected.id}
              client={selected}
              onBack={() => navigate("coach-space")}
              onTabChange={handleWorkspaceTab}
            />
          )}
          {view === "journey" && selected && (
            <JourneyView
              key={selected.id}
              client={selected}
              loadingSessions={loadingClientSessions}
              onBack={() => navigate("coach-space")}
              onPrepare={() => {
                void prepare(selected);
              }}
              onCreateReport={() => {
                if (isClientArchived(selected)) return;
                setFocusReportId(null);
                void refreshSessionsForClient(selected.id);
                navigate("reports");
              }}
              onOpenSession={sessionId => {
                void openSessionFromJourney(sessionId);
              }}
              onTabChange={handleWorkspaceTab}
            />
          )}
          {view === "coaching-report" && selected && (
            <CoachingReportView
              key={selected.id}
              client={selected}
              coachName={coachDisplayName}
              loadingSessions={loadingClientSessions}
              onBack={() => navigate("journey")}
              onTabChange={handleWorkspaceTab}
            />
          )}
          {view === "reports" && selected && (
            <RelationshipReportsView
              key={selected.id}
              client={selected}
              coachName={coachDisplayName}
              initialReportId={focusReportId}
              onBack={() => {
                setFocusReportId(null);
                navigate("coach-space");
              }}
              onTabChange={tab => {
                setFocusReportId(null);
                handleWorkspaceTab(tab);
              }}
            />
          )}
          {(view === "coach-space" ||
            view === PREPARE_VIEW ||
            view === "session" ||
            view === "intelligence" ||
            view === "development-evidence" ||
            view === "person-actions" ||
            view === "career-journey" ||
            view === "journey" ||
            view === "coaching-report" ||
            view === "reports") &&
            !selected && (
              <section className="page identity-reveal">
                <article className="panel empty-panel">
                  <h2 className="identity-subheading">No person selected</h2>
                  <p className="muted empty-state">
                    Choose someone from People to open their development journey.
                  </p>
                  <div className="button-row">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => {
                        openNewClientForm();
                      }}
                      disabled={creatingClient}
                      aria-busy={creatingClient}
                    >
                      New person
                    </button>
                    <button type="button" className="secondary" onClick={() => navigate("people")}>
                      View people
                    </button>
                  </div>
                </article>
              </section>
            )}
        </>
      )}
    </AppShell>
    </OrganisationProvider>
  );
}
