"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { IdentityMode } from "@/lib/relationship-identity";

export type NewClientFormValues = {
  identityMode: IdentityMode;
  name: string;
  displayLabel: string;
  organisation: string;
  role: string;
  currentFocus: string;
  email: string;
  aiNameAllowed: boolean;
  privateRealName: string;
  privateEmail: string;
  privatePhone: string;
  privateNotes: string;
};

const EMPTY_FORM: NewClientFormValues = {
  identityMode: "standard",
  name: "",
  displayLabel: "",
  organisation: "",
  role: "",
  currentFocus: "",
  email: "",
  aiNameAllowed: false,
  privateRealName: "",
  privateEmail: "",
  privatePhone: "",
  privateNotes: "",
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
  const [privateOpen, setPrivateOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        if (formData.identityMode === "confidential") {
          labelInputRef.current?.focus();
        } else {
          nameInputRef.current?.focus();
        }
      });
    }
  }, [open, formData.identityMode]);

  const standardValid = formData.name.trim().length > 0;
  const confidentialValid =
    formData.displayLabel.trim().length > 0 || formData.role.trim().length > 0;
  const formValid =
    formData.identityMode === "confidential" ? confidentialValid : standardValid;
  const locked = submitting || busy;

  function resetForm() {
    setFormData(EMPTY_FORM);
    setError("");
    setSubmitting(false);
    setPrivateOpen(false);
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

    if (formData.identityMode === "standard" && !formData.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (
      formData.identityMode === "confidential" &&
      !formData.displayLabel.trim() &&
      !formData.role.trim()
    ) {
      setError("Add a display label or role for this confidential relationship.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await onCreate({
        identityMode: formData.identityMode,
        name: formData.name.trim(),
        displayLabel: formData.displayLabel.trim(),
        organisation: formData.organisation.trim(),
        role: formData.role.trim(),
        currentFocus: formData.currentFocus.trim(),
        email: formData.email.trim(),
        aiNameAllowed: formData.aiNameAllowed,
        privateRealName: formData.privateRealName.trim(),
        privateEmail: formData.privateEmail.trim(),
        privatePhone: formData.privatePhone.trim(),
        privateNotes: formData.privateNotes.trim(),
      });
      resetForm();
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("[NewClientDialog] Create failed", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create the relationship. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      title="Create relationship"
      onClose={handleClose}
      footer={
        <>
          <button type="button" className="secondary" disabled={locked} onClick={handleClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!formValid || locked}
            aria-busy={submitting}
            onClick={() => {
              void handleCreate();
            }}
          >
            {submitting ? "Creating..." : "Create relationship"}
          </button>
        </>
      }
    >
      <p className="dialog-field-label" id="identity-mode-label">
        How would you like to manage identity?
      </p>
      <div
        className="identity-mode-choice"
        role="radiogroup"
        aria-labelledby="identity-mode-label"
      >
        <label
          className={`identity-mode-option${
            formData.identityMode === "standard" ? " identity-mode-option-selected" : ""
          }`}
        >
          <input
            type="radio"
            name="identityMode"
            value="standard"
            checked={formData.identityMode === "standard"}
            disabled={locked}
            onChange={() =>
              setFormData(previous => ({ ...previous, identityMode: "standard" }))
            }
          />
          <span>
            <strong>Standard</strong>
            <span className="identity-mode-option-copy">
              Store the person’s name and optional contact details.
            </span>
          </span>
        </label>
        <label
          className={`identity-mode-option${
            formData.identityMode === "confidential" ? " identity-mode-option-selected" : ""
          }`}
        >
          <input
            type="radio"
            name="identityMode"
            value="confidential"
            checked={formData.identityMode === "confidential"}
            disabled={locked}
            onChange={() =>
              setFormData(previous => ({
                ...previous,
                identityMode: "confidential",
                aiNameAllowed: false,
              }))
            }
          />
          <span>
            <strong>
              Confidential{" "}
              <span className="identity-mode-recommended">Recommended for sensitive coaching</span>
            </strong>
            <span className="identity-mode-option-copy">
              Use a confidential reference and keep private identity separate from coaching
              information.
            </span>
          </span>
        </label>
      </div>

      <p className="identity-mode-intro">
        Confidential coaching keeps personal identity separate from coaching information. AI works
        with coaching evidence, not unnecessary personal details. You decide whether names are
        stored.
      </p>

      {formData.identityMode === "standard" ? (
        <>
          <label className="dialog-field-label" htmlFor="new-client-name">
            Name <span className="dialog-required">*</span>
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

          <label className="identity-toggle" htmlFor="new-client-ai-name">
            <input
              id="new-client-ai-name"
              type="checkbox"
              checked={formData.aiNameAllowed}
              disabled={locked}
              onChange={event =>
                setFormData(previous => ({
                  ...previous,
                  aiNameAllowed: event.target.checked,
                }))
              }
            />
            Allow AI to use the person’s preferred name
          </label>
        </>
      ) : (
        <>
          <label className="dialog-field-label" htmlFor="new-client-display-label">
            Display label
          </label>
          <input
            ref={labelInputRef}
            id="new-client-display-label"
            name="displayLabel"
            className="dialog-confirm-input"
            value={formData.displayLabel}
            disabled={locked}
            placeholder="e.g. Head of Finance programme"
            onChange={handleChange}
          />

          <label className="dialog-field-label" htmlFor="new-client-role-confidential">
            Role / job title
          </label>
          <input
            id="new-client-role-confidential"
            name="role"
            className="dialog-confirm-input"
            value={formData.role}
            disabled={locked}
            autoComplete="organization-title"
            onChange={handleChange}
          />

          <label className="dialog-field-label" htmlFor="new-client-organisation-confidential">
            Organisation
          </label>
          <input
            id="new-client-organisation-confidential"
            name="organisation"
            className="dialog-confirm-input"
            value={formData.organisation}
            disabled={locked}
            autoComplete="organization"
            onChange={handleChange}
          />

          <button
            type="button"
            className="secondary identity-private-toggle"
            disabled={locked}
            aria-expanded={privateOpen}
            onClick={() => setPrivateOpen(current => !current)}
          >
            {privateOpen ? "Hide private identity details" : "Add private identity details"}
          </button>

          {privateOpen ? (
            <div className="identity-private-panel">
              <p className="identity-private-note">
                Private identity details are kept separate from coaching information and are not
                shared with AI.
              </p>
              <label className="dialog-field-label" htmlFor="new-client-private-name">
                Real name
              </label>
              <input
                id="new-client-private-name"
                name="privateRealName"
                className="dialog-confirm-input"
                value={formData.privateRealName}
                disabled={locked}
                autoComplete="off"
                onChange={handleChange}
              />
              <label className="dialog-field-label" htmlFor="new-client-private-email">
                Email
              </label>
              <input
                id="new-client-private-email"
                name="privateEmail"
                className="dialog-confirm-input"
                type="email"
                value={formData.privateEmail}
                disabled={locked}
                autoComplete="off"
                onChange={handleChange}
              />
              <label className="dialog-field-label" htmlFor="new-client-private-phone">
                Phone
              </label>
              <input
                id="new-client-private-phone"
                name="privatePhone"
                className="dialog-confirm-input"
                value={formData.privatePhone}
                disabled={locked}
                autoComplete="off"
                onChange={handleChange}
              />
              <label className="dialog-field-label" htmlFor="new-client-private-notes">
                Private note
              </label>
              <textarea
                id="new-client-private-notes"
                name="privateNotes"
                className="dialog-confirm-input"
                value={formData.privateNotes}
                disabled={locked}
                rows={3}
                onChange={handleChange}
              />
            </div>
          ) : null}
        </>
      )}

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
