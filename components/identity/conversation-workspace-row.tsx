type ConversationWorkspaceRowProps = {
  name: string;
  focus?: string | null;
  stageLabel?: string | null;
  actionLabel: string;
  onAction: () => void;
  actionVariant?: "primary" | "secondary" | "quiet";
};

export function ConversationWorkspaceRow({
  name,
  focus,
  stageLabel,
  actionLabel,
  onAction,
  actionVariant = "secondary",
}: ConversationWorkspaceRowProps) {
  return (
    <article className="conversation-workspace-row">
      <div>
        <h3>{name}</h3>

        {focus ? <p className="conversation-workspace-focus">{focus}</p> : null}

        {stageLabel ? (
          <p className="conversation-workspace-stage">{stageLabel}</p>
        ) : null}
      </div>

      <button
        type="button"
        className={`identity-button is-${actionVariant} is-sm`}
        onClick={onAction}
      >
        {actionLabel}
      </button>
    </article>
  );
}
