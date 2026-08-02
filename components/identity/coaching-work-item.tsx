export type CoachingWorkItemProps = {
  personName: string;
  context?: string | null;
  state: string;
  stateDescription: string;
  updatedLabel?: string | null;
  actionLabel: string;
  onAction: () => void;
};

export function CoachingWorkItem({
  personName,
  context,
  state,
  stateDescription,
  updatedLabel,
  actionLabel,
  onAction,
}: CoachingWorkItemProps) {
  return (
    <article className="coaching-work-item">
      <div className="coaching-work-item-marker" aria-hidden="true">
        <span />
      </div>

      <div className="coaching-work-item-content">
        <div className="coaching-work-item-title-row">
          <h3>{personName}</h3>
          <span className="coaching-state-label">{state}</span>
        </div>

        {context ? <p className="coaching-work-item-context">{context}</p> : null}

        <p className="coaching-work-item-description">{stateDescription}</p>

        {updatedLabel ? (
          <p className="coaching-work-item-updated">{updatedLabel}</p>
        ) : null}
      </div>

      <button
        type="button"
        className="identity-button identity-button--quiet"
        onClick={onAction}
      >
        {actionLabel}
      </button>
    </article>
  );
}
