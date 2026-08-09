"use client";

import { resolveProductLanguage } from "@/lib/role-language";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import "@/components/edit-client-dialog.css";

export type EditClientValues = {
  name: string;
  role: string;
  organisation: string;
  email: string;
  coachingPurpose: string;
  relationshipStatus: "active" | "completed" | "archived";
};

type EditClientDialogProps = {
  isOpen: boolean;
  clientId: string;
  initialValues: EditClientValues;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (values: EditClientValues) => Promise<void> | void;
};

export function EditClientDialog({
  isOpen,
  initialValues,
  isSaving = false,
  onClose,
  onSave,
}: EditClientDialogProps) {
  const [values, setValues] = useState<EditClientValues>(initialValues);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);
  const busy = isSaving || saving;

  useEffect(() => {
    if (!isOpen) {
      setSaving(false);
      return;
    }

    setValues(initialValues);
    setErrorMessage(null);
  }, [
    isOpen,
    initialValues.email,
    initialValues.name,
    initialValues.organisation,
    initialValues.role,
    initialValues.coachingPurpose,
    initialValues.relationshipStatus,
  ]);

  function updateField<K extends keyof EditClientValues>(
    field: K,
    value: EditClientValues[K]
  ) {
    setValues(current => ({
      ...current,
      [field]: value,
    }));
    setErrorMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) {
      return;
    }

    if (!values.name.trim()) {
      setErrorMessage(`Enter the ${language.personSingular}’s name before saving.`);
      firstInputRef.current?.focus();
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      await onSave({
        ...values,
        name: values.name.trim(),
        role: values.role.trim(),
        organisation: values.organisation.trim(),
        email: values.email.trim(),
        coachingPurpose: values.coachingPurpose.trim(),
      });
    } catch (error) {
      console.error("Unable to update client", error);
      setErrorMessage(
        `The ${language.personSingular} could not be updated. Your changes remain on screen.`
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      title={language.editPersonLabel}
      eyebrow={language.personDetailsLabel}
      descriptionId="edit-client-description"
      onClose={onClose}
      closeDisabled={busy}
      initialFocusRef={firstInputRef}
      onSubmit={handleSubmit}
      footer={
        <>
          <button
            type="button"
            className="identity-modal-button identity-modal-button--secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="identity-modal-button identity-modal-button--primary"
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? "Saving changes…" : "Save changes"}
          </button>
        </>
      }
    >
      <p id="edit-client-description" className="identity-modal-intro">
        Update the core details for this {language.relationshipSingular}. Changes are
        saved to the {language.personSingular} record only.
      </p>

      {errorMessage ? (
        <div className="identity-modal-error" role="alert">
          {errorMessage}
        </div>
      ) : null}

      <div className="edit-client-form-grid">
        <label className="edit-client-field edit-client-field--full">
          <span>Name</span>
          <input
            ref={firstInputRef}
            type="text"
            value={values.name}
            onChange={event => updateField("name", event.target.value)}
            disabled={busy}
            required
            autoComplete="name"
          />
        </label>

        <label className="edit-client-field">
          <span>Role</span>
          <input
            type="text"
            value={values.role}
            onChange={event => updateField("role", event.target.value)}
            disabled={busy}
            autoComplete="organization-title"
          />
        </label>

        <label className="edit-client-field">
          <span>Organisation</span>
          <input
            type="text"
            value={values.organisation}
            onChange={event => updateField("organisation", event.target.value)}
            disabled={busy}
            autoComplete="organization"
          />
        </label>

        <label className="edit-client-field edit-client-field--full">
          <span>Email</span>
          <input
            type="email"
            value={values.email}
            onChange={event => updateField("email", event.target.value)}
            disabled={busy}
            autoComplete="email"
          />
        </label>

        <label className="edit-client-field edit-client-field--full">
          <span>{language.developmentPurposeLabel}</span>
          <textarea
            value={values.coachingPurpose}
            onChange={event =>
              updateField("coachingPurpose", event.target.value)
            }
            disabled={busy}
            rows={4}
          />
        </label>

        <label className="edit-client-field edit-client-field--full">
          <span>Relationship status</span>
          <select
            value={values.relationshipStatus}
            onChange={event =>
              updateField(
                "relationshipStatus",
                event.target.value as EditClientValues["relationshipStatus"]
              )
            }
            disabled={busy}
          >
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>
    </Modal>
  );
}

export function relationshipStatusFromClient(
  status: string
): EditClientValues["relationshipStatus"] {
  if (status === "Archived") return "archived";
  if (status === "Paused") return "completed";
  return "active";
}
