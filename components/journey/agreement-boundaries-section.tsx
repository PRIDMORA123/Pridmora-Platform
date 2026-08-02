"use client";

import { useState } from "react";
import type {
  AgreementStatus,
  RelationshipAgreement,
} from "@/lib/relationship-meta";
import {
  AGREEMENT_STATUS_LABELS,
  EMPTY_AGREEMENT,
  agreementStatusLabel,
} from "@/lib/relationship-meta";

export function AgreementBoundariesSection({
  agreement,
  disabled = false,
  onSave,
}: {
  agreement?: RelationshipAgreement | null;
  disabled?: boolean;
  onSave: (next: RelationshipAgreement) => Promise<void>;
}) {
  const current = agreement ?? EMPTY_AGREEMENT;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RelationshipAgreement>(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const status: AgreementStatus = current.status;
  const hasContent =
    status !== "not_recorded" ||
    Boolean(
      current.purpose.trim() ||
        current.confidentiality.trim() ||
        current.notes.trim()
    );

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const next: RelationshipAgreement = {
        ...draft,
        updatedAt: new Date().toISOString(),
        status:
          draft.status === "not_recorded" &&
          (draft.purpose.trim() || draft.notes.trim())
            ? "draft"
            : draft.status,
      };
      await onSave(next);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save agreement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="relationship-journey-section" aria-labelledby="agreement-heading">
      <header className="relationship-journey-section__header">
        <div>
          <p className="journey-eyebrow">Optional</p>
          <h2 id="agreement-heading">Agreement and boundaries</h2>
          <p>
            Record the purpose, expectations and boundaries of the coaching
            relationship where relevant.
          </p>
        </div>
        <p className="relationship-journey-section__status" aria-live="polite">
          {agreementStatusLabel(status)}
        </p>
      </header>

      {!open && !hasContent ? (
        <button
          type="button"
          className="identity-text-action"
          disabled={disabled}
          onClick={() => {
            setDraft(current);
            setOpen(true);
            setEditing(true);
          }}
        >
          Record agreement
        </button>
      ) : (
        <>
          <button
            type="button"
            className="identity-text-action"
            aria-expanded={open}
            onClick={() => setOpen(value => !value)}
          >
            {open ? "Hide agreement details" : "View agreement details"}
          </button>

          {open ? (
            editing ? (
              <div className="relationship-meta-form">
                <label className="dialog-field-label" htmlFor="agreement-status">
                  Status
                </label>
                <select
                  id="agreement-status"
                  className="dialog-confirm-input"
                  value={draft.status}
                  disabled={saving || disabled}
                  onChange={event =>
                    setDraft(currentDraft => ({
                      ...currentDraft,
                      status: event.target.value as AgreementStatus,
                    }))
                  }
                >
                  {(Object.keys(AGREEMENT_STATUS_LABELS) as AgreementStatus[]).map(
                    value => (
                      <option key={value} value={value}>
                        {AGREEMENT_STATUS_LABELS[value]}
                      </option>
                    )
                  )}
                </select>

                <label className="dialog-field-label" htmlFor="agreement-purpose">
                  Purpose of the relationship
                </label>
                <textarea
                  id="agreement-purpose"
                  className="dialog-confirm-input"
                  rows={2}
                  value={draft.purpose}
                  disabled={saving || disabled}
                  onChange={event =>
                    setDraft(currentDraft => ({
                      ...currentDraft,
                      purpose: event.target.value,
                    }))
                  }
                />

                <label
                  className="dialog-field-label"
                  htmlFor="agreement-confidentiality"
                >
                  Confidentiality boundaries
                </label>
                <textarea
                  id="agreement-confidentiality"
                  className="dialog-confirm-input"
                  rows={2}
                  value={draft.confidentiality}
                  disabled={saving || disabled}
                  onChange={event =>
                    setDraft(currentDraft => ({
                      ...currentDraft,
                      confidentiality: event.target.value,
                    }))
                  }
                />

                <label className="dialog-field-label" htmlFor="agreement-sponsor">
                  Sponsor or organisational involvement
                </label>
                <textarea
                  id="agreement-sponsor"
                  className="dialog-confirm-input"
                  rows={2}
                  value={draft.sponsorInvolvement}
                  disabled={saving || disabled}
                  onChange={event =>
                    setDraft(currentDraft => ({
                      ...currentDraft,
                      sponsorInvolvement: event.target.value,
                    }))
                  }
                />

                <label
                  className="dialog-field-label"
                  htmlFor="agreement-expectation"
                >
                  Expected number or frequency of sessions
                </label>
                <input
                  id="agreement-expectation"
                  className="dialog-confirm-input"
                  value={draft.sessionExpectation}
                  disabled={saving || disabled}
                  onChange={event =>
                    setDraft(currentDraft => ({
                      ...currentDraft,
                      sessionExpectation: event.target.value,
                    }))
                  }
                />

                <label className="dialog-field-label" htmlFor="agreement-review">
                  Review date
                </label>
                <input
                  id="agreement-review"
                  type="date"
                  className="dialog-confirm-input"
                  value={draft.reviewDate}
                  disabled={saving || disabled}
                  onChange={event =>
                    setDraft(currentDraft => ({
                      ...currentDraft,
                      reviewDate: event.target.value,
                    }))
                  }
                />

                <label className="dialog-field-label" htmlFor="agreement-notes">
                  Additional agreement notes
                </label>
                <textarea
                  id="agreement-notes"
                  className="dialog-confirm-input"
                  rows={3}
                  value={draft.notes}
                  disabled={saving || disabled}
                  onChange={event =>
                    setDraft(currentDraft => ({
                      ...currentDraft,
                      notes: event.target.value,
                    }))
                  }
                />

                {error ? (
                  <p className="dialog-error" role="alert">
                    {error}
                  </p>
                ) : null}

                <div className="button-row">
                  <button
                    type="button"
                    className="primary"
                    disabled={saving || disabled}
                    onClick={() => void handleSave()}
                  >
                    {saving ? "Saving…" : "Save agreement"}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={saving}
                    onClick={() => {
                      setDraft(current);
                      setEditing(false);
                      setError("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <dl className="relationship-meta-summary">
                <div>
                  <dt>Status</dt>
                  <dd>{agreementStatusLabel(status)}</dd>
                </div>
                {current.purpose.trim() ? (
                  <div>
                    <dt>Purpose</dt>
                    <dd>{current.purpose}</dd>
                  </div>
                ) : null}
                {current.confidentiality.trim() ? (
                  <div>
                    <dt>Confidentiality</dt>
                    <dd>{current.confidentiality}</dd>
                  </div>
                ) : null}
                {current.sponsorInvolvement.trim() ? (
                  <div>
                    <dt>Sponsor involvement</dt>
                    <dd>{current.sponsorInvolvement}</dd>
                  </div>
                ) : null}
                {current.sessionExpectation.trim() ? (
                  <div>
                    <dt>Session expectation</dt>
                    <dd>{current.sessionExpectation}</dd>
                  </div>
                ) : null}
                {current.reviewDate.trim() ? (
                  <div>
                    <dt>Review date</dt>
                    <dd>{current.reviewDate}</dd>
                  </div>
                ) : null}
                {current.notes.trim() ? (
                  <div>
                    <dt>Notes</dt>
                    <dd>{current.notes}</dd>
                  </div>
                ) : null}
                {!disabled ? (
                  <div className="button-row" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="identity-text-action"
                      onClick={() => {
                        setDraft(current);
                        setEditing(true);
                      }}
                    >
                      Edit agreement
                    </button>
                  </div>
                ) : null}
              </dl>
            )
          ) : null}
        </>
      )}
    </section>
  );
}
