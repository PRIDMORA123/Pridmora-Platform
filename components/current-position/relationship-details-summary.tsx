"use client";

import { useState } from "react";
import { AgreementBoundariesSection } from "@/components/journey/agreement-boundaries-section";
import { InitialConversationSection } from "@/components/journey/initial-conversation-section";
import {
  agreementStatusLabel,
  EMPTY_AGREEMENT,
  EMPTY_INITIAL_CONVERSATION,
  INITIAL_OUTCOME_LABELS,
  type InitialConversation,
  type RelationshipAgreement,
  type SupportingContextItem,
} from "@/lib/relationship-meta";
import { formatSupportingContextSummary } from "@/lib/coaching-journey";

export type RelationshipDetailsSummaryModel = {
  agreement: RelationshipAgreement;
  initialConversation: InitialConversation;
  supportingContext: SupportingContextItem[];
  reviewPoint?: string | null;
};

export function RelationshipDetailsSummary({
  details,
  disabled = false,
  onSaveAgreement,
  onSaveInitialConversation,
  onOpenDevelopment,
}: {
  details: RelationshipDetailsSummaryModel;
  disabled?: boolean;
  onSaveAgreement: (next: RelationshipAgreement) => Promise<void>;
  onSaveInitialConversation: (next: InitialConversation) => Promise<void>;
  onOpenDevelopment?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const agreementLabel = agreementStatusLabel(details.agreement.status);
  const initialLabel = details.initialConversation.recorded
    ? INITIAL_OUTCOME_LABELS[details.initialConversation.outcome]
    : "Not recorded";
  const contextLabel = formatSupportingContextSummary(details.supportingContext);
  const reviewLabel = details.reviewPoint?.trim() || "Not set";

  return (
    <section
      className="identity-relationship-details identity-relationship-details--utility"
      aria-labelledby="relationship-details-title"
    >
      <header className="identity-relationship-details__header">
        <h2 id="relationship-details-title">Relationship details</h2>
        <button
          type="button"
          className="identity-text-action"
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
        >
          {open ? "Hide" : "Show"}
        </button>
      </header>

      {open ? (
        <>
          <div className="identity-relationship-details__grid">
            <div>
              <p className="identity-current-position__label">
                Agreement and boundaries
              </p>
              <p className="identity-current-position__value">{agreementLabel}</p>
            </div>
            <div>
              <p className="identity-current-position__label">
                Initial conversation
              </p>
              <p className="identity-current-position__value">{initialLabel}</p>
            </div>
            <div>
              <p className="identity-current-position__label">Supporting context</p>
              <p className="identity-current-position__value">{contextLabel}</p>
            </div>
            <div>
              <p className="identity-current-position__label">Review point</p>
              <p className="identity-current-position__value">{reviewLabel}</p>
            </div>
          </div>

          <div className="button-row identity-relationship-details__actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setManageOpen(value => !value)}
            >
              {manageOpen ? "Close relationship details" : "Manage relationship details"}
            </button>
            {onOpenDevelopment ? (
              <button
                type="button"
                className="secondary"
                onClick={onOpenDevelopment}
              >
                View supporting context
              </button>
            ) : null}
          </div>

          {manageOpen ? (
            <div className="identity-relationship-details__manage">
              <AgreementBoundariesSection
                agreement={details.agreement ?? EMPTY_AGREEMENT}
                disabled={disabled}
                onSave={onSaveAgreement}
              />
              <InitialConversationSection
                initialConversation={
                  details.initialConversation ?? EMPTY_INITIAL_CONVERSATION
                }
                disabled={disabled}
                onSave={onSaveInitialConversation}
              />
            </div>
          ) : null}
        </>
      ) : (
        <p className="identity-relationship-details__collapsed">
          Agreement · Initial conversation · Supporting context · Review point
        </p>
      )}
    </section>
  );
}
