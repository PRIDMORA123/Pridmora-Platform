"use client";

import { useState } from "react";
import type {
  InitialConversation,
  InitialConversationOutcome,
} from "@/lib/relationship-meta";
import {
  EMPTY_INITIAL_CONVERSATION,
  INITIAL_OUTCOME_LABELS,
} from "@/lib/relationship-meta";

export function InitialConversationSection({
  initialConversation,
  disabled = false,
  onSave,
}: {
  initialConversation?: InitialConversation | null;
  disabled?: boolean;
  onSave: (next: InitialConversation) => Promise<void>;
}) {
  const current = initialConversation ?? EMPTY_INITIAL_CONVERSATION;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<InitialConversation>(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await onSave({
        ...draft,
        recorded: true,
        updatedAt: new Date().toISOString(),
      });
      setEditing(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save initial conversation."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="relationship-journey-section"
      aria-labelledby="initial-conversation-heading"
    >
      <header className="relationship-journey-section__header">
        <div>
          <p className="journey-eyebrow">Optional</p>
          <h2 id="initial-conversation-heading">Initial conversation</h2>
          <p>
            An optional introductory or chemistry conversation to explore fit,
            expectations and whether the relationship should proceed. This does
            not count as Session 1.
          </p>
        </div>
        <p className="relationship-journey-section__status" aria-live="polite">
          {current.recorded
            ? INITIAL_OUTCOME_LABELS[current.outcome]
            : "Not recorded"}
        </p>
      </header>

      {!current.recorded && !open ? (
        <button
          type="button"
          className="identity-text-action"
          disabled={disabled}
          onClick={() => {
            setDraft(current);
            setOpen(true);
            setEditing(true);
          }}
        >
          Record initial conversation
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
              ? "Hide initial conversation"
              : "View initial conversation"}
          </button>

          {open ? (
            editing ? (
              <div className="relationship-meta-form">
                <label
                  className="dialog-field-label"
                  htmlFor="initial-conversation-date"
                >
                  Date
                </label>
                <input
                  id="initial-conversation-date"
                  type="date"
                  className="dialog-confirm-input"
                  value={draft.occurredOn}
                  disabled={saving || disabled}
                  onChange={event =>
                    setDraft(currentDraft => ({
                      ...currentDraft,
                      occurredOn: event.target.value,
                    }))
                  }
                />

                <label
                  className="dialog-field-label"
                  htmlFor="initial-conversation-outcome"
                >
                  Outcome
                </label>
                <select
                  id="initial-conversation-outcome"
                  className="dialog-confirm-input"
                  value={draft.outcome}
                  disabled={saving || disabled}
                  onChange={event =>
                    setDraft(currentDraft => ({
                      ...currentDraft,
                      outcome: event.target.value as InitialConversationOutcome,
                    }))
                  }
                >
                  {(
                    Object.keys(
                      INITIAL_OUTCOME_LABELS
                    ) as InitialConversationOutcome[]
                  ).map(value => (
                    <option key={value} value={value}>
                      {INITIAL_OUTCOME_LABELS[value]}
                    </option>
                  ))}
                </select>

                <label
                  className="dialog-field-label"
                  htmlFor="initial-conversation-notes"
                >
                  Outcome or points to remember
                </label>
                <textarea
                  id="initial-conversation-notes"
                  className="dialog-confirm-input"
                  rows={3}
                  value={draft.notes}
                  disabled={saving || disabled}
                  onChange={event =>
                    setDraft(currentDraft => ({
                      ...currentDraft,
                      notes: event.target.value,
                    }))
                  }
                />

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
                    onClick={() => void handleSave()}
                  >
                    {saving ? "Saving…" : "Save initial conversation"}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={saving}
                    onClick={() => {
                      setDraft(current);
                      setEditing(false);
                      setError("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <dl className="relationship-meta-summary">
                {current.occurredOn.trim() ? (
                  <div>
                    <dt>Date</dt>
                    <dd>{current.occurredOn}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Outcome</dt>
                  <dd>{INITIAL_OUTCOME_LABELS[current.outcome]}</dd>
                </div>
                {current.notes.trim() ? (
                  <div>
                    <dt>Notes</dt>
                    <dd>{current.notes}</dd>
                  </div>
                ) : null}
                {!disabled ? (
                  <div className="button-row" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="identity-text-action"
                      onClick={() => {
                        setDraft(current);
                        setEditing(true);
                      }}
                    >
                      Edit initial conversation
                    </button>
                  </div>
                ) : null}
              </dl>
            )
          ) : null}
        </>
      )}
    </section>
  );
}
