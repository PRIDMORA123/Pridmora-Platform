"use client";

import { useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/feedback/action-button";
import { JourneyNextStep } from "@/components/coaching-journey/journey-next-step";
import { StagePrimaryAction } from "@/components/coaching-journey/stage-primary-action";
import { SessionSaveStatus } from "@/components/session/session-save-status";
import { SessionErrorMessage } from "@/components/session/session-error-message";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { hasMinimumDebriefEvidence } from "@/lib/session/session-guards";
import type { CreateSummaryInsightsPhase } from "@/lib/session/create-summary-insights-flow";
import { serialiseError } from "@/lib/api-client";
import { toActionButtonStatus } from "@/types/action-feedback";
import type { Session } from "@/lib/types";

export type SessionDebriefValues = {
  narrative: string;
  commitment: string;
  privateReminder: string;
  /** Optional follow-up note — stored in reflectDifferently. */
  followUp: string;
  noCommitmentAgreed: boolean;
};

export type SessionDebriefFormProps = {
  session: Session;
  readOnly?: boolean;
  onSave: (values: SessionDebriefValues) => Promise<Session | void>;
  onCreateSummary: (
    values: SessionDebriefValues,
    options?: { onPhase?: (phase: CreateSummaryInsightsPhase) => void }
  ) => Promise<boolean>;
};

function sessionToDebriefValues(session: Session): SessionDebriefValues {
  const narrative = [
    session.reflectWhatSurprised,
    session.reflectWhatShifted,
    session.reflectWhatWorked,
  ]
    .map(value => value.trim())
    .filter(Boolean)
    .join("\n\n");

  const commitment = (session.commitments || session.agreedActions || "").trim();
  const noCommitment =
    /no commitment was agreed/i.test(commitment) ||
    (/^none$/i.test(commitment) && commitment.length < 12);

  return {
    narrative:
      narrative ||
      [
        session.reflectWhatSurprised,
        session.reflectWhatShifted,
        session.reflectWhatWorked,
      ].find(Boolean) ||
      "",
    commitment: noCommitment ? "" : commitment,
    privateReminder: session.reflectPrivate || session.reflection || "",
    followUp: session.reflectDifferently?.trim() || "",
    noCommitmentAgreed: noCommitment,
  };
}

function phaseLoadingLabel(phase: CreateSummaryInsightsPhase): string {
  switch (phase) {
    case "saving":
      return "Saving notes…";
    case "generating":
      return "Creating Summary & Insights…";
    case "opening":
      return "Opening Summary & Insights…";
    default:
      return "Creating…";
  }
}

/**
 * Post-conversation outcome capture on Session Notes.
 * Fields are continuous — not separate page-level cards.
 */
export function SessionDebriefForm({
  session,
  readOnly = false,
  onSave,
  onCreateSummary,
}: SessionDebriefFormProps) {
  const [values, setValues] = useState(() => sessionToDebriefValues(session));
  const [error, setError] = useState("");
  const [errorKind, setErrorKind] = useState<"save" | "generate" | "">("");
  const [phase, setPhase] = useState<CreateSummaryInsightsPhase>("idle");
  const generatingRef = useRef(false);
  const { feedback, isLoading, markUnsaved, runAction, reset } =
    useActionFeedback();

  useEffect(() => {
    setValues(sessionToDebriefValues(session));
    reset();
    setError("");
    setErrorKind("");
    setPhase("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  function updateField<K extends keyof SessionDebriefValues>(
    field: K,
    value: SessionDebriefValues[K]
  ) {
    setValues(current => ({ ...current, [field]: value }));
    markUnsaved();
    setError("");
    setErrorKind("");
  }

  async function saveDebrief() {
    setError("");
    setErrorKind("");
    return runAction(() => onSave(values), {
      loadingMessage: "Saving…",
      successMessage: "Notes saved",
      errorMessage: "Unable to save",
      onError: err => {
        console.error("Session notes save failed", {
          operation: "save_session_notes",
          sessionId: session.id,
          relationshipId: session.clientId,
          ...serialiseError(err),
        });
        setErrorKind("save");
        setError(
          "Session notes could not be saved. Your text remains available."
        );
      },
    });
  }

  async function createSummary() {
    if (generatingRef.current || isLoading || phase !== "idle") return;
    generatingRef.current = true;
    setError("");
    setErrorKind("");

    const hasLocalEvidence =
      values.narrative.trim() ||
      values.commitment.trim() ||
      values.noCommitmentAgreed ||
      hasMinimumDebriefEvidence(session);

    if (!hasLocalEvidence) {
      setError(
        "Capture at least what stood out, what was agreed, or confirm that no commitment was agreed before creating the summary."
      );
      generatingRef.current = false;
      return;
    }

    if (!session.id) {
      setError("Cannot create Summary & Insights without a session ID.");
      generatingRef.current = false;
      return;
    }

    setPhase("saving");

    await runAction(
      async () => {
        const ok = await onCreateSummary(values, {
          onPhase: next => {
            setPhase(next);
          },
        });
        if (!ok) {
          throw new Error("Summary generation did not complete");
        }
        return true;
      },
      {
        loadingMessage: phaseLoadingLabel(phase === "idle" ? "saving" : phase),
        successMessage: "Summary draft ready",
        errorMessage: "Unable to create summary",
        onError: err => {
          const code =
            err && typeof err === "object" && "code" in err
              ? String((err as { code?: string }).code ?? "")
              : "";
          console.error("Summary & Insights generation failed", {
            operation: "create_summary_insights",
            sessionId: session.id,
            relationshipId: session.clientId,
            code,
            ...serialiseError(err),
          });
          if (code === "save_failed") {
            setErrorKind("save");
            setError(
              "Session notes could not be saved. Your text remains available."
            );
          } else {
            setErrorKind("generate");
            setError(
              "Summary & Insights could not be created. Your session notes remain saved and unchanged."
            );
          }
        },
      }
    );

    setPhase("idle");
    generatingRef.current = false;
  }

  const busy = readOnly || isLoading || phase !== "idle";
  const createLoadingLabel = phaseLoadingLabel(
    phase === "idle" ? "generating" : phase
  );

  return (
    <div className="session-debrief-form session-debrief-form--plain">
      <div className="session-debrief-form__status">
        <SessionSaveStatus feedback={feedback} />
      </div>

      {error ? (
        <div className="session-debrief-form__error-block">
          <SessionErrorMessage
            message={error}
            onRetry={
              errorKind === "generate" || errorKind === "save"
                ? () => {
                    void createSummary();
                  }
                : undefined
            }
          />
          {errorKind === "generate" ? (
            <div className="button-row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="identity-button secondary"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setErrorKind("");
                }}
              >
                Continue without summary
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="session-debrief-form__workspace">
        <p className="session-debrief-form__lead">
          What changed or mattered?
        </p>
        <p className="session-debrief-form__hint session-debrief-form__hint--lead">
          Capture only what matters. You do not need a transcript.
        </p>
        <label className="session-debrief-form__field">
          <span className="session-debrief-form__label">What changed or mattered</span>
          <textarea
            className="session-debrief-form__textarea session-debrief-form__textarea--stood-out"
            rows={6}
            disabled={busy}
            value={values.narrative}
            onChange={event => updateField("narrative", event.target.value)}
            placeholder="What shifted, surprised you, or is worth carrying forward…"
          />
        </label>

        <details className="session-debrief-form__optional">
          <summary>Optional notes</summary>
          <div className="session-debrief-form__optional-body">
            <label className="session-debrief-form__field session-debrief-form__field--commitment">
              <span className="session-debrief-form__label">Actions / commitments</span>
              <span className="session-debrief-form__hint">
                Record any specific action or commitment agreed to carry forward.
              </span>
              <textarea
                className="session-debrief-form__textarea session-debrief-form__textarea--agreed"
                rows={4}
                disabled={busy || values.noCommitmentAgreed}
                value={values.commitment}
                onChange={event => updateField("commitment", event.target.value)}
                placeholder="What the client agreed to do…"
              />
            </label>

            <label className="session-debrief-form__check">
              <input
                type="checkbox"
                checked={values.noCommitmentAgreed}
                disabled={busy}
                onChange={event => {
                  const checked = event.target.checked;
                  if (checked && values.commitment.trim()) {
                    const confirmed = window.confirm(
                      "Clear the commitment text? No commitment record will be created."
                    );
                    if (!confirmed) return;
                    updateField("commitment", "");
                  }
                  updateField("noCommitmentAgreed", checked);
                }}
              />
              <span>No commitment was agreed</span>
            </label>

            <label className="session-debrief-form__field is-private">
              <span className="session-debrief-form__label">Private reflection</span>
              <textarea
                className="session-debrief-form__textarea session-debrief-form__textarea--private"
                rows={4}
                disabled={busy}
                value={values.privateReminder}
                onChange={event =>
                  updateField("privateReminder", event.target.value)
                }
                placeholder="Visible only to you…"
              />
            </label>

            <label className="session-debrief-form__field">
              <span className="session-debrief-form__label">
                Follow-up, optional
              </span>
              <textarea
                className="session-debrief-form__textarea session-debrief-form__textarea--follow-up"
                rows={3}
                disabled={busy}
                value={values.followUp}
                onChange={event => updateField("followUp", event.target.value)}
                placeholder="Anything to carry into the next conversation…"
              />
            </label>
          </div>
        </details>
      </div>

      <JourneyNextStep
        now="Capture complete"
        next="Generate Development Update"
      />

      <StagePrimaryAction>
        <ActionButton
          status={toActionButtonStatus(feedback.status)}
          idleLabel="Generate Development Update"
          loadingLabel={createLoadingLabel}
          successLabel="Ready to review"
          errorLabel="Try again"
          disabled={busy}
          onClick={() => {
            void createSummary();
          }}
        />
        <ActionButton
          variant="secondary"
          status={toActionButtonStatus(feedback.status)}
          idleLabel="Save notes only"
          loadingLabel="Saving…"
          successLabel="Saved"
          errorLabel="Try again"
          disabled={busy}
          onClick={() => {
            void saveDebrief();
          }}
        />
      </StagePrimaryAction>
    </div>
  );
}

/** Map debrief UI values onto persisted session reflection fields. */
export function applyDebriefValuesToSession(
  session: Session,
  values: SessionDebriefValues
): Session {
  // Persist an explicit no-commitment marker so reload restores checkbox state.
  // Do not invent a blank actionable commitment.
  const commitmentText = values.noCommitmentAgreed
    ? "No commitment was agreed"
    : values.commitment.trim();

  return {
    ...session,
    reflectWhatSurprised: values.narrative.trim(),
    reflectWhatShifted: session.reflectWhatShifted,
    reflectWhatWorked: session.reflectWhatWorked,
    reflectDifferently: values.followUp.trim(),
    reflectPrivate: values.privateReminder.trim(),
    reflection: values.privateReminder.trim(),
    commitments: commitmentText,
    agreedActions: values.noCommitmentAgreed
      ? ""
      : commitmentText || session.agreedActions,
  };
}
