export type SessionsLoadErrorProps = {
  onRetry: () => void;
  onReturn: () => void;
  retrying?: boolean;
};

/**
 * Calm recoverable state when relationship session history cannot be loaded.
 * Does not expose technical details.
 */
export function SessionsLoadError({
  onRetry,
  onReturn,
  retrying = false,
}: SessionsLoadErrorProps) {
  return (
    <div className="sessions-load-error" role="alert">
      <div>
        <p className="sessions-load-error__title">Sessions could not be loaded</p>
        <p className="sessions-load-error__description">
          The relationship is still available, but its session history could not
          be retrieved.
        </p>
        <p className="sessions-load-error__live" aria-live="polite">
          {retrying ? "Trying again…" : ""}
        </p>
      </div>
      <div className="sessions-load-error__actions">
        <button
          type="button"
          className="identity-button primary"
          disabled={retrying}
          aria-busy={retrying}
          onClick={onRetry}
        >
          {retrying ? "Trying again…" : "Try again"}
        </button>
        <button
          type="button"
          className="identity-button secondary"
          disabled={retrying}
          onClick={onReturn}
        >
          Return to Current Position
        </button>
      </div>
    </div>
  );
}
