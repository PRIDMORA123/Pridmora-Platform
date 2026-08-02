"use client";

import { useState } from "react";
import type { SupportingContextItem } from "@/lib/relationship-meta";
import {
  SUPPORTING_CONTEXT_SOURCE_LABELS,
  type SupportingContextSourceType,
} from "@/lib/relationship-meta";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ctx-${Date.now()}`;
}

export function SupportingContextSection({
  items = [],
  disabled = false,
  onSave,
}: {
  items?: SupportingContextItem[];
  disabled?: boolean;
  onSave: (next: SupportingContextItem[]) => Promise<void>;
}) {
  /* Quiet disclosure — do not compete with Development Snapshot */
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({
    title: "",
    sourceType: "other" as SupportingContextSourceType,
    sourceDate: "",
    summary: "",
    useForAiPreparation: false,
  });

  async function handleAdd() {
    const title = draft.title.trim();
    if (!title) {
      setError("Add a title for this context item.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const next: SupportingContextItem[] = [
        ...items,
        {
          id: newId(),
          title,
          sourceType: draft.sourceType,
          sourceDate: draft.sourceDate,
          summary: draft.summary.trim(),
          useForAiPreparation: draft.useForAiPreparation,
          documentUrl: null,
          documentName: null,
        },
      ];
      await onSave(next);
      setDraft({
        title: "",
        sourceType: "other",
        sourceDate: "",
        summary: "",
        useForAiPreparation: false,
      });
      setAdding(false);
      setOpen(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save supporting context."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleAi(itemId: string, useForAiPreparation: boolean) {
    setSaving(true);
    setError("");
    try {
      await onSave(
        items.map(item =>
          item.id === itemId ? { ...item, useForAiPreparation } : item
        )
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update AI preference."
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(itemId: string) {
    setSaving(true);
    setError("");
    try {
      await onSave(items.filter(item => item.id !== itemId));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to remove context item."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="supporting-context-section"
      aria-labelledby="supporting-context-heading"
    >
      <header className="relationship-journey-section__header">
        <div>
          <p className="journey-eyebrow">Optional</p>
          <h2 id="supporting-context-heading">Supporting context</h2>
          <p>Optional information that may help personalise the coaching.</p>
        </div>
      </header>

      {items.length === 0 && !adding ? (
        <button
          type="button"
          className="identity-text-action"
          disabled={disabled}
          onClick={() => {
            setOpen(true);
            setAdding(true);
          }}
        >
          Add supporting context
        </button>
      ) : (
        <>
          <button
            type="button"
            className="identity-text-action"
            aria-expanded={open}
            onClick={() => setOpen(value => !value)}
          >
            {open
              ? "Hide supporting context"
              : `View supporting context (${items.length})`}
          </button>

          {open ? (
            <div className="supporting-context-list">
              {items.map(item => (
                <article key={item.id} className="supporting-context-item">
                  <header>
                    <h3>{item.title}</h3>
                    <p className="muted small">
                      {SUPPORTING_CONTEXT_SOURCE_LABELS[item.sourceType]}
                      {item.sourceDate ? ` · ${item.sourceDate}` : ""}
                    </p>
                  </header>
                  {item.summary.trim() ? <p>{item.summary}</p> : null}
                  {item.documentUrl ? (
                    <p>
                      <a href={item.documentUrl} target="_blank" rel="noreferrer">
                        {item.documentName || "View document"}
                      </a>
                    </p>
                  ) : null}
                  <label className="supporting-context-ai">
                    <input
                      type="checkbox"
                      checked={item.useForAiPreparation}
                      disabled={disabled || saving}
                      onChange={event =>
                        void toggleAi(item.id, event.target.checked)
                      }
                    />
                    Use to personalise AI preparation
                  </label>
                  {!disabled ? (
                    <button
                      type="button"
                      className="identity-text-action"
                      disabled={saving}
                      onClick={() => void removeItem(item.id)}
                    >
                      Remove
                    </button>
                  ) : null}
                </article>
              ))}

              {adding ? (
                <div className="relationship-meta-form">
                  <label className="dialog-field-label" htmlFor="ctx-title">
                    Title
                  </label>
                  <input
                    id="ctx-title"
                    className="dialog-confirm-input"
                    value={draft.title}
                    disabled={saving || disabled}
                    onChange={event =>
                      setDraft(current => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />

                  <label className="dialog-field-label" htmlFor="ctx-source">
                    Source type
                  </label>
                  <select
                    id="ctx-source"
                    className="dialog-confirm-input"
                    value={draft.sourceType}
                    disabled={saving || disabled}
                    onChange={event =>
                      setDraft(current => ({
                        ...current,
                        sourceType: event.target
                          .value as SupportingContextSourceType,
                      }))
                    }
                  >
                    {(
                      Object.keys(
                        SUPPORTING_CONTEXT_SOURCE_LABELS
                      ) as SupportingContextSourceType[]
                    ).map(value => (
                      <option key={value} value={value}>
                        {SUPPORTING_CONTEXT_SOURCE_LABELS[value]}
                      </option>
                    ))}
                  </select>

                  <label className="dialog-field-label" htmlFor="ctx-date">
                    Source date
                  </label>
                  <input
                    id="ctx-date"
                    type="date"
                    className="dialog-confirm-input"
                    value={draft.sourceDate}
                    disabled={saving || disabled}
                    onChange={event =>
                      setDraft(current => ({
                        ...current,
                        sourceDate: event.target.value,
                      }))
                    }
                  />

                  <label className="dialog-field-label" htmlFor="ctx-summary">
                    Concise summary
                  </label>
                  <textarea
                    id="ctx-summary"
                    className="dialog-confirm-input"
                    rows={3}
                    value={draft.summary}
                    disabled={saving || disabled}
                    onChange={event =>
                      setDraft(current => ({
                        ...current,
                        summary: event.target.value,
                      }))
                    }
                  />

                  <label className="supporting-context-ai">
                    <input
                      type="checkbox"
                      checked={draft.useForAiPreparation}
                      disabled={saving || disabled}
                      onChange={event =>
                        setDraft(current => ({
                          ...current,
                          useForAiPreparation: event.target.checked,
                        }))
                      }
                    />
                    Use to personalise AI preparation
                  </label>

                  {error ? (
                    <p className="dialog-error" role="alert">
                      {error}
                    </p>
                  ) : null}

                  <div className="button-row">
                    <button
                      type="button"
                      className="primary"
                      disabled={saving || disabled}
                      onClick={() => void handleAdd()}
                    >
                      {saving ? "Saving…" : "Save context item"}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={saving}
                      onClick={() => {
                        setAdding(false);
                        setError("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : !disabled ? (
                <button
                  type="button"
                  className="identity-text-action"
                  onClick={() => setAdding(true)}
                >
                  Add another context item
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
