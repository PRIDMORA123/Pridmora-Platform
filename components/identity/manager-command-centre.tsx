"use client";

import { useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/api-client";
import { BRAND } from "@/lib/brand";
import type { MyDevelopmentWorkspace } from "@/lib/my-development/workspace";
import {
  MANAGER_HOME_PRIVACY_VISIBILITY_COPY,
  MANAGER_HOME_PRIVACY_VISIBILITY_LABEL,
} from "@/lib/organisations/manager-privacy-visibility-copy";
import { resolveManagerHomeOrganisationIdentity } from "@/lib/organisations/manager-home-organisation-identity";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import type { DevelopmentUpdateReviewTask } from "@/lib/development-updates/types";
import {
  buildManagerHomeAttentionItems,
  type ManagerHomeAttentionItem,
} from "@/lib/people/manager-home-attention";
import type { Client } from "@/lib/types";

export const MANAGER_FRONT_DOOR_ACTIONS = [
  {
    id: "talk",
    title: "Talk something through",
    description:
      "Something on your mind? Talk through a situation happening at work with Aurelia — no person record needed.",
    cue: "Immediate support",
    emphasis: "primary" as const,
  },
  {
    id: "prepare",
    title: "Prepare for a conversation",
    description:
      "Structured preparation for a conversation with someone you manage.",
    cue: "Person-specific",
    emphasis: "default" as const,
  },
  {
    id: "reflect",
    title: "Reflect on something",
    description:
      "Think through what happened and what you can learn from it.",
    cue: null,
    emphasis: "default" as const,
  },
  {
    id: "my-development",
    title: "Work on my development",
    description:
      "Continue a development focus, review actions or see progress.",
    cue: null,
    emphasis: "default" as const,
  },
  {
    id: "my-people",
    title: "Develop someone in my team",
    description: "Prepare for and support someone’s development.",
    cue: null,
    emphasis: "default" as const,
  },
  {
    id: "add-evidence",
    title: "Add my development evidence",
    description:
      "Add feedback, an assessment or a document to your own development record.",
    cue: null,
    emphasis: "default" as const,
  },
] as const;

export type ManagerFrontDoorActionId =
  (typeof MANAGER_FRONT_DOOR_ACTIONS)[number]["id"];

/**
 * Manager Home front door — need-led orientation.
 * Routes into existing Aurelia/Prepare, Reflection, My Development,
 * My People and evidence capabilities without new workflows.
 */
export function ManagerCommandCentre({
  greeting,
  coachName,
  clients = [],
  hasManagedPeople = true,
  onTalkThrough,
  onPrepareSomething,
  onReflect,
  onOpenMyDevelopment,
  onOpenPeople,
  onAddEvidence,
  onOpenPerson,
  awaitingUpdates = [],
  onReviewDevelopmentUpdate,
}: {
  greeting: string;
  coachName: string;
  /** Managed people (self-development excluded) for Needs attention. */
  clients?: Client[];
  /** False when the Manager has no managed People yet (self-dev excluded). */
  hasManagedPeople?: boolean;
  onTalkThrough: () => void;
  onPrepareSomething: () => void;
  onReflect: () => void;
  onOpenMyDevelopment: () => void;
  onOpenPeople: () => void;
  onAddEvidence: () => void;
  onOpenPerson?: (personId: string) => void;
  /** Assigned-only ready_for_review updates already loaded for Home. */
  awaitingUpdates?: readonly DevelopmentUpdateReviewTask[];
  onReviewDevelopmentUpdate?: (client: Client, updateId: string) => void;
}) {
  const organisation = useOrganisation();
  const organisationIdentity = useMemo(
    () =>
      resolveManagerHomeOrganisationIdentity(
        organisation
          ? {
              organisationName: organisation.organisation.name,
              organisationType: organisation.organisation.organisationType,
              multiOrganisation: organisation.showWorkspaceSelector,
            }
          : null
      ),
    [organisation]
  );

  const [workspace, setWorkspace] = useState<MyDevelopmentWorkspace | null>(
    null
  );
  const [continueLoaded, setContinueLoaded] = useState(false);
  const [showPrepareNeedsPerson, setShowPrepareNeedsPerson] = useState(false);

  const attentionItems = useMemo(
    () => buildManagerHomeAttentionItems(clients, awaitingUpdates),
    [clients, awaitingUpdates]
  );

  useEffect(() => {
    let cancelled = false;
    async function loadContinue() {
      try {
        const data = await apiJson<{ workspace: MyDevelopmentWorkspace }>(
          "/api/my-development/workspace"
        );
        if (!cancelled) {
          setWorkspace(data.workspace);
        }
      } catch {
        if (!cancelled) {
          setWorkspace(null);
        }
      } finally {
        if (!cancelled) {
          setContinueLoaded(true);
        }
      }
    }
    void loadContinue();
    return () => {
      cancelled = true;
    };
  }, []);

  function handlePrepare() {
    if (!hasManagedPeople) {
      setShowPrepareNeedsPerson(true);
      return;
    }
    setShowPrepareNeedsPerson(false);
    onPrepareSomething();
  }

  const handlers: Record<ManagerFrontDoorActionId, () => void> = {
    talk: () => {
      setShowPrepareNeedsPerson(false);
      onTalkThrough();
    },
    prepare: handlePrepare,
    reflect: () => {
      setShowPrepareNeedsPerson(false);
      onReflect();
    },
    "my-development": () => {
      setShowPrepareNeedsPerson(false);
      onOpenMyDevelopment();
    },
    "my-people": () => {
      setShowPrepareNeedsPerson(false);
      onOpenPeople();
    },
    "add-evidence": () => {
      setShowPrepareNeedsPerson(false);
      onAddEvidence();
    },
  };

  const focusLabel =
    workspace?.focusItems
      .map(item => item.title.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(" · ") || "";

  const nextAction =
    workspace?.actions.find(
      action => action.status === "Open" || action.status === "In progress"
    ) ?? null;

  const recentReflection = workspace?.reflections[0] ?? null;
  const evidenceCount = workspace?.maturity.totalEvidenceCount ?? 0;
  const hasContinueDetail = Boolean(
    focusLabel || nextAction || recentReflection || evidenceCount > 0
  );

  return (
    <section
      className="manager-command-centre manager-front-door identity-reveal"
      aria-labelledby="manager-front-door-title"
    >
      <header className="manager-command-centre__header manager-front-door__header">
        <p className="eyebrow">Manager home</p>
        {organisationIdentity ? (
          <p
            className="manager-front-door__organisation"
            data-testid="manager-home-organisation"
          >
            {organisationIdentity.multiOrganisation ? (
              <>
                Current organisation workspace
                <span className="manager-front-door__organisation-name">
                  {organisationIdentity.name}
                </span>
              </>
            ) : (
              <span className="manager-front-door__organisation-name">
                {organisationIdentity.name}
              </span>
            )}
          </p>
        ) : null}
        <h1 id="manager-front-door-title">
          {greeting}, {coachName}
        </h1>
        <p className="manager-front-door__orientation">
          {BRAND.companyName} supports your development through the management
          situations you face. Start with what would help you today.
        </p>
        <p className="manager-command-centre__question">
          What would help you today?
        </p>
        <p className="manager-front-door__supporting">
          Talk something through for immediate thinking support. Prepare when
          you need structured help for a conversation with someone you manage.
        </p>
        <aside
          className="manager-front-door__privacy"
          aria-label={MANAGER_HOME_PRIVACY_VISIBILITY_LABEL}
          data-testid="manager-home-privacy"
        >
          <p className="manager-front-door__privacy-label">
            {MANAGER_HOME_PRIVACY_VISIBILITY_LABEL}
          </p>
          <p className="manager-front-door__privacy-copy">
            {MANAGER_HOME_PRIVACY_VISIBILITY_COPY}
          </p>
        </aside>
      </header>

      <NeedsAttentionSection
        items={attentionItems}
        clients={clients}
        hasManagedPeople={hasManagedPeople}
        onOpenPerson={onOpenPerson}
        onReviewDevelopmentUpdate={onReviewDevelopmentUpdate}
        onOpenPeople={onOpenPeople}
      />

      <nav
        className="manager-front-door__needs"
        aria-label="What would help you today"
      >
        <ul className="manager-front-door__need-list">
          {MANAGER_FRONT_DOOR_ACTIONS.map(action => (
            <li key={action.id}>
              <button
                type="button"
                className={
                  action.emphasis === "primary"
                    ? "manager-front-door__need manager-front-door__need--primary"
                    : "manager-front-door__need"
                }
                data-front-door-action={action.id}
                onClick={handlers[action.id]}
              >
                {action.cue ? (
                  <span className="manager-front-door__need-cue">
                    {action.cue}
                  </span>
                ) : null}
                <span className="manager-front-door__need-title">
                  {action.title}
                </span>
                <span className="manager-front-door__need-description">
                  {action.description}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {showPrepareNeedsPerson ? (
        <aside
          className="manager-front-door__prepare-guidance"
          role="status"
          aria-labelledby="prepare-needs-person-title"
          data-testid="manager-prepare-needs-person"
        >
          <h2 id="prepare-needs-person-title">
            Person-specific preparation needs someone in My People
          </h2>
          <p>
            Prepare is for a conversation with someone you manage. Add them in
            My People when you are ready — nothing is created automatically.
          </p>
          <p>
            Meanwhile you can talk something through without a person record, or
            work on your own development.
          </p>
          <div className="manager-front-door__prepare-guidance-actions">
            <button
              type="button"
              className="identity-button"
              onClick={() => {
                setShowPrepareNeedsPerson(false);
                onTalkThrough();
              }}
            >
              Talk something through
            </button>
            <button
              type="button"
              className="identity-button is-secondary"
              onClick={() => {
                setShowPrepareNeedsPerson(false);
                onOpenMyDevelopment();
              }}
            >
              Open My Development
            </button>
            <button
              type="button"
              className="identity-button is-secondary"
              onClick={() => {
                setShowPrepareNeedsPerson(false);
                onOpenPeople();
              }}
            >
              Go to My People
            </button>
          </div>
        </aside>
      ) : null}

      <section
        className="manager-command-centre__panel manager-front-door__continue"
        aria-labelledby="continue-development-title"
      >
        <h2 id="continue-development-title">Continue your development</h2>
        <p className="manager-front-door__continue-intro">
          Connect today’s support with your longer-term development picture.
        </p>

        {!continueLoaded ? (
          <p className="muted">Loading your development picture…</p>
        ) : null}

        {continueLoaded && !hasContinueDetail ? (
          <p className="muted">
            No development focus, actions or evidence to show yet. Open My
            Development when you are ready to build your picture.
          </p>
        ) : null}

        {continueLoaded && hasContinueDetail ? (
          <dl className="manager-front-door__continue-facts">
            {focusLabel ? (
              <div>
                <dt>Current focus</dt>
                <dd>{focusLabel}</dd>
              </div>
            ) : null}
            {nextAction ? (
              <div>
                <dt>Next action</dt>
                <dd>{nextAction.title}</dd>
              </div>
            ) : null}
            {recentReflection ? (
              <div>
                <dt>Recent reflection</dt>
                <dd>
                  {recentReflection.title}
                  {recentReflection.preview
                    ? ` — ${recentReflection.preview}`
                    : ""}
                </dd>
              </div>
            ) : null}
            {evidenceCount > 0 ? (
              <div>
                <dt>Development evidence</dt>
                <dd>
                  {evidenceCount} item{evidenceCount === 1 ? "" : "s"}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <div className="manager-front-door__continue-actions">
          <button
            type="button"
            className="identity-button is-secondary"
            onClick={onOpenMyDevelopment}
          >
            View My Development
          </button>
        </div>
      </section>
    </section>
  );
}

function NeedsAttentionSection({
  items,
  clients,
  hasManagedPeople,
  onOpenPerson,
  onReviewDevelopmentUpdate,
  onOpenPeople,
}: {
  items: ManagerHomeAttentionItem[];
  clients: Client[];
  hasManagedPeople: boolean;
  onOpenPerson?: (personId: string) => void;
  onReviewDevelopmentUpdate?: (client: Client, updateId: string) => void;
  onOpenPeople: () => void;
}) {
  return (
    <section
      className="manager-front-door__attention"
      aria-labelledby="manager-needs-attention-title"
      data-testid="manager-needs-attention"
    >
      <h2 id="manager-needs-attention-title">Needs attention</h2>
      <p className="manager-front-door__attention-intro">
        Who or what needs your attention?
      </p>

      {!hasManagedPeople ? (
        <p className="muted" data-testid="manager-needs-attention-empty">
          Add someone in My People when you are ready. Until then, you can talk
          something through or work on your own development.
        </p>
      ) : null}

      {hasManagedPeople && items.length === 0 ? (
        <p className="muted" data-testid="manager-needs-attention-empty">
          Nothing needs your attention right now.
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="manager-front-door__attention-list">
          {items.map(item => (
            <li key={item.personId}>
              <button
                type="button"
                className="manager-front-door__attention-item"
                data-testid="manager-needs-attention-item"
                onClick={() => {
                  if (item.updateId && onReviewDevelopmentUpdate) {
                    const person = clients.find(
                      client => client.id === item.personId
                    );
                    if (person) {
                      onReviewDevelopmentUpdate(person, item.updateId);
                      return;
                    }
                  }
                  onOpenPerson?.(item.personId);
                }}
              >
                <span className="manager-front-door__attention-person">
                  {item.personName}
                </span>
                <span className="manager-front-door__attention-action">
                  {item.nextActionLabel}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {hasManagedPeople ? (
        <button
          type="button"
          className="identity-text-action manager-front-door__attention-all"
          onClick={onOpenPeople}
        >
          View all people
        </button>
      ) : null}
    </section>
  );
}
