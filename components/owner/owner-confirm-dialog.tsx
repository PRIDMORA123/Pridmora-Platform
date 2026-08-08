"use client";

import { useEffect, useId, useRef } from "react";

export function OwnerConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="owner-dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="owner-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={event => event.stopPropagation()}
      >
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>
        <div className="owner-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            className="owner-button owner-button--secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={danger ? "owner-button owner-button--danger" : "owner-button"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
