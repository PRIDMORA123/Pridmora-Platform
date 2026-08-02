import type { RelationshipPrimaryAction } from "@/lib/coaching-journey";

export function CoachingNextAction({
  action,
  onAction,
  secondaryLabel,
  onSecondary,
}: {
  action: RelationshipPrimaryAction | null;
  onAction?: (action: RelationshipPrimaryAction) => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  if (!action) return null;

  return (
    <div className="identity-coaching-next-action">
      <button
        type="button"
        className="primary identity-coaching-next-action__primary"
        onClick={() => onAction?.(action)}
      >
        {action.label}
      </button>
      {secondaryLabel && onSecondary ? (
        <button
          type="button"
          className="secondary"
          onClick={onSecondary}
        >
          {secondaryLabel}
        </button>
      ) : null}
    </div>
  );
}
