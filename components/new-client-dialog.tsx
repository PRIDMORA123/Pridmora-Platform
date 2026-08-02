"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

export type NewClientFormValues = {
  name: string;
  organisation: string;
  role: string;
  currentFocus: string;
  email: string;
};

const EMPTY_FORM: NewClientFormValues = {
  name: "",
  organisation: "",
  role: "",
  currentFocus: "",
  email: "",
};

export function NewClientDialog({
  open,
  busy = false,
  onClose,
  onCreate,
}: {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onCreate: (fields: NewClientFormValues) => Promise<void>;
}) {
  const [formData, setFormData] = useState<NewClientFormValues>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => nameInputRef.current?.focus());
    }
  }, [open]);

  const nameValid = formData.name.trim().length > 0;
  const locked = submitting || busy;

  function resetForm() {
    setFormData(EMPTY_FORM);
    setError("");
    setSubmitting(false);
  }

  function handleClose() {
    if (locked) return;
    resetForm();
    onClose();
  }

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = event.target;

    setFormData(previous => ({
      ...previous,
      [name]: value,
    }));
    if (error) setError("");
  };

  async function handleCreate() {
    if (locked) return;

    const name = formData.name.trim();
    if (!name) {
      setError("Client name is required.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await onCreate({
        name,
        organisation: formData.organisation.trim(),
        role: formData.role.trim(),
        currentFocus: formData.currentFocus.trim(),
        email: formData.email.trim(),
      });
      // Parent closes only after server success.
      resetForm();
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("[NewClientDialog] Create failed", {
          message: err instanceof Error ? err.message : String(err),
          code: err && typeof err === "object" && "code" in err ? err.code : undefined,
          details: err && typeof err === "object" && "details" in err ? err.details : undefined,
          hint: err && typeof err === "object" && "hint" in err ? err.hint : undefined,
          status: err && typeof err === "object" && "status" in err ? err.status : undefined,
          error: err,
        });
      }
      setError(
        err instanceof Error ? err.message : "Unable to create the client. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      title="New client"
      onClose={handleClose}
      footer={
        <>
          <button type="button" className="secondary" disabled={locked} onClick={handleClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!nameValid || locked}
            aria-busy={submitting}
            onClick={() => {
              void handleCreate();
            }}
          >
            {submitting ? "Creating..." : "Create client"}
          </button>
        </>
      }
    >
      <label className="dialog-field-label" htmlFor="new-client-name">
        Client name <span className="dialog-required">*</span>
      </label>
      <input
        ref={nameInputRef}
        id="new-client-name"
        name="name"
        className="dialog-confirm-input"
        value={formData.name}
        disabled={locked}
        autoComplete="name"
        onChange={handleChange}
        onKeyDown={event => {
          if (event.key === "Enter" && nameValid && !locked) {
            event.preventDefault();
            void handleCreate();
          }
        }}
      />

      <label className="dialog-field-label" htmlFor="new-client-organisation">
        Organisation
      </label>
      <input
        id="new-client-organisation"
        name="organisation"
        className="dialog-confirm-input"
        value={formData.organisation}
        disabled={locked}
        autoComplete="organization"
        onChange={handleChange}
      />

      <label className="dialog-field-label" htmlFor="new-client-role">
        Role / job title
      </label>
      <input
        id="new-client-role"
        name="role"
        className="dialog-confirm-input"
        value={formData.role}
        disabled={locked}
        autoComplete="organization-title"
        onChange={handleChange}
      />

      <label className="dialog-field-label" htmlFor="new-client-email">
        Email address
      </label>
      <input
        id="new-client-email"
        name="email"
        className="dialog-confirm-input"
        type="email"
        value={formData.email}
        disabled={locked}
        autoComplete="email"
        onChange={handleChange}
      />

      <label className="dialog-field-label" htmlFor="new-client-focus">
        Coaching Purpose
      </label>
      <textarea
        id="new-client-focus"
        name="currentFocus"
        className="dialog-confirm-input"
        value={formData.currentFocus}
        disabled={locked}
        rows={3}
        placeholder="What is this coaching engagement for?"
        onChange={handleChange}
        onKeyDown={event => {
          // Allow Enter for newlines; do not submit the form.
          if (event.key === "Enter") {
            event.stopPropagation();
          }
        }}
      />

      {error ? (
        <p className="dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}
