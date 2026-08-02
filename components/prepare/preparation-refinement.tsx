"use client";

import { useId, useState, type ReactNode } from "react";

export type PreparationRefinementProps = {
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  panelId?: string;
};

/**
 * Optional collapsed refinement for purpose, areas, questions and private notes.
 */
export function PreparationRefinement({
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  panelId: panelIdProp,
}: PreparationRefinementProps) {
  const generatedId = useId();
  const panelId = panelIdProp || generatedId;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;

  function setOpen(next: boolean) {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(next);
    }
    onOpenChange?.(next);
  }

  return (
    <section
      className="preparation-refinement"
      data-open={open ? "true" : "false"}
    >
      <button
        type="button"
        className="preparation-refinement__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <span className="preparation-refinement__toggle-copy">
          <span className="preparation-refinement__toggle-label">
            Refine preparation
          </span>
          <span className="preparation-refinement__support">
            Adjust the focus, questions or private preparation notes only if
            useful.
          </span>
        </span>
        <span
          className="preparation-refinement__chevron"
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          id={panelId}
          className="preparation-refinement__panel"
          role="region"
          aria-label="Refine preparation"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
