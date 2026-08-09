"use client";

import { useCallback, useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import { apiJson, errorMessage } from "@/lib/api-client";
import type { MyDevelopmentWorkspace } from "@/lib/my-development/workspace";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import { resolveProductLanguage } from "@/lib/role-language";
import type { ActionStatus, CoachingAction } from "@/lib/types";

const FOCUS_SUGGESTIONS = [
  "Delegation",
  "Difficult conversations",
  "Confidence",
  "Strategic thinking",
  "Team performance",
  "Coaching skills",
];

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  analysing: "Analysing",
  ready: "Ready",
  needs_attention: "Needs attention",
};

/**
 * Manager My Development overview — focus, reflection, strengths signals,
 * actions, evidence and intelligence entry points for the current organisation.
 */
export function MyDevelopmentView({
  onOpenPeople,
  onSwitchToPersonal,
  onOpenTeamIntelligence,
  onOpenPersonalEvidence,
  onOpenPersonalIntelligence,
  onOpenPersonalReflection,
  isPersonalWorkspace,
  evidenceError = "",
}: {
  onOpenPeople: () => void;
  onSwitchToPersonal?: () => void;
  onOpenTeamIntelligence?: () => void;
  onOpenPersonalEvidence?: () => void;
  onOpenPersonalIntelligence?: () => void;
  onOpenPersonalReflection?: () => void;
  isPersonalWorkspace: boolean;
  evidenceError?: string;
}) {
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);
  const [workspace, setWorkspace] = useState<MyDevelopmentWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [focusDraft, setFocusDraft] = useState("");
  const [focusItems, setFocusItems] = useState<string[]>([]);
  const [focusBusy, setFocusBusy] = useState(false);
  const [actionTitle, setActionTitle] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [editingFocus, setEditingFocus] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiJson<{ workspace: MyDevelopmentWorkspace }>(
        "/api/my-development/workspace"
      );
      setWorkspace(data.workspace);
      setFocusItems(data.workspace.focusItems.map(item => item.title));
    } catch (err) {
      setError(errorMessage(err, "Unable to load My Development."));
    } finally {
      setLoading(false);
    }
  }, []);

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
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to add action."));
    } finally {
      setActionBusy(false);
    }
  }

  const maturity = workspace?.maturity;
  const isEmpty = maturity?.isEmpty ?? !loading;

  return (
    <section className="page identity-reveal">
      <div className="page-heading">
        <p className="eyebrow">{language.myDevelopmentLabel}</p>
        <h1>My Development</h1>
        <p>
          Build a clearer picture of how you lead, what you&apos;re developing and
          what you&apos;re learning over time — separate from the people you manage
          or support. Your record contributes never to people you manage.
        </p>
      </div>

      {evidenceError || error ? (
        <div className="inline-error" role="alert">
          <p>{evidenceError || error}</p>
        </div>
      ) : null}

      <nav className="person-development-subnav" aria-label="My development sections">
        <span className="person-development-subnav__item is-active">Overview</span>
        <button
          type="button"
          className="person-development-subnav__item"
          onClick={onOpenPersonalReflection}
        >
          Reflection
        </button>
        <button
          type="button"
          className="person-development-subnav__item"
          onClick={onOpenPersonalEvidence}
        >
          Evidence
        </button>
        <button
          type="button"
          className="person-development-subnav__item"
          onClick={onOpenPersonalIntelligence}
        >
          Development Intelligence
        </button>
      </nav>

      {loading ? <p className="muted">Loading your development picture…</p> : null}

      {!loading && isEmpty ? (
        <section className="panel" style={{ marginBottom: "1.5rem" }}>
          <p className="card-label">Get started</p>
          <h2 className="identity-subheading">Build your development picture</h2>
          <p className="muted">
            Start with any of these. You do not need to upload evidence first.
          </p>
          <div className="button-row">
            <button
              type="button"
              className="primary"
              onClick={() => setEditingFocus(true)}
            >
              Set a development focus
            </button>
            <button
              type="button"
              className="secondary"
              onClick={onOpenPersonalReflection}
            >
              Reflect on my development
            </button>
            <button
              type="button"
              className="secondary"
              onClick={onOpenPersonalEvidence}
            >
              Add evidence
            </button>
          </div>
        </section>
      ) : null}

      {!loading && maturity && !isEmpty ? (
        <section className="panel" style={{ marginBottom: "1.5rem" }}>
          <p className="card-label">Development Intelligence</p>
          <h2 className="identity-subheading">{maturity.headline}</h2>
          <p className="muted">{maturity.supportCopy}</p>
          <p className="muted">
            Confidence: {maturity.confidenceLabel}
            {maturity.includedSourceCount > 0
              ? ` · ${maturity.includedSourceCount} included source${
                  maturity.includedSourceCount === 1 ? "" : "s"
                }`
              : null}
          </p>
          <div className="button-row">
            <button
              type="button"
              className="primary"
              onClick={onOpenPersonalIntelligence}
            >
              View development intelligence
            </button>
          </div>
        </section>
      ) : null}

      <div className="two-grid">
        <article className="panel">
          <p className="card-label">Current development focus</p>
          <h2 className="identity-subheading">What are you working on?</h2>
          {focusItems.length === 0 && !editingFocus ? (
            <p className="muted">No development priorities set yet.</p>
          ) : (
            <ul className="development-evidence-list">
              {focusItems.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {editingFocus ? (
            <>
              <label className="field">
                <span>Add a priority</span>
                <input
                  value={focusDraft}
                  onChange={event => setFocusDraft(event.target.value)}
                  placeholder="e.g. Delegation"
                />
              </label>
              <div className="button-row">
                {FOCUS_SUGGESTIONS.map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    className="secondary"
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
              <div className="button-row">
                <button
                  type="button"
                  className="secondary"
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
                  className="primary"
                  disabled={focusBusy}
                  onClick={() => void saveFocus(focusItems)}
                >
                  Save focus
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setEditingFocus(false);
                    setFocusItems(workspace?.focusItems.map(i => i.title) ?? []);
                  }}
                >
                  Cancel
                </button>
              </div>
              {focusItems.length > 0 ? (
                <div className="button-row">
                  {focusItems.map(item => (
                    <button
                      key={item}
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setFocusItems(current => current.filter(value => value !== item))
                      }
                    >
                      Remove {item}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="button-row">
              <button
                type="button"
                className="primary"
                onClick={() => setEditingFocus(true)}
              >
                {focusItems.length ? "Edit focus" : "Set a development focus"}
              </button>
            </div>
          )}
        </article>

        <article className="panel">
          <p className="card-label">Reflection</p>
          <h2 className="identity-subheading">Reflect on my development</h2>
          <p className="muted">
            Capture what happened and what you are learning — as many dated
            reflections as you need over time.
          </p>
          {workspace && workspace.reflections.length > 0 ? (
            <p className="muted">
              {workspace.reflections.length} reflection
              {workspace.reflections.length === 1 ? "" : "s"} recorded.
            </p>
          ) : (
            <p className="muted">No reflections yet.</p>
          )}
          <div className="button-row">
            <button
              type="button"
              className="primary"
              onClick={onOpenPersonalReflection}
            >
              Reflect on my development
            </button>
          </div>
        </article>

        <article className="panel">
          <p className="card-label">Actions</p>
          <h2 className="identity-subheading">What will you practise?</h2>
          {workspace && workspace.actions.length > 0 ? (
            <ul className="development-evidence-list">
              {workspace.actions.slice(0, 5).map(action => (
                <li key={action.id}>
                  <strong>{action.title}</strong>
                  <span className="muted">
                    {" "}
                    — {action.status}
                    {action.due ? ` · due ${action.due}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No actions yet.</p>
          )}
          <label className="field">
            <span>Add an action</span>
            <input
              value={actionTitle}
              onChange={event => setActionTitle(event.target.value)}
              placeholder="e.g. Practise a clearer ask when delegating"
            />
          </label>
          <div className="button-row">
            <button
              type="button"
              className="primary"
              disabled={actionBusy || !actionTitle.trim() || !workspace}
              onClick={() => void addAction()}
            >
              Add action
            </button>
          </div>
        </article>

        <article className="panel">
          <p className="card-label">Evidence</p>
          <h2 className="identity-subheading">Inputs to your picture</h2>
          <p className="muted">
            Assessments, feedback and documents feed Development Intelligence —
            they are not the intelligence itself.
          </p>
          {workspace && workspace.evidence.length > 0 ? (
            <ul className="development-evidence-list">
              {workspace.evidence.slice(0, 5).map(item => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span className="muted">
                    {" "}
                    — {STATUS_LABEL[item.statusBucket] ?? item.statusBucket}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No evidence added yet.</p>
          )}
          <div className="button-row">
            <button
              type="button"
              className="primary"
              onClick={onOpenPersonalEvidence}
            >
              Add evidence
            </button>
          </div>
        </article>
      </div>

      {workspace && workspace.intelligencePatterns.length > 0 ? (
        <section className="panel" style={{ marginTop: "1.5rem" }}>
          <p className="card-label">Emerging from reflections</p>
          <h2 className="identity-subheading">Themes appearing over time</h2>
          <ul className="development-evidence-list">
            {workspace.intelligencePatterns.slice(0, 5).map(pattern => (
              <li key={`${pattern.theme}-${pattern.occurrenceCount}`}>
                {pattern.statement}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel" style={{ marginTop: "1.5rem" }}>
        <p className="card-label">{language.myPeopleLabel}</p>
        <h2 className="identity-subheading">Develop others</h2>
        <p className="muted">
          {BRAND.intelligenceName} helps you prepare and interpret development
          for the people you support — without mixing their records into your own.
        </p>
        <div className="button-row">
          <button type="button" className="secondary" onClick={onOpenPeople}>
            View {language.myPeopleLabel.toLowerCase()}
          </button>
          {onOpenTeamIntelligence ? (
            <button
              type="button"
              className="secondary"
              onClick={onOpenTeamIntelligence}
            >
              Team Intelligence
            </button>
          ) : null}
          {!isPersonalWorkspace && onSwitchToPersonal ? (
            <button type="button" className="secondary" onClick={onSwitchToPersonal}>
              Open personal workspace
            </button>
          ) : null}
        </div>
      </section>
    </section>
  );
}
