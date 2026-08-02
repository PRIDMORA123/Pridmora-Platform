type PriorityRelationshipRowProps = {
  name: string;
  reason: string;
  status: string;
  actionLabel: string;
  onAction: () => void;
  /** Only the highest-priority item should use primary teal. */
  actionVariant?: "primary" | "secondary";
};

export function PriorityRelationshipRow({
  name,
  reason,
  status,
  actionLabel,
  onAction,
  actionVariant = "primary",
}: PriorityRelationshipRowProps) {
  return (
    <article className="priority-relationship-row">
      <div className="priority-relationship-content">
        <h3>{name}</h3>
        <p className="priority-relationship-reason">{reason}</p>
        <p className="priority-relationship-status">{status}</p>
      </div>

      <button
        type="button"
        className={`identity-button is-${actionVariant} is-md`}
        onClick={onAction}
      >
        {actionLabel}
      </button>
    </article>
  );
}
