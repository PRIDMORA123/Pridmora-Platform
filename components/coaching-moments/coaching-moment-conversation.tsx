"use client";

import { QuickPrivateNote } from "@/components/coach/quick-private-note";

export type CoachingMomentConversationProps = {
  clientName: string;
  intention?: string | null;
  opening?: string | null;
  privateNote: string;
  saveState?: "idle" | "saving" | "saved" | "unsaved" | "error";
  disabled?: boolean;
  onPrivateNoteChange: (value: string) => void;
  onPrivateNoteSave?: () => void;
  onEndConversation: () => void;
};

/**
 * Calm interaction state — stay out of the user's way.
 * No themes, scoring, diagnostics, or long forms.
 */
export function CoachingMomentConversation({
  clientName,
  intention,
  opening,
  privateNote,
  saveState = "idle",
  disabled = false,
  onPrivateNoteChange,
  onPrivateNoteSave,
  onEndConversation,
}: CoachingMomentConversationProps) {
  return (
    <div className="coaching-moment-conversation">
      <h3 className="coaching-moment-heading">Conversation</h3>
      <p className="coaching-moment-person">{clientName}</p>

      {intention ? (
        <section className="coaching-moment-guidance__block">
          <h4>Intention</h4>
          <p>{intention}</p>
        </section>
      ) : null}

      {opening ? (
        <section className="coaching-moment-guidance__block">
          <h4>Possible opening</h4>
          <p className="coaching-moment-guidance__opening">“{opening}”</p>
        </section>
      ) : null}

      <QuickPrivateNote
        value={privateNote}
        disabled={disabled}
        saveState={saveState}
        onChange={onPrivateNoteChange}
        onSave={onPrivateNoteSave}
      />

      <div className="coaching-moment-actions">
        <button
          type="button"
          className="identity-modal-button identity-modal-button--primary"
          disabled={disabled}
          onClick={onEndConversation}
        >
          End conversation
        </button>
      </div>
    </div>
  );
}
