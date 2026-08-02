import type { ClientAction } from "@/types/client-action";

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type CommitmentCardProps = {
  action: ClientAction;
  onComplete: (id: string) => void;
  onReopen: (id: string) => void;
  onEdit: (action: ClientAction) => void;
  disabled?: boolean;
};

export function CommitmentCard({
  action,
  onComplete,
  onReopen,
  onEdit,
  disabled = false,
}: CommitmentCardProps) {
  const isCompleted = action.status === "completed";

  return (
    <article
      className={["commitment-card", isCompleted ? "is-completed" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="commitment-card__status"
        aria-label={
          isCompleted ? `Reopen ${action.title}` : `Complete ${action.title}`
        }
        disabled={disabled}
        onClick={() =>
          isCompleted ? onReopen(action.id) : onComplete(action.id)
        }
      >
        {isCompleted ? "✓" : ""}
      </button>

      <div className="commitment-card__content">
        <h3>{action.title}</h3>

        <div className="commitment-card__metadata">
          <span>{action.ownerName}</span>
          {action.dueDate ? <span>Due {formatDate(action.dueDate)}</span> : null}
        </div>

        {action.notes ? <p>{action.notes}</p> : null}
      </div>

      <button
        type="button"
        className="commitment-card__edit"
        disabled={disabled}
        onClick={() => onEdit(action)}
      >
        Edit
      </button>
    </article>
  );
}
