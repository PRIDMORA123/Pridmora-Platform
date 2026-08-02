export type LookingAheadProps = {
  nextFocus: string;
  commitments: string[];
  nextAction: string;
  onPrepare?: () => void;
};

export function LookingAhead({
  nextFocus,
  commitments,
  nextAction,
  onPrepare,
}: LookingAheadProps) {
  return (
    <aside className="looking-ahead-panel">
      <header>
        <p className="journey-eyebrow">Looking ahead</p>
        <h2>What matters next</h2>
        <p>The clearest priorities for the next stage of this relationship.</p>
      </header>

      <section className="looking-ahead-section">
        <h3>Next coaching focus</h3>
        <p>{nextFocus || "Focus will become clearer as the next stage of work emerges."}</p>
      </section>

      <section className="looking-ahead-section">
        <h3>Open commitments</h3>
        {commitments.length > 0 ? (
          <ul>
            {commitments.slice(0, 3).map(commitment => (
              <li key={commitment}>{commitment}</li>
            ))}
          </ul>
        ) : (
          <p>No open commitments.</p>
        )}
      </section>

      <section className="looking-ahead-section">
        <h3>Next meaningful action</h3>
        <p>{nextAction}</p>
      </section>

      {onPrepare ? (
        <button
          type="button"
          className="identity-button identity-button--secondary"
          onClick={onPrepare}
        >
          Prepare next conversation
        </button>
      ) : null}
    </aside>
  );
}
