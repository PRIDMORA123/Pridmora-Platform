"use client";

import { SessionSaveStatus } from "@/components/session/session-save-status";

export type QuickPrivateNoteProps = {
  value: string;
  disabled?: boolean;
  saveState?: "idle" | "saving" | "saved" | "unsaved" | "error";
  onChange: (value: string) => void;
  onSave?: () => void;
};

/**
 * Optional live-session private capture.
 * Never required. Never client-facing by default.
 */
export function QuickPrivateNote({
  value,
  disabled = false,
  saveState = "idle",
  onChange,
  onSave,
}: QuickPrivateNoteProps) {
  return (
    <section
      className="quick-private-note quick-private-note--plain"
      aria-labelledby="quick-private-note-label"
    >
      <div className="quick-private-note__header">
        <div>
          <h2 id="quick-private-note-label">Quick private note</h2>
          <p>Optional · Visible only to you</p>
        </div>
        <SessionSaveStatus state={saveState} />
      </div>

      <label className="sr-only" htmlFor="quick-private-note-field">
        Quick private note
      </label>
      <textarea
        id="quick-private-note-field"
        className="quick-private-note__field"
        value={value}
        disabled={disabled}
        rows={5}
        placeholder="Private to you — not shared with the client"
        onChange={event => onChange(event.target.value)}
        onBlur={() => {
          if (onSave) onSave();
        }}
      />
    </section>
  );
}
