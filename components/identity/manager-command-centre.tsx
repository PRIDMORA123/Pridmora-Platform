"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";
import { BRAND } from "@/lib/brand";
import type { MyDevelopmentWorkspace } from "@/lib/my-development/workspace";

export const MANAGER_FRONT_DOOR_ACTIONS = [
  {
    id: "talk",
    title: "Talk something through",
    description:
      "Get coaching support with a situation, decision or challenge.",
  },
  {
    id: "prepare",
    title: "Prepare for something",
    description:
      "Get ready for a conversation, meeting or management situation.",
  },
  {
    id: "reflect",
    title: "Reflect on something",
    description:
      "Think through what happened and what you can learn from it.",
  },
  {
    id: "my-development",
    title: "Work on my development",
    description:
      "Continue a development focus, review actions or see progress.",
  },
  {
    id: "my-people",
    title: "Develop someone in my team",
    description: "Prepare for and support someone’s development.",
  },
  {
    id: "add-evidence",
    title: "Add evidence",
    description:
      "Add feedback, an assessment, document or other development evidence.",
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
  onTalkThrough,
  onPrepareSomething,
  onReflect,
  onOpenMyDevelopment,
  onOpenPeople,
  onAddEvidence,
}: {
  greeting: string;
  coachName: string;
  onTalkThrough: () => void;
  onPrepareSomething: () => void;
  onReflect: () => void;
  onOpenMyDevelopment: () => void;
  onOpenPeople: () => void;
  onAddEvidence: () => void;
}) {
  const [workspace, setWorkspace] = useState<MyDevelopmentWorkspace | null>(
    null
  );
  const [continueLoaded, setContinueLoaded] = useState(false);

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

  const handlers: Record<ManagerFrontDoorActionId, () => void> = {
    talk: onTalkThrough,
    prepare: onPrepareSomething,
    reflect: onReflect,
    "my-development": onOpenMyDevelopment,
    "my-people": onOpenPeople,
    "add-evidence": onAddEvidence,
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
          Choose what you need and {BRAND.companyName} will help you take the
          next step.
        </p>
      </header>

      <nav
        className="manager-front-door__needs"
        aria-label="What would help you today"
      >
        <ul className="manager-front-door__need-list">
          {MANAGER_FRONT_DOOR_ACTIONS.map(action => (
            <li key={action.id}>
              <button
                type="button"
                className="manager-front-door__need"
                data-front-door-action={action.id}
                onClick={handlers[action.id]}
              >
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
                <dt>Evidence in portfolio</dt>
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
