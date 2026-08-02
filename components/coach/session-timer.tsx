import type { SessionStatus } from "@/types/coach-workspace";

type Props = {
  elapsedSeconds: number;
  sessionStatus: SessionStatus;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
};

export function SessionTimer({
  elapsedSeconds,
  sessionStatus,
  onStart,
  onPause,
  onResume,
}: Props) {
  const formattedTime = formatElapsedTime(elapsedSeconds);

  return (
    <section className="session-timer-card">
      <div>
        <p className="coach-section-label">Session timer</p>

        <time dateTime={`PT${elapsedSeconds}S`}>{formattedTime}</time>
      </div>

      <div className="session-timer-card__actions">
        {(sessionStatus === "prepared" || sessionStatus === "not_started") && (
          <button type="button" onClick={onStart}>
            Start conversation
          </button>
        )}

        {sessionStatus === "in_progress" && (
          <button type="button" onClick={onPause}>
            Pause
          </button>
        )}

        {sessionStatus === "paused" && (
          <button type="button" onClick={onResume}>
            Resume
          </button>
        )}

        {sessionStatus === "completed" && <span>Completed</span>}
      </div>
    </section>
  );
}

export function formatElapsedTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds]
    .map(value => String(value).padStart(2, "0"))
    .join(":");
}
