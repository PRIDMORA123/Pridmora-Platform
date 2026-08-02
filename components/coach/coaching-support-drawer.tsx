"use client";

import type { CoachingSupportResult } from "@/types/coach-workspace";

type Props = {
  result: CoachingSupportResult | null;
  onAddToNotes: (content: string) => void;
  onClose: () => void;
};

export function CoachingSupportDrawer({
  result,
  onAddToNotes,
  onClose,
}: Props) {
  if (!result) return null;

  const support = result;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(support.content);
    } catch (error) {
      console.error("Unable to copy coaching support", error);
    }
  }

  return (
    <>
      <button
        type="button"
        className="coach-support-overlay"
        onClick={onClose}
        aria-label="Close coaching support"
      />

      <aside
        className="coach-support-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="coach-support-drawer-title"
      >
        <div className="coach-support-drawer__header">
          <div>
            <p className="coach-section-label">Coaching support</p>
            <h2 id="coach-support-drawer-title">{support.title}</h2>
          </div>

          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="coach-support-drawer__notice">
          Review before adding anything to your notes.
        </p>

        <div className="coach-support-drawer__content">{support.content}</div>

        <div className="coach-support-drawer__actions">
          <button
            type="button"
            className="is-primary"
            onClick={() => {
              onAddToNotes(support.content);
              onClose();
            }}
          >
            Add to notes
          </button>

          <button type="button" onClick={() => void handleCopy()}>
            Copy
          </button>

          <button type="button" onClick={onClose}>
            Discard
          </button>
        </div>
      </aside>
    </>
  );
}
