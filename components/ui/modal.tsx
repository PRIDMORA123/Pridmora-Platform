"use client";

import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { getFocusableElements, trapFocusTab } from "@/lib/focus-trap";
import "@/components/ui/modal.css";

export type ModalProps = {
  isOpen: boolean;
  title: string;
  eyebrow?: string;
  descriptionId?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  closeDisabled?: boolean;
  danger?: boolean;
  size?: "md" | "lg";
  /** When provided, the modal shell renders as a <form>. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  showCloseButton?: boolean;
};

export function Modal({
  isOpen,
  title,
  eyebrow,
  descriptionId,
  onClose,
  children,
  footer,
  closeDisabled = false,
  danger = false,
  size = "lg",
  onSubmit,
  initialFocusRef,
  showCloseButton = true,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | HTMLFormElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeDisabledRef = useRef(closeDisabled);
  closeDisabledRef.current = closeDisabled;

  useEffect(() => {
    if (!isOpen) return;

    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
        return;
      }

      const focusable = dialogRef.current
        ? getFocusableElements(dialogRef.current)
        : [];
      (focusable[0] ?? dialogRef.current)?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Read latest closeDisabled via ref so this effect does not re-bind
        // (and steal focus) when submitting disables close.
        if (closeDisabledRef.current) return;
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (dialogRef.current) {
        trapFocusTab(event, dialogRef.current);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previous?.focus?.();
    };
    // Intentionally depend only on isOpen / initialFocusRef.
    // Re-running when closeDisabled flips mid-submit restores focus outside the
    // dialog and can interrupt the create-conversation submit interaction.
  }, [isOpen, initialFocusRef]);

  if (!isOpen) {
    return null;
  }

  const shellClassName = [
    "identity-modal",
    size === "md" ? "identity-modal--md" : "",
    danger ? "identity-modal--danger" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <header className="identity-modal__header">
        <div>
          {eyebrow ? (
            <p className="identity-modal__eyebrow">{eyebrow}</p>
          ) : null}
          <h2 className="identity-modal__title" id={titleId}>
            {title}
          </h2>
        </div>

        {showCloseButton ? (
          <button
            type="button"
            className="identity-modal__close"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Close dialog"
          >
            ×
          </button>
        ) : null}
      </header>

      <div className="identity-modal__body">{children}</div>

      <footer className="identity-modal__footer">{footer}</footer>
    </>
  );

  return (
    <div className="identity-modal-overlay" role="presentation">
      <button
        type="button"
        className="identity-modal-backdrop"
        aria-label="Close dialog"
        onClick={() => {
          if (!closeDisabled) {
            onClose();
          }
        }}
      />

      {onSubmit ? (
        <form
          ref={dialogRef as RefObject<HTMLFormElement | null>}
          className={shellClassName}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
          onSubmit={event => {
            event.preventDefault();
            onSubmit(event);
          }}
        >
          {content}
        </form>
      ) : (
        <div
          ref={dialogRef as RefObject<HTMLDivElement | null>}
          className={shellClassName}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
        >
          {content}
        </div>
      )}
    </div>
  );
}
