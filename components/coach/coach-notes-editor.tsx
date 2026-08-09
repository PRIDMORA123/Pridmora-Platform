"use client";

import { useOrganisation } from "@/lib/organisations/organisation-context";
import { resolveProductLanguage } from "@/lib/role-language";

import { useRef } from "react";
import { NoteInsertToolbar } from "@/components/coach/note-insert-toolbar";
import type { SaveState } from "@/types/coach-workspace";

type Props = {
  value: string;
  saveState: SaveState;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
};

export function CoachNotesEditor({
  value,
  saveState,
  disabled = false,
  onChange,
  onSave,
}: Props) {
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function insertAtCursor(text: string) {
    const textarea = textareaRef.current;
    if (!textarea || disabled) return;

    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${text}${value.slice(end)}`;
    const cursor = start + text.length;

    onChange(next);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <section className="coach-notes-card identity-coach-content">
      <div className="coach-notes-card__header">
        <div>
          <p className="coach-section-label identity-coach-content__label">
            {language.notesLabel}
          </p>

          <h2>Session notes</h2>

          <p>
            Capture what happened in the conversation. Keep it concise and private to your work.
          </p>
        </div>

        <SaveStateIndicator state={saveState} />
      </div>

      <NoteInsertToolbar
        disabled={disabled}
        onInsert={insertAtCursor}
      />

      <label className="sr-only" htmlFor="coach-notes-editor">
        {language.notesLabel}
      </label>

      <textarea
        ref={textareaRef}
        id="coach-notes-editor"
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key.toLowerCase() === "s"
          ) {
            event.preventDefault();
            onSave();
          }
        }}
        placeholder="Begin capturing the conversation…"
      />

      <div className="coach-notes-card__footer">
        <span>
          {disabled
            ? "This conversation has been completed."
            : "Notes save automatically as you work."}
        </span>

        <span>{value.trim().length} characters</span>
      </div>
    </section>
  );
}

function SaveStateIndicator({ state }: { state: SaveState }) {
  const content = {
    idle: "",
    unsaved: "Unsaved changes",
    saving: "Saving…",
    saved: "All changes saved",
    error: "Unable to save",
  }[state];

  if (!content) return null;

  return (
    <span
      className={["coach-save-state", `is-${state}`].join(" ")}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" />
      {content}
    </span>
  );
}
