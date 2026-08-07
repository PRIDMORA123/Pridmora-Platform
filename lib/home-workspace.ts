import type { Client, Session } from "@/lib/types";
import { isClientArchived } from "@/lib/types";
import {
  conversationFocus,
  deriveJourneyStage,
  getCoachingPurpose,
} from "@/lib/client-journey";
import type { DevelopmentUpdateReviewTask } from "@/lib/development-updates/types";
import type { DevelopmentUpdate } from "@/lib/development-updates/types";
import { getPrepareRoute } from "@/lib/prepare-route";
import {
  getFutureOrOpenSession,
  hasPreparationContent,
  unresolvedActions,
} from "@/lib/session-workflow";
import type { ProfessionalRole } from "@/lib/organisations/types";
import { resolveProductLanguage } from "@/lib/role-language";

export type HomeWorkspaceViewModel = {
  greeting: string;
  coachName: string;
  workspaceSummary: string;

  nextBestAction: {
    relationshipId: string;
    personName: string;
    role?: string | null;
    organisation?: string | null;
    eyebrow: string;
    status: string;
    title: string;
    explanation: string;
    evidence?: string | null;
    actionLabel: string;
    actionHref: string;
    actionKind:
      | "continue_conversation"
      | "complete_reflection"
      | "review_development_update"
      | "start_conversation"
      | "prepare"
      | "open_relationship"
      | "review_relationships"
      | "create_person";
    sessionId?: string;
    updateId?: string;
  } | null;

  overview: {
    activeRelationships: number;
    conversationsInProgress: number;
    awaitingPreparation: number;
    recentReflections: number;
  };

  conversationsInProgress: Array<{
    id: string;
    relationshipId: string;
    personName: string;
    context?: string | null;
    state: string;
    stateDescription: string;
    updatedLabel?: string | null;
    actionLabel: string;
    actionHref: string;
    actionKind: "continue_conversation" | "start_conversation";
    sessionId: string;
  }>;

  recentDevelopment: Array<{
    id: string;
    relationshipId: string;
    personName: string;
    change: string;
    dateLabel: string;
    sortAt: number;
  }>;

  relationships: Array<{
    id: string;
    name: string;
    role?: string | null;
    organisation?: string | null;
    stage: string;
    nextStep?: string | null;
    lastMeaningfulActivity?: string | null;
  }>;

  emptyKind: "none" | "no_relationships" | "up_to_date";
};

export type HomeWorkspaceCandidate = {
  priority: number;
  relationshipId: string;
  personName: string;
  role?: string | null;
  organisation?: string | null;
  eyebrow: string;
  status: string;
  title: string;
  explanation: string;
  evidence?: string | null;
  actionLabel: string;
  actionHref: string;
  actionKind: NonNullable<HomeWorkspaceViewModel["nextBestAction"]>["actionKind"];
  sessionId?: string;
  updateId?: string;
};

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function coachFirstName(coachName: string): string {
  return coachName.trim().split(/\s+/)[0] || "there";
}

function developmentConversationLabel(session: Pick<Session, "sessionNumber">): string {
  return `Development Conversation ${session.sessionNumber}`;
}

function formatRelativeActivity(isoOrDate: string | undefined | null): string | null {
  if (!isoOrDate?.trim()) return null;
  const parsed = Date.parse(isoOrDate);
  if (Number.isNaN(parsed)) {
    return isoOrDate.trim();
  }

  const diffMs = Date.now() - parsed;
  const dayMs = 24 * 60 * 60 * 1000;
  if (diffMs < dayMs) return "Updated today";
  if (diffMs < 2 * dayMs) return "Updated yesterday";
  const days = Math.floor(diffMs / dayMs);
  if (days < 14) return `Updated ${days} days ago`;

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(parsed));
}

function formatDateLabel(isoOrDate: string | undefined | null): string {
  if (!isoOrDate?.trim()) return "Recently";
  const parsed = Date.parse(isoOrDate);
  if (Number.isNaN(parsed)) return isoOrDate.trim();
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(parsed));
}

function withinLastDays(isoOrDate: string | undefined | null, days: number): boolean {
  if (!isoOrDate?.trim()) return false;
  const parsed = Date.parse(isoOrDate);
  if (Number.isNaN(parsed)) return false;
  return Date.now() - parsed <= days * 24 * 60 * 60 * 1000;
}

function personContext(client: Client): string | null {
  const parts = [client.role?.trim(), client.organisation?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function nextStepForRelationship(
  client: Client,
  awaitingUpdates: DevelopmentUpdateReviewTask[]
): string | null {
  const pending = awaitingUpdates.find(task => task.clientId === client.id);
  if (pending) return "Review the Development Update";

  const session = getFutureOrOpenSession(client.sessions);
  if (!session) {
    if (!getCoachingPurpose(client)) return "Agree the coaching purpose";
    return "Prepare the next development conversation";
  }

  switch (session.status) {
    case "in_progress":
    case "paused":
      return "Continue the development conversation";
    case "awaiting_completion":
      return "Complete the reflection";
    case "prepared":
      return "Start the development conversation";
    case "planned":
      return hasPreparationContent(session) || session.prepAiBriefConfirmedAt?.trim()
        ? "Continue preparation"
        : "Prepare the next conversation";
    default:
      return null;
  }
}

function lastMeaningfulActivity(client: Client): string | null {
  const sessions = [...client.sessions].sort((a, b) => {
    const aTime = Date.parse(a.lastUpdated || a.completedAt || a.date) || 0;
    const bTime = Date.parse(b.lastUpdated || b.completedAt || b.date) || 0;
    return bTime - aTime;
  });
  const latest = sessions[0];
  if (!latest) {
    return client.createdAt ? formatRelativeActivity(client.createdAt) : null;
  }
  return formatRelativeActivity(latest.lastUpdated || latest.completedAt || latest.date);
}

function approvedChangeFromSession(session: Session): string | null {
  if (session.status !== "completed") return null;
  if (!(session.summaryStatus === "approved" || session.aiSummaryApproved)) return null;

  const identity = session.professionalIdentityDevelopment.trim();
  if (identity) {
    const sentence = identity.match(/^[^.!?]+[.!?]?/)?.[0]?.trim();
    return sentence || identity;
  }

  const themes = session.emergingThemes.trim();
  if (themes) {
    const sentence = themes.match(/^[^.!?]+[.!?]?/)?.[0]?.trim();
    return sentence || themes;
  }

  const focus = conversationFocus(session);
  if (focus) {
    return `${developmentConversationLabel(session)} completed — focus: ${focus}`;
  }

  return `${developmentConversationLabel(session)} completed`;
}

function changeFromAppliedUpdate(update: DevelopmentUpdate): string {
  const focus = update.appliedChanges?.currentFocus?.value?.trim();
  if (focus) return `Focus updated to “${focus}”`;

  const note = update.coachNote?.trim();
  if (note) {
    const sentence = note.match(/^[^.!?]+[.!?]?/)?.[0]?.trim();
    return sentence || note;
  }

  const summary = update.conversationSummary?.trim();
  if (summary) {
    const sentence = summary.match(/^[^.!?]+[.!?]?/)?.[0]?.trim();
    return sentence || summary;
  }

  return "Approved development update applied";
}

function buildWorkspaceSummary(input: {
  attentionCount: number;
  conversationsInProgress: number;
  awaitingPreparation: number;
  relationshipSingular: string;
  relationshipPlural: string;
  workNoun: string;
}): string {
  const {
    attentionCount,
    conversationsInProgress,
    awaitingPreparation,
    relationshipSingular,
    relationshipPlural,
    workNoun,
  } = input;

  if (attentionCount === 0 && conversationsInProgress === 0 && awaitingPreparation === 0) {
    return `Your current ${workNoun} work is up to date.`;
  }

  if (attentionCount === 1 && conversationsInProgress === 0) {
    return `One ${relationshipSingular} may benefit from your attention today.`;
  }

  if (attentionCount > 1 && conversationsInProgress === 0) {
    return `${attentionCount} ${relationshipPlural} may benefit from your attention today.`;
  }

  if (conversationsInProgress > 0 && attentionCount > 0) {
    const relationshipLabel =
      attentionCount === 1
        ? "one relationship is ready for preparation"
        : `${attentionCount} relationships may benefit from attention`;
    const conversationLabel =
      conversationsInProgress === 1
        ? "One conversation is in progress"
        : `${conversationsInProgress} conversations are in progress`;
    return `${conversationLabel} and ${relationshipLabel}.`;
  }

  if (conversationsInProgress > 0) {
    return conversationsInProgress === 1
      ? "One conversation is in progress."
      : `${conversationsInProgress} conversations are in progress.`;
  }

  if (awaitingPreparation === 1) {
    return `One ${relationshipSingular} may benefit from your attention today.`;
  }

  if (awaitingPreparation > 1) {
    return `${awaitingPreparation} ${relationshipPlural} may benefit from your attention today.`;
  }

  return `Your current ${workNoun} work is up to date.`;
}

/**
 * Collect priority candidates using a single workflow order.
 * Lower priority number wins.
 */
export function collectHomePriorityCandidates(
  clients: Client[],
  awaitingUpdates: DevelopmentUpdateReviewTask[] = []
): HomeWorkspaceCandidate[] {
  const active = clients.filter(client => !isClientArchived(client));
  const candidates: HomeWorkspaceCandidate[] = [];

  for (const client of active) {
    const session = getFutureOrOpenSession(client.sessions);
    const role = client.role?.trim() || null;
    const organisation = client.organisation?.trim() || null;

    if (session?.status === "in_progress" || session?.status === "paused") {
      const focus = conversationFocus(session);
      candidates.push({
        priority: 1,
        relationshipId: client.id,
        personName: client.name,
        role,
        organisation,
        eyebrow: "Next best action",
        status: "Conversation in progress",
        title: "Continue the development conversation",
        explanation:
          focus ||
          "This conversation is already under way and is ready for you to continue.",
        evidence: `${developmentConversationLabel(session)} is currently open.`,
        actionLabel: "Continue conversation",
        actionHref: `/people/${client.id}/session/${session.id}`,
        actionKind: "continue_conversation",
        sessionId: session.id,
      });
    }

    if (session?.status === "awaiting_completion") {
      const focus = conversationFocus(session);
      candidates.push({
        priority: 2,
        relationshipId: client.id,
        personName: client.name,
        role,
        organisation,
        eyebrow: "Next best action",
        status: "Ready for reflection",
        title: "Complete the reflection",
        explanation:
          focus ||
          "The live conversation has finished. Capture the reflection while the work is still clear.",
        evidence: `${developmentConversationLabel(session)} is awaiting completion.`,
        actionLabel: "Complete reflection",
        actionHref: `/people/${client.id}/session/${session.id}`,
        actionKind: "complete_reflection",
        sessionId: session.id,
      });
    }
  }

  for (const task of awaitingUpdates) {
    const client = active.find(entry => entry.id === task.clientId);
    candidates.push({
      priority: 3,
      relationshipId: task.clientId,
      personName: task.clientName,
      role: client?.role?.trim() || null,
      organisation: client?.organisation?.trim() || null,
      eyebrow: "Next best action",
      status: "Development update available",
      title: "Review the Development Update",
      explanation:
        "A Development Update from the latest conversation is ready for your review before it is applied.",
      evidence: "Approved coaching evidence is waiting to be applied to the journey.",
      actionLabel: "Review update",
      actionHref: `/people/${task.clientId}/development-update/${task.update.id}`,
      actionKind: "review_development_update",
      updateId: task.update.id,
    });
  }

  for (const client of active) {
    const session = getFutureOrOpenSession(client.sessions);
    const role = client.role?.trim() || null;
    const organisation = client.organisation?.trim() || null;
    const prepareHref = getPrepareRoute(client.id).path;

    if (session?.status === "prepared") {
      const focus = conversationFocus(session);
      candidates.push({
        priority: 4,
        relationshipId: client.id,
        personName: client.name,
        role,
        organisation,
        eyebrow: "Next best action",
        status: "Ready for development conversation",
        title: "Start the next development conversation",
        explanation:
          focus ||
          "Preparation is confirmed and this relationship is ready for the live conversation.",
        evidence: `${developmentConversationLabel(session)} is prepared and ready to begin.`,
        actionLabel: "Start conversation",
        actionHref: `/people/${client.id}/session/${session.id}`,
        actionKind: "start_conversation",
        sessionId: session.id,
      });
    }

    if (session?.status === "planned") {
      const purpose = getCoachingPurpose(client);
      const hasPrep =
        hasPreparationContent(session) || Boolean(session.prepAiBriefConfirmedAt?.trim());
      candidates.push({
        priority: 5,
        relationshipId: client.id,
        personName: client.name,
        role,
        organisation,
        eyebrow: "Next best action",
        status: hasPrep ? "Preparation in progress" : "Ready for preparation",
        title: hasPrep
          ? "Continue preparation for the next conversation"
          : "Prepare for the next development conversation",
        explanation: purpose
          ? "The coaching purpose has been agreed and this relationship is ready for focused preparation."
          : "Agree the coaching purpose, then prepare thoughtfully for the next conversation.",
        evidence: hasPrep
          ? "Preparation has started and can be continued when you are ready."
          : "No preparation brief has yet been created for the next conversation.",
        actionLabel: hasPrep ? "Continue preparation" : "Prepare conversation",
        actionHref: prepareHref,
        actionKind: "prepare",
        sessionId: session.id,
      });
    }
  }

  for (const client of active) {
    const overdue = unresolvedActions(client.actions).filter(action => {
      if (!action.due) return false;
      const due = Date.parse(action.due);
      return !Number.isNaN(due) && due < Date.now();
    });
    if (overdue.length === 0) continue;

    candidates.push({
      priority: 6,
      relationshipId: client.id,
      personName: client.name,
      role: client.role?.trim() || null,
      organisation: client.organisation?.trim() || null,
      eyebrow: "Next best action",
      status: "Commitment due for review",
      title: "Review outstanding commitments",
      explanation:
        "One or more commitments from earlier conversations are due and ready for review.",
      evidence:
        overdue.length === 1
          ? `“${overdue[0].title}” is past its due date.`
          : `${overdue.length} commitments are past their due date.`,
      actionLabel: "Open relationship",
      actionHref: `/people/${client.id}`,
      actionKind: "open_relationship",
    });
  }

  return candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.personName.localeCompare(b.personName);
  });
}

export function resolveHomeWorkspaceViewModel(input: {
  clients: Client[];
  coachName: string;
  awaitingUpdates?: DevelopmentUpdateReviewTask[];
  recentlyAppliedUpdates?: Array<{
    update: DevelopmentUpdate;
    clientId: string;
    clientName: string;
  }>;
  professionalRole?: ProfessionalRole | null;
}): HomeWorkspaceViewModel {
  const language = resolveProductLanguage(input.professionalRole);
  const workNoun =
    input.professionalRole === "manager" ? "management" : "coaching";
  const awaitingUpdates = input.awaitingUpdates ?? [];
  const recentlyAppliedUpdates = input.recentlyAppliedUpdates ?? [];
  const active = input.clients.filter(client => !isClientArchived(client));
  const greeting = getGreeting();
  const coachName = coachFirstName(input.coachName);

  if (active.length === 0) {
    return {
      greeting,
      coachName,
      workspaceSummary: language.emptyRelationshipsDescription,
      nextBestAction: {
        relationshipId: "",
        personName: "",
        eyebrow: "Get started",
        status: "No relationships yet",
        title: language.emptyRelationshipsTitle,
        explanation: language.emptyRelationshipsDescription,
        actionLabel: "Add your first person",
        actionHref: "/people/new",
        actionKind: "create_person",
      },
      overview: {
        activeRelationships: 0,
        conversationsInProgress: 0,
        awaitingPreparation: 0,
        recentReflections: 0,
      },
      conversationsInProgress: [],
      recentDevelopment: [],
      relationships: [],
      emptyKind: "no_relationships",
    };
  }

  const candidates = collectHomePriorityCandidates(input.clients, awaitingUpdates);
  const nextBestAction = candidates[0]
    ? {
        relationshipId: candidates[0].relationshipId,
        personName: candidates[0].personName,
        role: candidates[0].role,
        organisation: candidates[0].organisation,
        eyebrow: candidates[0].eyebrow,
        status: candidates[0].status,
        title: candidates[0].title,
        explanation: candidates[0].explanation,
        evidence: candidates[0].evidence,
        actionLabel: candidates[0].actionLabel,
        actionHref: candidates[0].actionHref,
        actionKind: candidates[0].actionKind,
        sessionId: candidates[0].sessionId,
        updateId: candidates[0].updateId,
      }
    : null;

  const conversationsInProgress: HomeWorkspaceViewModel["conversationsInProgress"] = [];
  let awaitingPreparation = 0;
  let recentReflections = 0;

  for (const client of active) {
    const session = getFutureOrOpenSession(client.sessions);

    if (session?.status === "planned") {
      awaitingPreparation += 1;
    }

    if (
      session?.status === "prepared" ||
      session?.status === "in_progress" ||
      session?.status === "paused"
    ) {
      const focus = conversationFocus(session);
      const inProgress =
        session.status === "in_progress" || session.status === "paused";
      conversationsInProgress.push({
        id: session.id,
        relationshipId: client.id,
        personName: client.name,
        context: personContext(client),
        state: inProgress
          ? session.status === "paused"
            ? "Paused"
            : "In progress"
          : "Prepared",
        stateDescription: focus
          ? focus
          : inProgress
            ? language.continueWorkDescription
            : "Preparation is complete and the conversation is ready to begin.",
        updatedLabel: formatRelativeActivity(session.lastUpdated || session.date),
        actionLabel: inProgress ? "Continue" : "Start conversation",
        actionHref: `/people/${client.id}/session/${session.id}`,
        actionKind: inProgress ? "continue_conversation" : "start_conversation",
        sessionId: session.id,
      });
    }

    for (const sessionEntry of client.sessions) {
      if (sessionEntry.status !== "completed") continue;
      const stamp = sessionEntry.completedAt || sessionEntry.lastUpdated;
      if (withinLastDays(stamp, 30)) {
        recentReflections += 1;
      }
    }
  }

  const attentionCount = candidates.filter(
    candidate => candidate.priority === 2 || candidate.priority === 3 || candidate.priority === 5 || candidate.priority === 6
  ).length;
  const workspaceSummary = buildWorkspaceSummary({
    attentionCount: nextBestAction ? Math.max(attentionCount, 1) : 0,
    conversationsInProgress: conversationsInProgress.length,
    awaitingPreparation,
    relationshipSingular: language.relationshipSingular,
    relationshipPlural: language.relationshipPlural,
    workNoun,
  });

  const recentDevelopment: HomeWorkspaceViewModel["recentDevelopment"] = [];

  for (const item of recentlyAppliedUpdates) {
    const stamp = item.update.appliedAt || item.update.updatedAt;
    recentDevelopment.push({
      id: `applied-${item.update.id}`,
      relationshipId: item.clientId,
      personName: item.clientName,
      change: changeFromAppliedUpdate(item.update),
      dateLabel: formatDateLabel(stamp),
      sortAt: Date.parse(stamp || "") || 0,
    });
  }

  if (recentDevelopment.length < 3) {
    const fromSessions: HomeWorkspaceViewModel["recentDevelopment"] = [];
    for (const client of active) {
      for (const session of client.sessions) {
        const change = approvedChangeFromSession(session);
        if (!change) continue;
        const stamp = session.completedAt || session.lastUpdated || session.date;
        fromSessions.push({
          id: `session-${session.id}`,
          relationshipId: client.id,
          personName: client.name,
          change,
          dateLabel: formatDateLabel(stamp),
          sortAt: Date.parse(stamp || "") || 0,
        });
      }
    }
    fromSessions.sort((a, b) => b.sortAt - a.sortAt);
    for (const item of fromSessions) {
      if (
        recentDevelopment.some(
          existing =>
            existing.relationshipId === item.relationshipId && existing.change === item.change
        )
      ) {
        continue;
      }
      recentDevelopment.push(item);
      if (recentDevelopment.length >= 3) break;
    }
  }

  recentDevelopment.sort((a, b) => b.sortAt - a.sortAt);

  const relationships = active.slice(0, 4).map(client => {
    const stage = deriveJourneyStage(
      client,
      awaitingUpdates
        .filter(task => task.clientId === client.id)
        .map(task => task.update)
    );
    return {
      id: client.id,
      name: client.name,
      role: client.role?.trim() || null,
      organisation: client.organisation?.trim() || null,
      stage: stage.label,
      nextStep: nextStepForRelationship(client, awaitingUpdates),
      lastMeaningfulActivity: lastMeaningfulActivity(client),
    };
  });

  return {
    greeting,
    coachName,
    workspaceSummary:
      nextBestAction || conversationsInProgress.length > 0 || awaitingPreparation > 0
        ? workspaceSummary
        : language.workUpToDateTitle + ".",
    nextBestAction,
    overview: {
      activeRelationships: active.length,
      conversationsInProgress: conversationsInProgress.length,
      awaitingPreparation,
      recentReflections,
    },
    conversationsInProgress: conversationsInProgress.slice(0, 3),
    recentDevelopment: recentDevelopment.slice(0, 3),
    relationships,
    emptyKind: nextBestAction ? "none" : "up_to_date",
  };
}

/** Total conversations in progress across the portfolio (uncapped). */
export function countConversationsInProgress(clients: Client[]): number {
  return clients
    .filter(client => !isClientArchived(client))
    .reduce((count, client) => {
      const session = getFutureOrOpenSession(client.sessions);
      if (
      session?.status === "prepared" ||
      session?.status === "in_progress" ||
      session?.status === "paused"
    ) {
        return count + 1;
      }
      return count;
    }, 0);
}
