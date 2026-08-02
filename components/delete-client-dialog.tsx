"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";

type DeleteClientDialogProps = {
  isOpen: boolean;
  clientName: string;
  isDeleting?: boolean;
  errorMessage?: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
};

export function DeleteClientDialog({
  isOpen,
  clientName,
  isDeleting = false,
  errorMessage = "",
  onClose,
  onConfirm,
}: DeleteClientDialogProps) {
  const [confirmation, setConfirmation] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isConfirmed = confirmation.trim() === "DELETE";

  useEffect(() => {
    if (!isOpen) {
      setConfirmation("");
    }
  }, [isOpen]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isConfirmed || isDeleting) {
      return;
    }

    await onConfirm();
  }

  return (
    <Modal
      isOpen={isOpen}
      title="Permanently delete client?"
      eyebrow="Destructive action"
      descriptionId="delete-client-description"
      onClose={onClose}
      closeDisabled={isDeleting}
      danger
      size="md"
      initialFocusRef={inputRef}
      onSubmit={handleSubmit}
      footer={
        <>
          <button
            type="button"
            className="identity-modal-button identity-modal-button--secondary"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="identity-modal-button identity-modal-button--danger"
            disabled={!isConfirmed || isDeleting}
            aria-busy={isDeleting}
          >
            {isDeleting ? "Deleting client…" : "Permanently delete"}
          </button>
        </>
      }
    >
      <p id="delete-client-description" className="identity-modal-intro">
        This will permanently delete <strong>{clientName}</strong> and all
        associated coaching information, including preparation, conversations,
        reflections, actions, development evidence and reports.
      </p>

      <div className="identity-modal-warning">This action cannot be undone.</div>

      <label className="edit-client-field edit-client-field--full" htmlFor="delete-client-confirmation">
        <span>
          Type <strong>DELETE</strong> to confirm
        </span>
        <input
          ref={inputRef}
          id="delete-client-confirmation"
          type="text"
          value={confirmation}
          onChange={event => setConfirmation(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={isDeleting}
        />
      </label>

      {errorMessage ? (
        <div className="identity-modal-error" role="alert">
          {errorMessage}
        </div>
      ) : null}
    </Modal>
  );
}
