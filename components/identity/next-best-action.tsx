export type NextBestActionProps = {
  personName: string;
  role?: string | null;
  organisation?: string | null;
  eyebrow: string;
  title: string;
  explanation: string;
  evidence?: string | null;
  status: string;
  actionLabel: string;
  onAction: () => void;
  onOpenRelationship?: () => void;
};

export function NextBestAction({
  personName,
  role,
  organisation,
  eyebrow,
  title,
  explanation,
  evidence,
  status,
  actionLabel,
  onAction,
  onOpenRelationship,
}: NextBestActionProps) {
  return (
    <section className="next-best-action" aria-labelledby="next-best-action-title">
      <div className="next-best-action-path" aria-hidden="true" />

      <header className="next-best-action-header">
        <div>
          <p className="next-best-action-eyebrow">{eyebrow}</p>
          <p className="next-best-action-status">{status}</p>
        </div>

        <span className="next-best-action-indicator" aria-hidden="true" />
      </header>

      <div className="next-best-action-body">
        <p className="next-best-action-person">{personName}</p>

        {(role || organisation) && (
          <p className="next-best-action-context">
            {[role, organisation].filter(Boolean).join(" · ")}
          </p>
        )}

        <h2 id="next-best-action-title">{title}</h2>

        <p className="next-best-action-explanation">{explanation}</p>

        {evidence ? (
          <div className="next-best-action-evidence">
            <p className="next-best-action-evidence-label">Why this matters</p>
            <p>{evidence}</p>
          </div>
        ) : null}
      </div>

      <footer className="next-best-action-footer">
        <button
          type="button"
          className="identity-button identity-button--primary"
          onClick={onAction}
        >
          {actionLabel}
        </button>

        {onOpenRelationship ? (
          <button
            type="button"
            className="identity-text-action"
            onClick={onOpenRelationship}
          >
            View relationship
          </button>
        ) : null}
      </footer>
    </section>
  );
}

export function NextBestActionUpToDate({
  onReviewRelationships,
  title,
}: {
  onReviewRelationships: () => void;
  title?: string;
}) {
  return (
    <section
      className="next-best-action next-best-action--calm"
      aria-labelledby="next-best-action-title"
    >
      <div className="next-best-action-path" aria-hidden="true" />

      <header className="next-best-action-header">
        <div>
          <p className="next-best-action-eyebrow">Next best action</p>
          <p className="next-best-action-status">All current work is in hand</p>
        </div>
      </header>

      <div className="next-best-action-body">
        <h2 id="next-best-action-title">
          {title ?? "Your coaching work is up to date"}
        </h2>
        <p className="next-best-action-explanation">
          There are no relationships requiring immediate input. You can review a
          journey, prepare for a future conversation or add a new person.
        </p>
      </div>

      <footer className="next-best-action-footer">
        <button
          type="button"
          className="identity-button identity-button--primary"
          onClick={onReviewRelationships}
        >
          Review relationships
        </button>
      </footer>
    </section>
  );
}
