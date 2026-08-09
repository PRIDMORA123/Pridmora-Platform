import { ActionButton } from "@/components/feedback/action-button";
import type { ActionButtonStatus } from "@/types/action-feedback";
import type { SaveState, SessionStatus } from "@/types/coach-workspace";

type Props = {
  saveState: SaveState;
  sessionStatus: SessionStatus;
  sessionActionStatus?: ActionButtonStatus;
  busy?: boolean;
  onSave: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
  onContinueToReflection: () => void;
};

export function SessionActionBar({
  saveState,
  sessionStatus,
  sessionActionStatus = "idle",
  busy = false,
  onSave,
  onStart,
  onPause,
  onResume,
  onComplete,
  onContinueToReflection,
}: Props) {
  const saveButtonStatus =
    saveState === "saving"
      ? "loading"
      : saveState === "saved"
        ? "success"
        : saveState === "error"
          ? "error"
          : "idle";

  return (
    <footer className="session-action-bar">
      <div>
        <strong>{getActionBarTitle(sessionStatus)}</strong>

        <span>{getActionBarDescription(sessionStatus)}</span>
      </div>

      <div className="session-action-bar__buttons">
        <ActionButton
          variant="secondary"
          status={saveButtonStatus}
          idleLabel="Save notes"
          loadingLabel="Saving…"
          successLabel="Saved"
          errorLabel="Try again"
          onClick={onSave}
          disabled={saveState === "saving" || busy}
        />

        {(sessionStatus === "prepared" || sessionStatus === "not_started") && (
          <ActionButton
            status={sessionActionStatus}
            idleLabel="Start conversation"
            loadingLabel="Starting…"
            successLabel="Started"
            errorLabel="Try again"
            onClick={onStart}
            disabled={busy}
          />
        )}

        {sessionStatus === "in_progress" && (
          <>
            <ActionButton
              variant="secondary"
              status={sessionActionStatus}
              idleLabel="Pause session"
              loadingLabel="Pausing…"
              successLabel="Paused"
              errorLabel="Try again"
              onClick={onPause}
              disabled={busy}
            />

            <ActionButton
              status={sessionActionStatus}
              idleLabel="Complete conversation"
              loadingLabel="Completing…"
              successLabel="Completed"
              errorLabel="Try again"
              onClick={onComplete}
              disabled={busy}
            />
          </>
        )}

        {sessionStatus === "paused" && (
          <>
            <ActionButton
              variant="secondary"
              status={sessionActionStatus}
              idleLabel="Resume session"
              loadingLabel="Resuming…"
              successLabel="Resumed"
              errorLabel="Try again"
              onClick={onResume}
              disabled={busy}
            />

            <ActionButton
              status={sessionActionStatus}
              idleLabel="Complete conversation"
              loadingLabel="Completing…"
              successLabel="Completed"
              errorLabel="Try again"
              onClick={onComplete}
              disabled={busy}
            />
          </>
        )}

        {sessionStatus === "completed" && (
          <ActionButton
            idleLabel="Continue to reflection"
            onClick={onContinueToReflection}
          />
        )}
      </div>
    </footer>
  );
}

function getActionBarTitle(status: SessionStatus) {
  switch (status) {
    case "prepared":
    case "not_started":
      return "Ready to begin";
    case "in_progress":
      return "Conversation in progress";
    case "paused":
      return "Conversation paused";
    case "completed":
      return "Conversation completed";
  }
}

function getActionBarDescription(status: SessionStatus) {
  switch (status) {
    case "prepared":
    case "not_started":
      return "Start the timer when the conversation begins.";
    case "in_progress":
      return "Your notes are saving automatically.";
    case "paused":
      return "The timer is paused. Your notes remain editable.";
    case "completed":
      return "Review the session and continue to reflection.";
  }
}
