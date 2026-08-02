"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

export type ScheduleSessionValues = {
  date: string;
  startTime: string;
  title: string;
  durationMinutes: number;
  location: string;
  /** Optional conversation focus / reason. */
  focus?: string;
};

const DEFAULT_FORM: ScheduleSessionValues = {
  date: "",
  startTime: "10:00",
  title: "",
  durationMinutes: 60,
  location: "",
};

export function ScheduleSessionDialog({
  open,
  clientName,
  busy = false,
  onClose,
  onSchedule,
}: {
  open: boolean;
  clientName: string;
  busy?: boolean;
  onClose: () => void;
  onSchedule: (values: ScheduleSessionValues) => Promise<void>;
}) {
  const [form, setForm] = useState<ScheduleSessionValues>(DEFAULT_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setForm({
      ...DEFAULT_FORM,
      date: tomorrow.toISOString().slice(0, 10),
    });
    setError("");
  }, [open]);

  async function handleSubmit() {
    if (!form.date.trim()) {
      setError("Session date is required.");
      return;
    }
    if (!form.startTime.trim()) {
      setError("Start time is required.");
      return;
    }
    const duration = Number(form.durationMinutes);
    if (!Number.isFinite(duration) || duration <= 0) {
      setError("Duration must be a positive number of minutes.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSchedule({
        ...form,
        date: form.date.trim(),
        startTime: form.startTime.trim(),
        title: form.title.trim(),
        durationMinutes: duration,
        location: form.location.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to schedule the session.");
    } finally {
      setSaving(false);
    }
  }

  const locked = saving || busy;

  return (
    <ConfirmDialog
      open={open}
      title="Schedule session"
      onClose={() => {
        if (!locked) onClose();
      }}
      footer={
        <>
          <button type="button" className="secondary" disabled={locked} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={locked}
            aria-busy={locked}
            onClick={() => {
              void handleSubmit();
            }}
          >
            {locked ? "Scheduling…" : "Schedule session"}
          </button>
        </>
      }
    >
      <p className="muted">
        Schedule the next coaching session for <strong>{clientName}</strong>. Preparation and notes
        can be added after the session is created.
      </p>

      <label className="dialog-field">
        Session date
        <input
          type="date"
          value={form.date}
          disabled={locked}
          required
          onChange={event => setForm(current => ({ ...current, date: event.target.value }))}
        />
      </label>

      <label className="dialog-field">
        Start time
        <input
          type="time"
          value={form.startTime}
          disabled={locked}
          required
          onChange={event => setForm(current => ({ ...current, startTime: event.target.value }))}
        />
      </label>

      <label className="dialog-field">
        Session title <span className="field-optional">(optional)</span>
        <input
          type="text"
          value={form.title}
          disabled={locked}
          placeholder="e.g. Redundancy transition"
          onChange={event => setForm(current => ({ ...current, title: event.target.value }))}
        />
      </label>

      <label className="dialog-field">
        Duration (minutes) <span className="field-optional">(optional)</span>
        <input
          type="number"
          min={15}
          step={15}
          value={form.durationMinutes}
          disabled={locked}
          onChange={event =>
            setForm(current => ({
              ...current,
              durationMinutes: Number(event.target.value) || 60,
            }))
          }
        />
      </label>

      <label className="dialog-field">
        Location or meeting link <span className="field-optional">(optional)</span>
        <input
          type="text"
          value={form.location}
          disabled={locked}
          placeholder="Zoom link or office location"
          onChange={event => setForm(current => ({ ...current, location: event.target.value }))}
        />
      </label>

      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}
