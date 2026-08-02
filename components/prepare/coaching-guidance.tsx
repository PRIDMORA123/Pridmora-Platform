import type { ReactNode } from "react";

export type CoachingGuidanceViewModel = {
  questions: string[];
  approachSummary: string;
  framework: {
    name: string;
    summary: string;
  } | null;
};

function GuidanceSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="guidance-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function FrameworkSummary({
  framework,
}: {
  framework: NonNullable<CoachingGuidanceViewModel["framework"]>;
}) {
  return (
    <div className="guidance-framework">
      <strong>{framework.name}</strong>
      <p>{framework.summary}</p>
      <small>Suggested approach — adapt to your professional judgement.</small>
    </div>
  );
}

export function CoachingGuidance({
  guidance,
  onInsertQuestion,
}: {
  guidance: CoachingGuidanceViewModel;
  onInsertQuestion: (question: string) => void;
}) {
  return (
    <div className="coaching-guidance">
      <p className="context-suggested-note">
        Suggested coaching support based on reviewed evidence. Review before use.
      </p>

      <GuidanceSection title="Suggested questions">
        {guidance.questions.length === 0 ? (
          <p className="muted">
            No suggested questions are available yet. You can still write your
            own in the preparation form.
          </p>
        ) : (
          guidance.questions.map(question => (
            <div className="guidance-question" key={question}>
              <p>{question}</p>
              <button
                type="button"
                aria-label={`Add question to preparation: ${question}`}
                onClick={() => onInsertQuestion(question)}
              >
                Add to preparation
              </button>
            </div>
          ))
        )}
      </GuidanceSection>

      <GuidanceSection title="Useful approach">
        <p>{guidance.approachSummary}</p>
      </GuidanceSection>

      {guidance.framework ? (
        <GuidanceSection title="Relevant framework">
          <FrameworkSummary framework={guidance.framework} />
        </GuidanceSection>
      ) : null}
    </div>
  );
}
