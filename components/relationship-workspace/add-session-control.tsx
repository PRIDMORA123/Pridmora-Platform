"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  getIncompleteSessionWarning,
  type AddSessionFormValues,
} from "@/lib/relationship-workspace";
import type { Session } from "@/lib/types";

export type { AddSessionFormValues };

const DEFAULT_FORM: AddSessionFormValues = {
  title: "",
  plannedDate: "",
  startTime: "",
  focus: "",
};

export function AddSessionControl({
  sessions,
  archived = false,
  busy = false,
  showProminent = false,
  label,
  supportingCopy,
  onCreate,
  onContinueSession,
}: {
  sessions: Session[];
  archived?: boolean;
  busy?: boolean;
  /** When false, render a quiet text action rather than a primary CTA. */
  showProminent?: boolean;
  /** Override the trigger label. */
  label?: string;
  /** Optional supporting copy shown above a prominent trigger. */
  supportingCopy?: string;
  onCreate: (values: AddSessionFormValues) => Promise<void>;
  onContinueSession?: (sessionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [form, setForm] = useState<AddSessionFormValues>(DEFAULT_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submitLockRef = useRef(false);

  const warning = getIncompleteSessionWarning(sessions);
  const triggerLabel = label ?? "Plan next conversation";

  useEffect(() => {
    if (!open) return;
    setForm(DEFAULT_FORM);
    setError("");
  }, [open]);

  if (archived) return null;

  function requestOpen() {
    if (saving || busy || submitLockRef.current) return;
    if (warning) {
      setConfirmOpen(true);
      return;
    }
    setOpen(true);
  }

  async function handleSubmit() {
    if (saving || busy || submitLockRef.current) return;
    submitLockRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onCreate({
        title: form.title.trim(),
        plannedDate: form.plannedDate.trim(),
        startTime: form.startTime.trim(),
        focus: form.focus.trim(),
      });
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create the conversation."
      );
    } finally {
      setSaving(false);
      submitLockRef.current = false;
    }
  }

  const locked = saving || busy;

  return (
    <>
      {showProminent ? (
        <div className="add-session-control add-session-control--prominent">
          {supportingCopy ? (
            <p className="add-session-control__supporting">{supportingCopy}</p>
          ) : null}
          <button
            type="button"
            className="identity-button is-primary"
            disabled={locked}
            aria-busy={locked}
            onClick={requestOpen}
          >
            {triggerLabel}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="identity-text-action"
          disabled={locked}
          onClick={requestOpen}
        >
          {triggerLabel}
        </button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Conversation still in progress"
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            {warning && onContinueSession ? (
              <button
                type="button"
                className="identity-button is-secondary"
                onClick={() => {
                  setConfirmOpen(false);
                  onContinueSession(warning.sessionId);
                }}
              >
                Continue Session {warning.sessionNumber}
              </button>
            ) : null}
            <button
              type="button"
              className="identity-button is-primary"
              onClick={() => {
                setConfirmOpen(false);
                setOpen(true);
              }}
            >
              Plan next conversation
            </button>
          </>
        }
      >
        <p>{warning?.message}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={open}
        title="Create conversation"
        onClose={() => {
          if (!locked) setOpen(false);
        }}
        closeDisabled={locked}
        footer={
          <>
            <button
              type="button"
              className="identity-button is-secondary"
              disabled={locked}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="identity-button is-primary"
              disabled={locked}
              aria-busy={locked}
              onClick={() => {
                void handleSubmit();
              }}
            >
              {locked ? "Creating…" : "Create conversation"}
            </button>
          </>
        }
      >
        <p className="muted">
          Create the next conversation when the coaching relationship continues.
          Session numbering is assigned automatically.
        </p>

        <label className="dialog-field">
          Conversation title <span className="field-optional">(optional)</span>
          <input
            type="text"
            value={form.title}
            disabled={locked}
            placeholder="e.g. Building leadership confidence"
            onChange={event =>
              setForm(current => ({ ...current, title: event.target.value }))
            }
          />
        </label>

        <label className="dialog-field">
          Planned date <span className="field-optional">(optional)</span>
          <input
            type="date"
            value={form.plannedDate}
            disabled={locked}
            onChange={event =>
              setForm(current => ({
                ...current,
                plannedDate: event.target.value,
              }))
            }
          />
        </label>

        <label className="dialog-field">
          Start time <span className="field-optional">(optional)</span>
          <input
            type="time"
            value={form.startTime}
            disabled={locked}
            onChange={event =>
              setForm(current => ({
                ...current,
                startTime: event.target.value,
              }))
            }
          />
        </label>

        <label className="dialog-field">
          Reason or focus <span className="field-optional">(optional)</span>
          <textarea
            rows={3}
            value={form.focus}
            disabled={locked}
            placeholder="What should this conversation explore?"
            onChange={event =>
              setForm(current => ({ ...current, focus: event.target.value }))
            }
          />
        </label>

        {error ? (
          <p className="inline-error" role="alert">
            {error}
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
