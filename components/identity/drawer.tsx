"use client";

import * as React from "react";
import { createPortal } from "react-dom";

type IdentityDrawerProps = {
  open: boolean;
  title: string;
  description?: string;
  eyebrow?: string;
  supportingNote?: React.ReactNode;
  closeAriaLabel?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
};

export function IdentityDrawer({
  open,
  title,
  description,
  eyebrow,
  supportingNote,
  closeAriaLabel = "Close drawer",
  children,
  footer,
  onClose,
  triggerRef,
}: IdentityDrawerProps) {
  const drawerRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;

    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    // Always open at the beginning of the options.
    requestAnimationFrame(() => {
      contentRef.current?.scrollTo?.({
        top: 0,
        behavior: "auto",
      });

      const firstFocusable =
        drawerRef.current?.querySelector<HTMLElement>(
          'input:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        );

      firstFocusable?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }

      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusableElements = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      );

      if (focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.removeEventListener("keydown", handleKeyDown);

      requestAnimationFrame(() => {
        triggerRef?.current?.focus();
      });
    };
  }, [open, onClose, triggerRef]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="identity-drawer-layer" role="presentation">
      <button
        type="button"
        className="identity-drawer-backdrop"
        aria-label={closeAriaLabel}
        onClick={onClose}
      />

      <section
        ref={drawerRef}
        className="identity-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <header className="identity-drawer-header">
          <div>
            {eyebrow ? <p className="drawer-eyebrow">{eyebrow}</p> : null}

            <h2 id={titleId} className="identity-section-title">
              {title}
            </h2>

            {description ? (
              <p id={descriptionId} className="identity-drawer-description">
                {description}
              </p>
            ) : null}

            {supportingNote ? (
              <small className="intelligence-drawer-default">
                {supportingNote}
              </small>
            ) : null}
          </div>

          <button
            type="button"
            className="identity-drawer-close"
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </button>
        </header>

        <div ref={contentRef} className="identity-drawer-content" tabIndex={-1}>
          {children}
        </div>

        <footer className="identity-drawer-footer">{footer}</footer>
      </section>
    </div>,
    document.body
  );
}
