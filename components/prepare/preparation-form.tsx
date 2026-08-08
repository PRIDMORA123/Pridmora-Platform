"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { PreparationIntelligenceViewModel } from "@/lib/preparation-intelligence";
import {
  normalisePreparation,
  sanitisePreparationFormValues,
  type PreparationFormValues,
} from "@/lib/preparation-intelligence";
import type { Session } from "@/lib/types";
import { ActionButton } from "@/components/feedback/action-button";
import { SaveStatus } from "@/components/feedback/save-status";
import { useToast } from "@/components/feedback/toast-provider";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { toActionButtonStatus } from "@/types/action-feedback";

function splitTopics(value: string): string[] {
  return value
    .split(/\r?\n|;/)
    .map(item => item.trim())
    .filter(Boolean);
}

function joinTopics(topics: string[]): string {
  return topics.join("\n");
}

function splitQuestions(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const byParagraph = trimmed
    .split(/\n\s*\n/)
    .map(item => item.trim())
    .filter(Boolean);

  if (byParagraph.length > 1) return byParagraph;

  const byLine = trimmed
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean);

  if (byLine.length > 1 && byLine.every(line => line.endsWith("?"))) {
    return byLine;
  }

  return [trimmed];
}

function joinQuestions(questions: string[]): string {
  return questions.map(item => item.trim()).filter(Boolean).join("\n\n");
}

function preparationValuesEqual(
  a: PreparationFormValues,
  b: PreparationFormValues
): boolean {
  return (
    a.purpose === b.purpose &&
    a.topics === b.topics &&
    a.questions === b.questions &&
    a.desiredOutcome === b.desiredOutcome &&
    a.privateNotes === b.privateNotes
  );
}

function looksLikeQuestion(value: string): boolean {
  const cleaned = value.trim();
  return (
    cleaned.endsWith("?") ||
    /^(what|how|why|when|where|who|which)\b/i.test(cleaned)
  );
}

function PrepareFormSection({
  title,
  helper,
  children,
  labelId,
}: {
  title: string;
  helper: string;
  children: ReactNode;
  labelId?: string;
}) {
  return (
    <section className="prepare-form-section">
      <div className="prepare-form-section__intro">
        <h3 id={labelId}>{title}</h3>
        <p>{helper}</p>
      </div>
      <div className="prepare-form-section__field">{children}</div>
    </section>
  );
}

function TopicPillEditor({
  topics,
  suggestions,
  disabled,
  onChange,
}: {
  topics: string[];
  suggestions: string[];
  disabled?: boolean;
  onChange: (topics: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function addTopic(raw: string) {
    const cleaned = raw.trim();
    if (!cleaned || looksLikeQuestion(cleaned)) return;

    if (topics.some(topic => topic.toLowerCase() === cleaned.toLowerCase())) {
      return;
    }

    onChange([...topics, cleaned]);
  }

  function submitDraft() {
    if (!draft.trim()) return;
    addTopic(draft);
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      submitDraft();
    }
  }

  const availableSuggestions = suggestions.filter(
    suggestion =>
      !looksLikeQuestion(suggestion) &&
      !topics.some(topic => topic.toLowerCase() === suggestion.toLowerCase())
  );

  return (
    <>
      <div className="prepare-topic-list" aria-describedby="preparation-topics-helper">
        {topics.map(topic => (
          <span key={topic} className="prepare-topic-pill">
            <span>{topic}</span>
            <button
              type="button"
              className="prepare-topic-pill__remove"
              aria-label={`Remove topic ${topic}`}
              disabled={disabled}
              onClick={() => onChange(topics.filter(item => item !== topic))}
            >
              ×
            </button>
          </span>
        ))}

        <input
          id="preparation-topics-input"
          value={draft}
          disabled={disabled}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={submitDraft}
          placeholder={
            topics.length ? "Add another area…" : "Add an area to explore…"
          }
          className="prepare-topic-input"
          aria-labelledby="preparation-topics-heading"
        />
      </div>

      <span id="preparation-topics-helper" className="sr-only">
        Keep the agenda focused but flexible.
      </span>

      {availableSuggestions.length > 0 ? (
        <div className="prepare-topic-suggestions">
          <span className="prepare-topic-suggestions__label">From the brief</span>
          {availableSuggestions.slice(0, 4).map(suggestion => (
            <button
              key={suggestion}
              type="button"
              className="prepare-topic-suggestion"
              disabled={disabled}
              onClick={() => addTopic(suggestion)}
            >
              Add {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

function QuestionListEditor({
  questions,
  suggestions,
  disabled,
  onChange,
}: {
  questions: string[];
  suggestions: string[];
  disabled?: boolean;
  onChange: (questions: string[]) => void;
}) {
  const unusedSuggestions = suggestions.filter(
    suggestion =>
      !questions.some(
        question =>
          question.trim().toLowerCase() === suggestion.trim().toLowerCase()
      )
  );

  return (
    <>
      <div
        className="prepare-question-list"
        role="group"
        aria-labelledby="preparation-questions-heading"
      >
        {questions.map((question, index) => (
          <div key={`question-${index}`} className="prepare-question-row">
            <span className="prepare-question-row__number" aria-hidden="true">
              {index + 1}
            </span>
            <div className="prepare-question-row__field">
              <textarea
                value={question}
                disabled={disabled}
                rows={2}
                aria-label={`Coaching question ${index + 1}`}
                onChange={event => {
                  const next = [...questions];
                  next[index] = event.target.value;
                  onChange(next);
                }}
              />
            </div>
            <button
              type="button"
              className="prepare-question-row__remove identity-text-action"
              disabled={disabled}
              aria-label={`Remove question ${index + 1}`}
              onClick={() =>
                onChange(questions.filter((_, itemIndex) => itemIndex !== index))
              }
            >
              Remove
            </button>
          </div>
        ))}

        <button
          type="button"
          className="identity-button identity-button--secondary is-sm"
          disabled={disabled}
          onClick={() => onChange([...questions, ""])}
        >
          Add question
        </button>
      </div>

      {unusedSuggestions.length > 0 ? (
        <div className="prepare-question-suggestions">
          <p className="prepare-eyebrow">Suggested questions</p>
          <ul>
            {unusedSuggestions.map(suggestion => (
              <li key={suggestion}>
                <span>{suggestion}</span>
                <button
                  type="button"
                  className="identity-text-action"
                  disabled={disabled}
                  aria-label={`Add question: ${suggestion}`}
                  onClick={() => onChange([...questions, suggestion])}
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

export function PreparationForm({
  initialPreparation,
  intelligence,
  suggestedTopics = [],
  disabled,
  onSave,
  onValuesChange,
  onCancel,
  insertedNotice,
  refinementMode = false,
}: {
  conversationId: string;
  initialPreparation: Pick<
    Session,
    | "prepPurpose"
    | "prepTopics"
    | "prepQuestions"
    | "prepRisks"
    | "prepPrivateNotes"
    | "focus"
  >;
  intelligence: PreparationIntelligenceViewModel;
  suggestedTopics?: string[];
  disabled?: boolean;
  onSave: (values: PreparationFormValues) => Promise<void>;
  onValuesChange?: (values: PreparationFormValues) => void;
  onCancel?: () => void;
  insertedNotice?: string;
  /** Compact refinement fields only — no draft cards or Start conversation. */
  refinementMode?: boolean;
}) {
  // Seed is expected to already be normalised by PrepareSessionView.
  const [values, setValues] = useState<PreparationFormValues>(() =>
    sanitisePreparationFormValues(normalisePreparation(initialPreparation))
  );
  const [saveError, setSaveError] = useState("");
  const [statusNotice, setStatusNotice] = useState("");
  const { feedback, isLoading, runAction, markUnsaved, reset } =
    useActionFeedback();
  const { showToast } = useToast();

  const preparationSeedKey = [
    initialPreparation.prepPurpose,
    initialPreparation.prepTopics,
    initialPreparation.prepQuestions,
    initialPreparation.prepRisks,
    initialPreparation.prepPrivateNotes,
    initialPreparation.focus,
  ].join("\u0001");

  const initialValues = useMemo(
    () =>
      sanitisePreparationFormValues(normalisePreparation(initialPreparation)),
    [preparationSeedKey, initialPreparation]
  );

  useEffect(() => {
    setValues(
      sanitisePreparationFormValues(normalisePreparation(initialPreparation))
    );
    reset();
    setSaveError("");
    setStatusNotice("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preparationSeedKey]);

  const topics = useMemo(() => splitTopics(values.topics), [values.topics]);
  const questions = useMemo(
    () => splitQuestions(values.questions),
    [values.questions]
  );

  const topicSuggestions = useMemo(() => {
    const fromProp = suggestedTopics.filter(
      topic => topic.trim() && !looksLikeQuestion(topic)
    );
    const fromFocus =
      intelligence.suggestedFocus &&
      !looksLikeQuestion(intelligence.suggestedFocus)
        ? [intelligence.suggestedFocus]
        : [];
    return Array.from(new Set([...fromProp, ...fromFocus]));
  }, [suggestedTopics, intelligence.suggestedFocus]);

  function updateField<K extends keyof PreparationFormValues>(
    key: K,
    value: PreparationFormValues[K]
  ) {
    // Never call parent setters inside a setState updater — that updates
    // PrepareSessionView while PreparationForm is rendering.
    const next = { ...values, [key]: value };
    setValues(next);
    onValuesChange?.(next);
    markUnsaved();
    setSaveError("");
    setStatusNotice("");
  }

  async function savePreparation() {
    if (isLoading) return;

    if (preparationValuesEqual(values, initialValues)) {
      reset();
      setSaveError("");
      setStatusNotice("No preparation changes to save.");
      window.setTimeout(() => {
        setStatusNotice(current =>
          current === "No preparation changes to save." ? "" : current
        );
      }, 4000);
      return;
    }

    setStatusNotice("");
    setSaveError("");

    await runAction(() => onSave(values), {
      loadingMessage: "Saving preparation…",
      successMessage: "All changes saved",
      errorMessage: "Unable to save preparation",
      onSuccess: () => {
        setSaveError("");
        showToast({
          type: "success",
          title: "Preparation saved",
        });
      },
      onError: error => {
        console.error("Save preparation failed", error);
        const message =
          error instanceof Error && error.message.trim()
            ? error.message
            : "Preparation could not be saved. Your changes remain on screen. Please try again.";
        setSaveError(message);
        showToast({
          type: "error",
          title: "Preparation could not be saved",
          description: message,
          durationMs: 8000,
        });
      },
    });
  }

  function handleCancel() {
    setValues(
      sanitisePreparationFormValues(normalisePreparation(initialPreparation))
    );
    reset();
    onCancel?.();
  }

  return (
    <section
      className={
        refinementMode
          ? "preparation-form-panel preparation-form-panel--refinement"
          : "preparation-form-panel prepare-coach-card"
      }
    >
      {!refinementMode ? (
        <header className="prepare-coach-card__header">
          <div>
            <p className="prepare-eyebrow">Session brief</p>
            <h2>Focus, questions and notes</h2>
            <p className="prepare-form__supporting-copy">
              Your session brief is ready to use. Edit these fields only if you
              want to adjust them before starting the conversation.
            </p>
          </div>

          <div className="prepare-coach-card__save">
            <SaveStatus feedback={feedback} />
            {statusNotice ? (
              <span className="identity-save-status is-success" role="status">
                <span className="identity-save-status-mark" aria-hidden="true" />
                <span>{statusNotice}</span>
              </span>
            ) : null}
            <ActionButton
              variant="primary"
              status={toActionButtonStatus(feedback.status)}
              idleLabel="Save preparation"
              loadingLabel="Saving…"
              successLabel="Saved"
              errorLabel="Try again"
              onClick={() => void savePreparation()}
              disabled={disabled || isLoading}
            />
          </div>
        </header>
      ) : null}

      <div className="prepare-form">
        {insertedNotice ? (
          <p className="prepare-insert-notice" role="status" aria-live="polite">
            {insertedNotice}
          </p>
        ) : null}

        {saveError ? (
          <div className="session-debrief-form__error-block" role="alert">
            <p className="report-inline-error">{saveError}</p>
            <button
              type="button"
              className="identity-text-action"
              onClick={() => setSaveError("")}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <PrepareFormSection
          title={refinementMode ? "Purpose or primary focus" : "Purpose"}
          helper="What would make this conversation worthwhile?"
        >
          <textarea
            id="preparation-purpose"
            className="prepare-form-control"
            value={values.purpose}
            disabled={disabled}
            rows={4}
            aria-label="Purpose or primary focus"
            onChange={event => updateField("purpose", event.target.value)}
          />
        </PrepareFormSection>

        {!refinementMode ? (
          <PrepareFormSection
            title="Desired outcome"
            helper="What would you like the client to leave with?"
          >
            <textarea
              id="preparation-outcome"
              className="prepare-form-control"
              value={values.desiredOutcome}
              disabled={disabled}
              rows={4}
              aria-label="Desired outcome"
              onChange={event =>
                updateField("desiredOutcome", event.target.value)
              }
            />
          </PrepareFormSection>
        ) : null}

        <PrepareFormSection
          title="Areas to explore"
          helper="Keep the agenda focused but flexible."
          labelId="preparation-topics-heading"
        >
          <TopicPillEditor
            topics={topics}
            suggestions={topicSuggestions}
            disabled={disabled}
            onChange={nextTopics => updateField("topics", joinTopics(nextTopics))}
          />
        </PrepareFormSection>

        <PrepareFormSection
          title="Questions"
          helper="Prepare prompts, not a script."
          labelId="preparation-questions-heading"
        >
          <QuestionListEditor
            questions={questions}
            suggestions={intelligence.suggestedQuestions}
            disabled={disabled}
            onChange={nextQuestions =>
              updateField("questions", joinQuestions(nextQuestions))
            }
          />
        </PrepareFormSection>

        <PrepareFormSection
          title={
            refinementMode ? "Private preparation note" : "Coach reminders"
          }
          helper="Private and optional"
        >
          <textarea
            id="preparation-private-notes"
            className="prepare-form-control prepare-form-control--tall"
            value={values.privateNotes}
            disabled={disabled}
            rows={5}
            aria-label="Private preparation note"
            onChange={event => updateField("privateNotes", event.target.value)}
          />
        </PrepareFormSection>

        {refinementMode ? (
          <div className="preparation-form-panel__refinement-actions">
            <SaveStatus feedback={feedback} />
            <ActionButton
              variant="primary"
              status={toActionButtonStatus(feedback.status)}
              idleLabel="Save changes"
              loadingLabel="Saving…"
              successLabel="Saved"
              errorLabel="Try again"
              onClick={() => void savePreparation()}
              disabled={disabled || isLoading}
            />
            <button
              type="button"
              className="identity-button is-secondary identity-button--secondary"
              onClick={handleCancel}
              disabled={disabled || isLoading}
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Retained for any callers that still import the simple field helper. */
export function PreparationField({
  id,
  label,
  helper,
  value,
  onChange,
  disabled,
  rows = 4,
}: {
  id: string;
  label: string;
  helper: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  rows?: number;
}) {
  const helperId = `${id}-helper`;

  return (
    <PrepareFormSection title={label} helper={helper}>
      <textarea
        id={id}
        className="prepare-form-control"
        value={value}
        disabled={disabled}
        aria-describedby={helperId}
        onChange={event => onChange(event.target.value)}
        rows={rows}
      />
      <span id={helperId} className="sr-only">
        {helper}
      </span>
    </PrepareFormSection>
  );
}
