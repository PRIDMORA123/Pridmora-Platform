"use client";

export type SessionErrorMessageProps = {
  message: string;
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export function SessionErrorMessage({
  message,
  detail,
  onRetry,
  retryLabel = "Try again",
}: SessionErrorMessageProps) {
  if (!message.trim()) return null;

  return (
    <div className="session-error-message" role="alert">
      <div className="session-error-message__copy">
        <p className="session-error-message__title">{message}</p>
        {detail?.trim() ? (
          <p className="session-error-message__detail">{detail}</p>
        ) : null}
      </div>
      {onRetry ? (
        <button
          type="button"
          className="identity-button secondary"
          onClick={onRetry}
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
