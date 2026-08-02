"use client";

export type CoachingMomentCaptureProps = {
  whatHappened: string;
  whatWasAgreed: string;
  followUp: string;
  noCommitmentAgreed: boolean;
  disabled?: boolean;
  error?: string | null;
  onWhatHappenedChange: (value: string) => void;
  onWhatWasAgreedChange: (value: string) => void;
  onFollowUpChange: (value: string) => void;
  onNoCommitmentChange: (value: boolean) => void;
};

export function CoachingMomentCapture({
  whatHappened,
  whatWasAgreed,
  followUp,
  noCommitmentAgreed,
  disabled = false,
  error = null,
  onWhatHappenedChange,
  onWhatWasAgreedChange,
  onFollowUpChange,
  onNoCommitmentChange,
}: CoachingMomentCaptureProps) {
  return (
    <div className="coaching-moment-capture">
      <h3 className="coaching-moment-heading">Capture what matters</h3>
      <p className="coaching-moment-supporting">
        Record only what you need. A commitment is optional.
      </p>

      <div className="coaching-moment-capture-form">
        <label className="coaching-moment-field" htmlFor="coaching-moment-happened">
          <span>What happened?</span>
          <textarea
            id="coaching-moment-happened"
            value={whatHappened}
            disabled={disabled}
            rows={5}
            placeholder="Sarah accepted that she had not raised the risk early enough."
            onChange={event => onWhatHappenedChange(event.target.value)}
          />
        </label>

        <label className="coaching-moment-field" htmlFor="coaching-moment-agreed">
          <span>What was agreed?</span>
          <textarea
            id="coaching-moment-agreed"
            value={whatWasAgreed}
            disabled={disabled || noCommitmentAgreed}
            rows={4}
            placeholder="She will flag delivery risks at least 48 hours before future deadlines."
            onChange={event => onWhatWasAgreedChange(event.target.value)}
          />
        </label>

        <label className="coaching-moment-checkbox">
          <input
            type="checkbox"
            checked={noCommitmentAgreed}
            disabled={disabled}
            onChange={event => onNoCommitmentChange(event.target.checked)}
          />
          <span>No commitment was agreed</span>
        </label>

        <label className="coaching-moment-field" htmlFor="coaching-moment-follow-up">
          <span>
            Follow-up <em className="coaching-moment-optional">(optional)</em>
          </span>
          <textarea
            id="coaching-moment-follow-up"
            value={followUp}
            disabled={disabled}
            rows={3}
            placeholder="Review progress at the next one-to-one."
            onChange={event => onFollowUpChange(event.target.value)}
          />
        </label>
      </div>

      {error ? (
        <p className="coaching-moment-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
