"use client";

import { useEffect, useState } from "react";
import type { Session } from "@/lib/types";
import { IntelligenceModeIndicator } from "@/components/coaching-intelligence/intelligence-mode-indicator";
import { ActionButton } from "@/components/feedback/action-button";
import { SaveStatus } from "@/components/feedback/save-status";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import { resolveProductLanguage } from "@/lib/role-language";
import { toActionButtonStatus } from "@/types/action-feedback";
import type {
  CoachingIntelligenceMode,
  IntelligenceSource,
} from "@/types/coaching-intelligence";
import type { ReflectionWorkspaceViewModel } from "@/types/reflection-workspace";
import "@/app/workspace-refinement.css";

function ReflectionQuestion({
  number,
  title,
  guidance,
  value,
  onChange,
  disabled,
}: {
  number: string;
  title: string;
  guidance: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const fieldId = `reflection-${number}`;

  return (
    <section className="reflection-question">
      <div className="reflection-question__number" aria-hidden="true">
        {number}
      </div>

      <div className="reflection-question__content">
        <h2>
          <label htmlFor={fieldId}>{title}</label>
        </h2>
        <p>{guidance}</p>

        <textarea
          id={fieldId}
          value={value}
          disabled={disabled}
          onChange={event => onChange(event.target.value)}
        />
      </div>
    </section>
  );
}

function ContextBlock({ title, content }: { title: string; content: string }) {
  return (
    <section>
      <h3>{title}</h3>
      <p>{content}</p>
    </section>
  );
}

function ContextList({ title, values }: { title: string; values: string[] }) {
  return (
    <section>
      <h3>{title}</h3>
      {values.length > 0 ? (
        <ul>
          {values.map((value, index) => (
            <li key={`${index}-${value}`}>{value}</li>
          ))}
        </ul>
      ) : (
        <p className="identity-empty-copy">None recorded.</p>
      )}
    </section>
  );
}

export function buildReflectionViewModel(
  clientName: string,
  session: Session
): ReflectionWorkspaceViewModel {
  const noteLines = session.notes
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 4);

  const commitments = (session.agreedActions || session.commitments || "")
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);

  return {
    relationshipId: session.clientId,
    conversationId: session.id,
    clientName,
    conversationTitle: session.title || `Conversation ${session.sessionNumber}`,
    date: session.date,
    status: session.status === "completed" ? "completed" : "draft",
    reflection: {
      whatHappened: session.reflectWhatShifted,
      whatStoodOut: session.reflectWhatSurprised,
      whatItMightMean: session.reflectWhatWorked,
      carryForward: session.reflectDifferently,
      privateNotes: session.reflectPrivate,
    },
    context: {
      sessionFocus: session.focus || session.prepPurpose || null,
      coachNoteExtracts: noteLines,
      commitments,
    },
  };
}

export function ReflectWorkspace({
  initialData,
  readOnly = false,
  intelligenceMode = "assisted",
  usedSources = [],
  lastRefreshedAt = null,
  onSave,
  onComplete,
}: {
  initialData: ReflectionWorkspaceViewModel;
  readOnly?: boolean;
  intelligenceMode?: CoachingIntelligenceMode;
  usedSources?: IntelligenceSource[];
  lastRefreshedAt?: string | null;
  onSave: (reflection: ReflectionWorkspaceViewModel["reflection"]) => Promise<void>;
  onComplete: (
    reflection: ReflectionWorkspaceViewModel["reflection"]
  ) => Promise<boolean>;
}) {
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);
  const [values, setValues] = useState(initialData.reflection);
  const { feedback, isLoading, markUnsaved, runAction, reset } =
    useActionFeedback();

  useEffect(() => {
    setValues(initialData.reflection);
    reset();
    // Re-seed when the conversation changes, not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData.conversationId]);

  function updateField(
    field: keyof typeof values,
    value: string
  ) {
    setValues(current => ({ ...current, [field]: value }));
    markUnsaved();
  }

  async function saveReflection() {
    await runAction(() => onSave(values), {
      loadingMessage: "Saving reflection…",
      successMessage: "Reflection saved",
      errorMessage: "Unable to save reflection",
    });
  }

  async function completeReflection() {
    const saved = await runAction(() => onComplete(values), {
      loadingMessage: "Completing reflection…",
      successMessage: "Reflection completed",
      errorMessage: "Unable to complete reflection",
    });

    return Boolean(saved);
  }

  return (
    <main className="reflection-workspace-page">
      <div className="reflection-workspace-page__header">
        <div>
          <p className="identity-section-heading__eyebrow">
            {language.reflectionLabel}
          </p>
          <h1>Notice what matters</h1>
          <p>
            Reflect privately before deciding what should carry forward into the{" "}
            {language.personSingular}’s development record.
          </p>
          <div style={{ marginTop: 12 }}>
            <IntelligenceModeIndicator
              mode={intelligenceMode}
              usedSources={usedSources}
              lastRefreshedAt={lastRefreshedAt}
            />
          </div>
        </div>

        <div className="reflection-workspace-page__status">
          <SaveStatus feedback={feedback} />
        </div>
      </div>

      <div className="reflection-workspace-grid">
        <section className="reflection-editor-card">
          <ReflectionQuestion
            number="01"
            title="What happened?"
            guidance="Capture the important facts and moments without interpreting them yet."
            value={values.whatHappened}
            disabled={readOnly}
            onChange={value => updateField("whatHappened", value)}
          />

          <ReflectionQuestion
            number="02"
            title="What stood out?"
            guidance="Notice changes in energy, language, confidence, emotion or perspective."
            value={values.whatStoodOut}
            disabled={readOnly}
            onChange={value => updateField("whatStoodOut", value)}
          />

          <ReflectionQuestion
            number="03"
            title="What might this mean?"
            guidance="Explore possible significance without turning an early impression into certainty."
            value={values.whatItMightMean}
            disabled={readOnly}
            onChange={value => updateField("whatItMightMean", value)}
          />

          <ReflectionQuestion
            number="04"
            title="What should carry forward?"
            guidance="Identify what may be useful in the next conversation, Journey or development evidence."
            value={values.carryForward}
            disabled={readOnly}
            onChange={value => updateField("carryForward", value)}
          />

          <div className="reflection-private-notes">
            <h2>
              <label htmlFor="reflection-private-notes">
                Private {language.notesLabel.toLowerCase()}
              </label>
            </h2>
            <p>
              These notes remain private and are excluded from shared summaries
              and reports.
            </p>
            <textarea
              id="reflection-private-notes"
              value={values.privateNotes}
              disabled={readOnly}
              onChange={event =>
                updateField("privateNotes", event.target.value)
              }
              placeholder="Record anything useful for your own professional reflection…"
            />
          </div>
        </section>

        <aside className="reflection-context-card">
          <h2>Conversation context</h2>

          <ContextBlock
            title="Session focus"
            content={
              initialData.context.sessionFocus || "No session focus recorded."
            }
          />

          <ContextList
            title="Coach-note extracts"
            values={initialData.context.coachNoteExtracts}
          />

          <ContextList
            title="Agreed commitments"
            values={initialData.context.commitments}
          />

          <div className="reflection-context-card__principle">
            <strong>Evidence before certainty</strong>
            <span>
              Your reflection is private until you deliberately approve something
              for use.
            </span>
          </div>
        </aside>
      </div>

      <footer className="reflection-action-bar">
        <ActionButton
          variant="secondary"
          status={toActionButtonStatus(feedback.status)}
          idleLabel="Save reflection"
          loadingLabel="Saving…"
          successLabel="Saved"
          errorLabel="Try again"
          onClick={() => void saveReflection()}
          disabled={readOnly || isLoading}
        />

        <ActionButton
          status={toActionButtonStatus(feedback.status)}
          idleLabel="Complete reflection"
          loadingLabel="Completing…"
          successLabel="Completed"
          errorLabel="Try again"
          onClick={() => void completeReflection()}
          disabled={readOnly || isLoading}
        />
      </footer>
    </main>
  );
}
