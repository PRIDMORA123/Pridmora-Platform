"use client";

import { useCallback, useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import { apiJson, errorMessage } from "@/lib/api-client";
import { MyDevelopmentSubnav } from "@/components/my-development-subnav";
import {
  buildCompletedActionReflectionContext,
  listCompletedDevelopmentActions,
} from "@/lib/my-development/self-action";
import {
  listActiveDevelopmentActions,
  resolveMyDevelopmentNextStep,
} from "@/lib/my-development/next-step";
import type { MyDevelopmentWorkspace } from "@/lib/my-development/workspace";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import { resolveProductLanguage } from "@/lib/role-language";
import type { ActionStatus, CoachingAction } from "@/lib/types";

export type MyDevelopmentReflectionPrefill = {
  context: string;
  title?: string;
};

const FOCUS_SUGGESTIONS = [
  "Delegation",
  "Difficult conversations",
  "Confidence",
  "Strategic thinking",
  "Team performance",
  "Coaching skills",
];

/**
 * Manager My Development overview — one coherent development story for the
 * current organisation (Stage 2.3.1 presentation hierarchy).
 */
export function MyDevelopmentView({
  onOpenPersonalEvidence,
  onOpenPersonalIntelligence,
  onOpenPersonalReflection,
  onReflectAfterComplete,
  onTalkThrough,
  evidenceError = "",
}: {
  onOpenPersonalEvidence?: () => void;
  onOpenPersonalIntelligence?: () => void;
  onOpenPersonalReflection?: () => void;
  onReflectAfterComplete?: (prefill: MyDevelopmentReflectionPrefill) => void;
  onTalkThrough?: () => void;
  evidenceError?: string;
}) {
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);
  const [workspace, setWorkspace] = useState<MyDevelopmentWorkspace | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [focusDraft, setFocusDraft] = useState("");
  const [focusItems, setFocusItems] = useState<string[]>([]);
  const [focusBusy, setFocusBusy] = useState(false);
  const [actionTitle, setActionTitle] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [editingFocus, setEditingFocus] = useState(false);
  const [addingAction, setAddingAction] = useState(false);
  const [lifecycleBusyId, setLifecycleBusyId] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [completionPrompt, setCompletionPrompt] = useState<{
    title: string;
  } | null>(null);
  const [reloadWarning, setReloadWarning] = useState("");

  const applyWorkspace = useCallback((next: MyDevelopmentWorkspace) => {
    setWorkspace(next);
    setFocusItems(next.focusItems.map(item => item.title));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setReloadWarning("");
    try {
      const data = await apiJson<{ workspace: MyDevelopmentWorkspace }>(
        "/api/my-development/workspace"
      );
      applyWorkspace(data.workspace);
    } catch (err) {
      setError(errorMessage(err, "Unable to load My Development."));
    } finally {
      setLoading(false);
    }
  }, [applyWorkspace]);

  const reloadQuiet = useCallback(async () => {
    const data = await apiJson<{ workspace: MyDevelopmentWorkspace }>(
      "/api/my-development/workspace"
    );
    applyWorkspace(data.workspace);
  }, [applyWorkspace]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveFocus(next: string[]) {
    setFocusBusy(true);
    setError("");
    try {
      const data = await apiJson<{ workspace: MyDevelopmentWorkspace }>(
        "/api/my-development/focus",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priorities: next }),
        }
      );
      setWorkspace(data.workspace);
      setFocusItems(data.workspace.focusItems.map(item => item.title));
      setEditingFocus(false);
      setFocusDraft("");
    } catch (err) {
      setError(errorMessage(err, "Unable to save development focus."));
    } finally {
      setFocusBusy(false);
    }
  }

  async function addAction() {
    if (!workspace?.client.id || !actionTitle.trim()) return;
    setActionBusy(true);
    setError("");
    try {
      await apiJson<{ action: CoachingAction }>("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: {
            clientId: workspace.client.id,
            title: actionTitle.trim(),
            status: "Open" satisfies ActionStatus,
          },
        }),
      });
      setActionTitle("");
      setAddingAction(false);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to add action."));
    } finally {
      setActionBusy(false);
    }
  }

  async function completeAction(action: CoachingAction) {
    if (lifecycleBusyId) return;
    setLifecycleBusyId(action.id);
    setError("");
    setReloadWarning("");
    try {
      await apiJson(`/api/my-development/actions/${action.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "complete" }),
      });
      setCompletionPrompt({ title: action.title });
      try {
        await reloadQuiet();
      } catch {
        setReloadWarning(
          "Action completed, but unable to refresh your development picture. Please reload the page."
        );
      }
    } catch (err) {
      setCompletionPrompt(null);
      setError(errorMessage(err, "Unable to mark this action complete."));
    } finally {
      setLifecycleBusyId("");
    }
  }

  async function reopenAction(action: CoachingAction) {
    if (lifecycleBusyId) return;
    setLifecycleBusyId(action.id);
    setError("");
    setReloadWarning("");
    try {
      await apiJson(`/api/my-development/actions/${action.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "reopen" }),
      });
      try {
        await reloadQuiet();
      } catch {
        setReloadWarning(
          "Action reopened, but unable to refresh your development picture. Please reload the page."
        );
      }
    } catch (err) {
      setError(errorMessage(err, "Unable to reopen this action."));
    } finally {
      setLifecycleBusyId("");
    }
  }

  const maturity = workspace?.maturity;
  const isEmpty = maturity?.isEmpty ?? !loading;
  const primaryFocus = focusItems[0] ?? "";
  const secondaryFocuses = focusItems.slice(1);
  const activeActions = workspace
    ? listActiveDevelopmentActions(workspace.actions, 3)
    : [];
  const completedActions = workspace
    ? listCompletedDevelopmentActions(workspace.actions, 3)
    : [];
  const completedActionCount =
    workspace?.actions.filter(action => action.status === "Complete").length ??
    0;
  const latestReflection = workspace?.reflections[0] ?? null;
  const nextStep = resolveMyDevelopmentNextStep({
    focusCount: focusItems.length,
    actions: workspace?.actions ?? [],
  });
  const showNoticing =
    Boolean(maturity) &&
    !isEmpty &&
    ((maturity?.includedSourceCount ?? 0) > 0 ||
      (workspace?.intelligencePatterns.length ?? 0) > 0);

  return (
    <section className="page identity-reveal my-dev-story">
      <div className="page-heading my-dev-story__intro">
        <p className="eyebrow">{language.myDevelopmentLabel}</p>
        <h1>My Development</h1>
        <p>
          Your own space to develop how you lead — kept separate from the people
          you manage.
        </p>
      </div>

      {evidenceError || error ? (
        <div className="inline-error" role="alert">
          <p>{evidenceError || error}</p>
        </div>
      ) : null}

      {reloadWarning ? (
        <div className="inline-error" role="status">
          <p>{reloadWarning}</p>
        </div>
      ) : null}

      <MyDevelopmentSubnav
        active="overview"
        onOpenOverview={() => undefined}
        onOpenReflection={() => onOpenPersonalReflection?.()}
        onOpenEvidence={() => onOpenPersonalEvidence?.()}
        onOpenIntelligence={() => onOpenPersonalIntelligence?.()}
      />

      {loading ? (
        <p className="muted">Loading your development picture…</p>
      ) : null}

      {!loading ? (
        <div className="my-dev-story__flow">
          <section
            className="my-dev-story__section my-dev-story__section--focus"
            aria-labelledby="my-dev-focus-heading"
          >
            <p className="my-dev-story__label">Your focus</p>
            <h2 id="my-dev-focus-heading" className="my-dev-story__heading">
              What are you working on?
            </h2>

            {focusItems.length === 0 && !editingFocus ? (
              <>
                <p className="my-dev-story__empty">
                  Start by choosing what you want to develop.
                </p>
                <div className="my-dev-story__actions">
                  <button
                    type="button"
                    className="identity-button is-primary"
                    onClick={() => setEditingFocus(true)}
                  >
                    Set your development focus
                  </button>
                </div>
                {isEmpty ? (
                  <p className="my-dev-story__support muted">
                    {BRAND.companyName} will help you turn that focus into
                    practice and learning over time.
                  </p>
                ) : null}
              </>
            ) : null}

            {focusItems.length > 0 && !editingFocus ? (
              <>
                <p className="my-dev-story__primary-focus">{primaryFocus}</p>
                {secondaryFocuses.length > 0 ? (
                  <ul className="my-dev-story__secondary-list">
                    {secondaryFocuses.map(item => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="my-dev-story__actions">
                  <button
                    type="button"
                    className="identity-button is-quiet"
                    onClick={() => setEditingFocus(true)}
                  >
                    Edit focus
                  </button>
                </div>
              </>
            ) : null}

            {editingFocus ? (
              <div className="my-dev-story__edit">
                <label className="field">
                  <span>Add a priority</span>
                  <input
                    value={focusDraft}
                    onChange={event => setFocusDraft(event.target.value)}
                    placeholder="e.g. Delegation"
                  />
                </label>
                <div className="my-dev-story__suggestions">
                  {FOCUS_SUGGESTIONS.map(suggestion => (
                    <button
                      key={suggestion}
                      type="button"
                      className="identity-button is-secondary is-sm"
                      disabled={focusItems.includes(suggestion)}
                      onClick={() => {
                        if (!focusItems.includes(suggestion)) {
                          setFocusItems(current => [...current, suggestion]);
                        }
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                {focusItems.length > 0 ? (
                  <ul className="my-dev-story__edit-list">
                    {focusItems.map(item => (
                      <li key={item}>
                        <span>{item}</span>
                        <button
                          type="button"
                          className="identity-text-action"
                          onClick={() =>
                            setFocusItems(current =>
                              current.filter(value => value !== item)
                            )
                          }
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="my-dev-story__actions">
                  <button
                    type="button"
                    className="identity-button is-secondary"
                    disabled={!focusDraft.trim()}
                    onClick={() => {
                      const next = focusDraft.trim();
                      if (!next || focusItems.includes(next)) return;
                      setFocusItems(current => [...current, next]);
                      setFocusDraft("");
                    }}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    className="identity-button is-primary"
                    disabled={focusBusy}
                    onClick={() => void saveFocus(focusItems)}
                  >
                    Save focus
                  </button>
                  <button
                    type="button"
                    className="identity-button is-quiet"
                    onClick={() => {
                      setEditingFocus(false);
                      setFocusItems(
                        workspace?.focusItems.map(item => item.title) ?? []
                      );
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          {!isEmpty ? (
            <>
              <section
                className="my-dev-story__section"
                aria-labelledby="my-dev-practising-heading"
              >
                <p className="my-dev-story__label">What you&apos;re practising</p>
                <h2
                  id="my-dev-practising-heading"
                  className="my-dev-story__heading"
                >
                  The things you&apos;re actively trying or changing
                </h2>

                {activeActions.length > 0 ? (
                  <ul className="my-dev-story__practice-list">
                    {activeActions.map(action => (
                      <li key={action.id} className="my-dev-story__practice-item">
                        <div className="my-dev-story__practice-copy">
                          <span className="my-dev-story__practice-title">
                            {action.title}
                          </span>
                          <span className="muted">
                            {action.status}
                            {action.due ? ` · due ${action.due}` : ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="identity-button is-quiet is-sm my-dev-story__mark-complete"
                          disabled={Boolean(lifecycleBusyId)}
                          aria-busy={lifecycleBusyId === action.id}
                          onClick={() => void completeAction(action)}
                        >
                          {lifecycleBusyId === action.id
                            ? "Saving…"
                            : "Mark complete"}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="my-dev-story__empty muted">
                    No active practice yet. When you are ready, add something
                    small to try.
                  </p>
                )}

                {completionPrompt ? (
                  <div
                    className="my-dev-story__completion-prompt"
                    role="status"
                    data-testid="my-dev-completion-prompt"
                  >
                    <p className="my-dev-story__completion-title">
                      Action completed.
                    </p>
                    <p className="my-dev-story__completion-question">
                      What did you notice?
                    </p>
                    <div className="my-dev-story__actions">
                      <button
                        type="button"
                        className="identity-button is-primary"
                        onClick={() => {
                          const prefill: MyDevelopmentReflectionPrefill = {
                            context: buildCompletedActionReflectionContext(
                              completionPrompt.title
                            ),
                          };
                          setCompletionPrompt(null);
                          onReflectAfterComplete?.(prefill);
                        }}
                      >
                        Reflect now
                      </button>
                      <button
                        type="button"
                        className="identity-button is-quiet"
                        onClick={() => setCompletionPrompt(null)}
                      >
                        Not now
                      </button>
                    </div>
                  </div>
                ) : null}

                {completedActionCount > 0 ? (
                  <div className="my-dev-story__completed">
                    <button
                      type="button"
                      className="identity-text-action"
                      aria-expanded={showCompleted}
                      onClick={() => setShowCompleted(current => !current)}
                    >
                      {completedActionCount} completed
                      {completedActionCount === 1 ? " action" : " actions"}
                      {showCompleted ? " — hide" : " — show recent"}
                    </button>
                    {showCompleted ? (
                      <ul className="my-dev-story__completed-list">
                        {completedActions.map(action => (
                          <li key={action.id}>
                            <span>{action.title}</span>
                            <button
                              type="button"
                              className="identity-button is-quiet is-sm"
                              disabled={Boolean(lifecycleBusyId)}
                              aria-busy={lifecycleBusyId === action.id}
                              onClick={() => void reopenAction(action)}
                            >
                              {lifecycleBusyId === action.id
                                ? "Saving…"
                                : "Reopen"}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                {addingAction ? (
                  <div className="my-dev-story__edit">
                    <label className="field">
                      <span>Add something to practise</span>
                      <input
                        value={actionTitle}
                        onChange={event => setActionTitle(event.target.value)}
                        placeholder="e.g. Practise a clearer ask when delegating"
                      />
                    </label>
                    <div className="my-dev-story__actions">
                      <button
                        type="button"
                        className="identity-button is-secondary"
                        disabled={
                          actionBusy || !actionTitle.trim() || !workspace
                        }
                        onClick={() => void addAction()}
                      >
                        Add action
                      </button>
                      <button
                        type="button"
                        className="identity-button is-quiet"
                        disabled={actionBusy}
                        onClick={() => {
                          setAddingAction(false);
                          setActionTitle("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="my-dev-story__actions">
                    <button
                      type="button"
                      className="identity-button is-quiet"
                      onClick={() => setAddingAction(true)}
                    >
                      Add something to practise
                    </button>
                  </div>
                )}
              </section>

              <section
                className="my-dev-story__section"
                aria-labelledby="my-dev-learning-heading"
              >
                <p className="my-dev-story__label">What you&apos;re learning</p>
                <h2
                  id="my-dev-learning-heading"
                  className="my-dev-story__heading"
                >
                  Recent reflection
                </h2>

                {latestReflection ? (
                  <article className="my-dev-story__learning">
                    <h3 className="my-dev-story__learning-title">
                      {latestReflection.title}
                    </h3>
                    <p className="my-dev-story__learning-date muted">
                      {latestReflection.evidenceDate ||
                        latestReflection.capturedAt.slice(0, 10)}
                    </p>
                    {latestReflection.whatNoticed ||
                    latestReflection.practiseNext ? (
                      <>
                        {latestReflection.whatNoticed ? (
                          <div className="my-dev-story__learning-block">
                            <p className="my-dev-story__learning-label">
                              What I noticed
                            </p>
                            <p className="my-dev-story__learning-preview">
                              {latestReflection.whatNoticed}
                            </p>
                          </div>
                        ) : null}
                        {latestReflection.practiseNext ? (
                          <div className="my-dev-story__learning-block">
                            <p className="my-dev-story__learning-label">
                              What I&apos;ll practise next
                            </p>
                            <p className="my-dev-story__learning-preview">
                              {latestReflection.practiseNext}
                            </p>
                          </div>
                        ) : null}
                      </>
                    ) : latestReflection.preview ? (
                      <p className="my-dev-story__learning-preview">
                        {latestReflection.preview}
                      </p>
                    ) : null}
                  </article>
                ) : (
                  <p className="my-dev-story__empty muted">
                    No reflections yet. A short reflection is often the clearest
                    way to notice what you are learning.
                  </p>
                )}

                <div className="my-dev-story__actions">
                  <button
                    type="button"
                    className="identity-text-action"
                    onClick={onOpenPersonalReflection}
                  >
                    See reflections
                  </button>
                </div>
              </section>

              <section
                className="my-dev-story__section my-dev-story__section--next"
                aria-labelledby="my-dev-next-heading"
              >
                <p className="my-dev-story__label">Your next step</p>
                <h2 id="my-dev-next-heading" className="my-dev-story__heading">
                  What to pay attention to now
                </h2>

                {nextStep.kind === "action" ? (
                  <>
                    <p className="my-dev-story__next-emphasis">
                      {nextStep.action.title}
                    </p>
                    <p className="muted">
                      Keep practising this until it feels more natural.
                      {nextStep.action.due
                        ? ` Due ${nextStep.action.due}.`
                        : ""}
                    </p>
                  </>
                ) : null}

                {nextStep.kind === "reflect-or-talk" ? (
                  <>
                    <p className="my-dev-story__empty">
                      You have a focus. Capture what you are noticing, or talk
                      something through.
                    </p>
                    <div className="my-dev-story__actions">
                      <button
                        type="button"
                        className="identity-button is-primary"
                        onClick={onOpenPersonalReflection}
                      >
                        Reflect on something
                      </button>
                      {onTalkThrough ? (
                        <button
                          type="button"
                          className="identity-text-action"
                          onClick={onTalkThrough}
                        >
                          Talk something through
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : null}

                {nextStep.kind === "set-focus" ? (
                  <>
                    <p className="my-dev-story__empty">
                      Set a development focus to give this space a clear
                      direction.
                    </p>
                    <div className="my-dev-story__actions">
                      <button
                        type="button"
                        className="identity-button is-primary"
                        onClick={() => setEditingFocus(true)}
                      >
                        Set your development focus
                      </button>
                    </div>
                  </>
                ) : null}
              </section>

              {showNoticing && maturity ? (
                <section
                  className="my-dev-story__section my-dev-story__section--noticing"
                  aria-labelledby="my-dev-noticing-heading"
                >
                  <p className="my-dev-story__label">
                    What {BRAND.companyName} is noticing
                  </p>
                  <h2
                    id="my-dev-noticing-heading"
                    className="my-dev-story__heading"
                  >
                    {maturity.headline}
                  </h2>
                  <p className="muted">
                    Evidence before certainty — treat this as emerging, not
                    complete. Observations strengthen as your reflections and
                    evidence develop.
                  </p>
                  {workspace && workspace.intelligencePatterns.length > 0 ? (
                    <p className="my-dev-story__pattern">
                      {workspace.intelligencePatterns[0]?.statement}
                    </p>
                  ) : null}
                  <div className="my-dev-story__actions">
                    <button
                      type="button"
                      className="identity-text-action"
                      onClick={onOpenPersonalIntelligence}
                    >
                      Explore Development Intelligence
                    </button>
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
