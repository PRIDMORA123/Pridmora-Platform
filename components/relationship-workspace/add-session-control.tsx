"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  allocateNextSessionNumber,
  defaultSessionTitle,
  getIncompleteSessionWarning,
  type AddSessionFormValues,
} from "@/lib/relationship-workspace";
import {
  CREATE_CONVERSATION_USER_ERROR,
  safeCreateConversationErrorMessage,
} from "@/lib/organisations/session-organisation";
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
  clientName,
  clientId,
  archived = false,
  busy = false,
  showProminent = false,
  label,
  supportingCopy,
  onCreate,
  onContinueSession,
}: {
  sessions: Session[];
  /** Person / relationship name shown in the create dialog. */
  clientName?: string;
  /** Required relationship id — validated before create. */
  clientId?: string;
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
  const errorId = useId();

  const warning = getIncompleteSessionWarning(sessions);
  const triggerLabel = label ?? "Plan next conversation";
  const nextSessionNumber = allocateNextSessionNumber(sessions);
  const sessionLabel = defaultSessionTitle(nextSessionNumber);
  const personName = clientName?.trim() || "";
  const relationshipId = clientId?.trim() || "";
  const dialogTitle = personName
    ? `Create conversation for ${personName}`
    : "Create conversation";

  useEffect(() => {
    if (!open) return;
    setForm(DEFAULT_FORM);
    setError("");
    submitLockRef.current = false;
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

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    // Double-submit guard — silent ignore while already submitting.
    if (saving || submitLockRef.current) {
      return;
    }

    if (busy) {
      setError(CREATE_CONVERSATION_USER_ERROR);
      return;
    }

    if (!relationshipId) {
      setError(
        "This relationship is missing required context. Refresh and try again."
      );
      return;
    }

    submitLockRef.current = true;
    setSaving(true);
    setError("");

    const payload: AddSessionFormValues = {
      title: form.title.trim(),
      plannedDate: form.plannedDate.trim(),
      startTime: form.startTime.trim(),
      focus: form.focus.trim(),
    };

    try {
      await onCreate(payload);
      setOpen(false);
    } catch (err) {
      setError(safeCreateConversationErrorMessage(err));
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
        title={dialogTitle}
        onClose={() => {
          if (!locked) setOpen(false);
        }}
        closeDisabled={locked}
        onSubmit={event => {
          void handleSubmit(event);
        }}
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
              type="submit"
              className="identity-button is-primary"
              disabled={locked}
              aria-busy={locked}
            >
              {saving ? "Creating…" : "Create conversation"}
            </button>
          </>
        }
      >
        {personName ? (
          <p className="muted">
            Planning {sessionLabel} with {personName}. Session numbering is
            assigned automatically.
          </p>
        ) : (
          <p className="muted">
            Create the next conversation when the coaching relationship
            continues. Session numbering is assigned automatically.
          </p>
        )}

        <p className="dialog-field">
          <strong>{sessionLabel}</strong>
        </p>

        <label className="dialog-field">
          Conversation title <span className="field-optional">(optional)</span>
          <input
            type="text"
            name="conversationTitle"
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
            name="plannedDate"
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
            name="startTime"
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
            name="focus"
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
          <p className="identity-modal-error" role="alert" id={errorId}>
            {error}
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
