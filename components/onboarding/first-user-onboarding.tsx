"use client";

import { useEffect, useId, useState } from "react";
import {
  PremiumButton,
  PremiumInlineNotice,
  PremiumInput,
  PremiumPageHeader,
} from "@/components/premium";
import {
  buildFirstUserClientPayload,
  clearFirstUserOnboardingDraft,
  EMPTY_ONBOARDING_DRAFT,
  loadFirstUserOnboardingDraft,
  saveFirstUserOnboardingDraft,
  type FirstUserConversationDraft,
  type FirstUserOnboardingDraft,
  type FirstUserOnboardingStep,
  type FirstUserRelationshipDraft,
} from "@/lib/first-user-onboarding";

export type FirstUserOnboardingResult = {
  clientId: string;
  sessionId: string;
  personName: string;
};

type FirstUserOnboardingProps = {
  userId: string;
  coachId: string;
  /** Start at relationship when launching from empty-home CTA. */
  initialStep?: FirstUserOnboardingStep;
  onDismiss: () => void;
  onFlowActive?: () => void;
  onCreateClient: (fields: {
    name?: string;
    organisation: string;
    role: string;
    currentFocus: string;
    email: string;
    identityMode?: "standard" | "confidential";
    displayLabel?: string;
    aiNameAllowed?: boolean;
  }) => Promise<{ id: string; name: string }>;
  onCreateSession: (input: {
    clientId: string;
    plannedDate: string;
    startTime: string;
    conversationFocus: string;
  }) => Promise<{ id: string }>;
  onPrepare: (result: FirstUserOnboardingResult) => void;
  onViewRelationship: (result: FirstUserOnboardingResult) => void;
};

function stepProgressLabel(step: FirstUserOnboardingStep): string | null {
  switch (step) {
    case "relationship":
      return "Step 1 of 2";
    case "conversation":
      return "Step 2 of 2";
    default:
      return null;
  }
}

export function FirstUserOnboarding({
  userId,
  coachId,
  initialStep = "welcome",
  onDismiss,
  onFlowActive,
  onCreateClient,
  onCreateSession,
  onPrepare,
  onViewRelationship,
}: FirstUserOnboardingProps) {
  const progressId = useId();
  const [draft, setDraft] = useState<FirstUserOnboardingDraft>(() => {
    const saved = loadFirstUserOnboardingDraft(
      typeof window !== "undefined" ? window.sessionStorage : null,
      userId
    );
    if (saved) return saved;
    if (initialStep === "complete") {
      return {
        step: "complete",
        relationship: {
          identityMode: "standard",
          name: "Jordan Lee",
          displayLabel: "",
          role: "",
          organisation: "",
          coachingFocus: "",
        },
        conversation: { ...EMPTY_ONBOARDING_DRAFT.conversation },
        createdClientId: "preview-client",
        createdSessionId: "preview-session",
      };
    }
    return {
      ...EMPTY_ONBOARDING_DRAFT,
      step: initialStep,
      relationship: { ...EMPTY_ONBOARDING_DRAFT.relationship },
      conversation: { ...EMPTY_ONBOARDING_DRAFT.conversation },
    };
  });
  const [nameError, setNameError] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FirstUserOnboardingResult | null>(() => {
    if (initialStep !== "complete") return null;
    return {
      clientId: "preview-client",
      sessionId: "preview-session",
      personName: "Jordan Lee",
    };
  });

  useEffect(() => {
    onFlowActive?.();
    // Retain the onboarding shell for the lifetime of this mount (including completion).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only retain signal
  }, []);

  useEffect(() => {
    saveFirstUserOnboardingDraft(
      typeof window !== "undefined" ? window.sessionStorage : null,
      userId,
      draft
    );
  }, [draft, userId]);

  function updateRelationship(
    patch: Partial<FirstUserRelationshipDraft>
  ) {
    setDraft(current => ({
      ...current,
      relationship: { ...current.relationship, ...patch },
    }));
    if (nameError) setNameError("");
    if (error) setError("");
  }

  function updateConversation(patch: Partial<FirstUserConversationDraft>) {
    setDraft(current => ({
      ...current,
      conversation: { ...current.conversation, ...patch },
    }));
    if (error) setError("");
  }

  function goTo(step: FirstUserOnboardingStep) {
    setError("");
    setDraft(current => ({ ...current, step }));
  }

  function handleContinueFromRelationship() {
    if (draft.relationship.identityMode === "confidential") {
      if (
        !draft.relationship.displayLabel.trim() &&
        !draft.relationship.role.trim()
      ) {
        setNameError("Add a display label or role for this confidential relationship.");
        return;
      }
    } else if (!draft.relationship.name.trim()) {
      setNameError("Person’s name is required.");
      return;
    }
    goTo("conversation");
  }

  async function handleCreateRelationship() {
    if (submitting) return;
    if (!coachId) {
      setError("Your session expired. Please sign in again.");
      return;
    }

    if (draft.relationship.identityMode === "confidential") {
      if (
        !draft.relationship.displayLabel.trim() &&
        !draft.relationship.role.trim()
      ) {
        setNameError("Add a display label or role for this confidential relationship.");
        goTo("relationship");
        return;
      }
    } else if (!draft.relationship.name.trim()) {
      setNameError("Person’s name is required.");
      goTo("relationship");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      let clientId = draft.createdClientId;
      let personName =
        draft.relationship.identityMode === "confidential"
          ? draft.relationship.displayLabel.trim() ||
            draft.relationship.role.trim() ||
            "Confidential relationship"
          : draft.relationship.name.trim();

      if (!clientId) {
        const client = await onCreateClient(
          buildFirstUserClientPayload(draft.relationship)
        );
        clientId = client.id;
        personName = client.name || personName;
        setDraft(current => ({ ...current, createdClientId: clientId }));
      }

      let sessionId = draft.createdSessionId;
      if (!sessionId) {
        const session = await onCreateSession({
          clientId,
          plannedDate: draft.conversation.plannedDate.trim(),
          startTime: draft.conversation.startTime.trim(),
          conversationFocus: draft.conversation.conversationFocus.trim(),
        });
        sessionId = session.id;
        setDraft(current => ({ ...current, createdSessionId: sessionId }));
      }

      const completed: FirstUserOnboardingResult = {
        clientId,
        sessionId,
        personName,
      };
      setResult(completed);
      clearFirstUserOnboardingDraft(
        typeof window !== "undefined" ? window.sessionStorage : null,
        userId
      );
      setDraft(current => ({ ...current, step: "complete" }));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create the relationship. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const step = draft.step;
  const progressLabel = stepProgressLabel(step);

  return (
    <section
      className="first-user-onboarding identity-reveal"
      aria-label="First-user onboarding"
    >
      {progressLabel ? (
        <p className="first-user-onboarding__progress" id={progressId} aria-live="polite">
          {progressLabel}
        </p>
      ) : (
        <span id={progressId} className="sr-only" aria-live="polite" />
      )}

      {step === "welcome" ? (
        <div className="first-user-onboarding__panel">
          <PremiumPageHeader
            eyebrow="Welcome to Pridmora"
            title="Begin your first coaching relationship."
            description="Create the person you are supporting, then schedule your first conversation."
          />
          <ul className="first-user-onboarding__reassure">
            <li>Takes less than a minute.</li>
            <li>You can update the details later.</li>
          </ul>
          <div className="first-user-onboarding__actions">
            <PremiumButton
              variant="primary"
              size="lg"
              onClick={() => goTo("relationship")}
            >
              Get started
            </PremiumButton>
            <PremiumButton variant="secondary" size="lg" onClick={onDismiss}>
              Explore the platform first
            </PremiumButton>
          </div>
        </div>
      ) : null}

      {step === "relationship" ? (
        <div className="first-user-onboarding__panel">
          <PremiumPageHeader
            title="Who are you supporting?"
            description="Choose how identity is managed, then add the essentials. You can enrich the profile later."
          />
          <div className="first-user-onboarding__form">
            <fieldset className="identity-mode-choice identity-mode-choice--onboarding">
              <legend className="dialog-field-label">How would you like to manage identity?</legend>
              <label className="identity-mode-option">
                <input
                  type="radio"
                  name="onboarding-identity-mode"
                  checked={draft.relationship.identityMode === "standard"}
                  onChange={() => updateRelationship({ identityMode: "standard" })}
                />
                <span>
                  <strong>Standard</strong>
                  <span className="identity-mode-option-copy">
                    Store the person’s name and optional contact details.
                  </span>
                </span>
              </label>
              <label className="identity-mode-option">
                <input
                  type="radio"
                  name="onboarding-identity-mode"
                  checked={draft.relationship.identityMode === "confidential"}
                  onChange={() =>
                    updateRelationship({ identityMode: "confidential", name: "" })
                  }
                />
                <span>
                  <strong>
                    Confidential{" "}
                    <span className="identity-mode-recommended">
                      Recommended for sensitive coaching
                    </span>
                  </strong>
                  <span className="identity-mode-option-copy">
                    Use a confidential reference and keep private identity separate.
                  </span>
                </span>
              </label>
            </fieldset>

            {draft.relationship.identityMode === "standard" ? (
              <PremiumInput
                label="Person’s name"
                name="personName"
                autoComplete="name"
                value={draft.relationship.name}
                onChange={event => updateRelationship({ name: event.target.value })}
                error={nameError}
                required
                autoFocus
              />
            ) : (
              <PremiumInput
                label="Display label"
                name="displayLabel"
                value={draft.relationship.displayLabel}
                onChange={event =>
                  updateRelationship({ displayLabel: event.target.value })
                }
                error={nameError}
                autoFocus
              />
            )}
            <PremiumInput
              label="Role"
              name="role"
              optional
              autoComplete="organization-title"
              value={draft.relationship.role}
              onChange={event => updateRelationship({ role: event.target.value })}
            />
            <PremiumInput
              label="Organisation"
              name="organisation"
              optional
              autoComplete="organization"
              value={draft.relationship.organisation}
              onChange={event =>
                updateRelationship({ organisation: event.target.value })
              }
            />
            <PremiumInput
              label="Coaching focus"
              name="coachingFocus"
              optional
              value={draft.relationship.coachingFocus}
              onChange={event =>
                updateRelationship({ coachingFocus: event.target.value })
              }
            />
          </div>
          {error ? (
            <PremiumInlineNotice tone="error">{error}</PremiumInlineNotice>
          ) : null}
          <div className="first-user-onboarding__actions">
            <PremiumButton
              variant="primary"
              size="lg"
              onClick={handleContinueFromRelationship}
            >
              Continue
            </PremiumButton>
            <PremiumButton
              variant="secondary"
              size="lg"
              onClick={() => goTo("welcome")}
            >
              Back
            </PremiumButton>
          </div>
        </div>
      ) : null}

      {step === "conversation" ? (
        <div className="first-user-onboarding__panel">
          <PremiumPageHeader
            title="Schedule the first conversation."
            description="Date, time and focus are optional — you can set them later."
          />
          <div className="first-user-onboarding__session-label">Session 1</div>
          <div className="first-user-onboarding__form">
            <PremiumInput
              label="Planned date"
              name="plannedDate"
              type="date"
              optional
              value={draft.conversation.plannedDate}
              onChange={event =>
                updateConversation({ plannedDate: event.target.value })
              }
            />
            <PremiumInput
              label="Start time"
              name="startTime"
              type="time"
              optional
              value={draft.conversation.startTime}
              onChange={event =>
                updateConversation({ startTime: event.target.value })
              }
            />
            <PremiumInput
              label="Conversation focus"
              name="conversationFocus"
              optional
              value={draft.conversation.conversationFocus}
              onChange={event =>
                updateConversation({ conversationFocus: event.target.value })
              }
            />
          </div>
          {error ? (
            <PremiumInlineNotice tone="error">{error}</PremiumInlineNotice>
          ) : null}
          <div className="first-user-onboarding__actions">
            <PremiumButton
              variant="primary"
              size="lg"
              disabled={submitting}
              aria-busy={submitting}
              onClick={() => {
                void handleCreateRelationship();
              }}
            >
              {submitting ? "Creating relationship…" : "Create relationship"}
            </PremiumButton>
            <PremiumButton
              variant="secondary"
              size="lg"
              disabled={submitting}
              onClick={() => goTo("relationship")}
            >
              Back
            </PremiumButton>
          </div>
        </div>
      ) : null}

      {step === "complete" && result ? (
        <div className="first-user-onboarding__panel">
          <PremiumPageHeader
            title="Your first relationship is ready."
            description="Pridmora can now help you prepare, capture meaningful evidence and reveal development over time."
          />
          <PremiumInlineNotice tone="success">
            {result.personName} is set up with Session 1.
          </PremiumInlineNotice>
          <div className="first-user-onboarding__actions">
            <PremiumButton
              variant="primary"
              size="lg"
              onClick={() => onPrepare(result)}
            >
              Prepare for conversation
            </PremiumButton>
            <PremiumButton
              variant="secondary"
              size="lg"
              onClick={() => onViewRelationship(result)}
            >
              View relationship
            </PremiumButton>
          </div>
        </div>
      ) : null}
    </section>
  );
}
