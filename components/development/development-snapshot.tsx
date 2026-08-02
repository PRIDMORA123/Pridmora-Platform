import { DevelopmentStatusChip } from "@/components/identity/development-status-chip";
import type { DevelopmentSnapshotModel } from "@/lib/development-snapshot";

export type DevelopmentSnapshotProps = {
  snapshot: DevelopmentSnapshotModel;
};

/**
 * Concise relationship-level Development Snapshot.
 * Qualitative states only — no scores, percentages, or progress bars.
 */
export function DevelopmentSnapshot({ snapshot }: DevelopmentSnapshotProps) {
  if (!snapshot.hasEnoughEvidence) {
    return (
      <section
        className="development-snapshot"
        aria-labelledby="development-snapshot-heading"
      >
        <p className="development-snapshot__eyebrow">Development snapshot</p>
        <h2 id="development-snapshot-heading" className="sr-only">
          Development snapshot
        </h2>
        <p className="development-snapshot__empty">
          There is not yet enough approved evidence to show development over
          time.
        </p>
      </section>
    );
  }

  return (
    <section
      className="development-snapshot"
      aria-labelledby="development-snapshot-heading"
    >
      <p className="development-snapshot__eyebrow">Development snapshot</p>
      <h2 id="development-snapshot-heading" className="sr-only">
        Development snapshot
      </h2>

      <div className="development-snapshot__block">
        <h3 className="development-snapshot__label">Current direction</h3>
        <p className="development-snapshot__body">{snapshot.currentDirection}</p>
      </div>

      {snapshot.areas.length > 0 ? (
        <div className="development-snapshot__block">
          <h3 className="development-snapshot__label">
            {snapshot.progressSinceLabel}
          </h3>
          <ul className="development-snapshot__areas" role="list">
            {snapshot.areas.map(area => (
              <li key={area.id} className="development-snapshot__area">
                <span className="development-snapshot__area-label">
                  {area.label}
                </span>
                <DevelopmentStatusChip status={area.status} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {snapshot.currentFocus ? (
        <div className="development-snapshot__block">
          <h3 className="development-snapshot__label">Current focus</h3>
          <p className="development-snapshot__body">{snapshot.currentFocus}</p>
        </div>
      ) : null}

      <p className="development-snapshot__evidence-note">
        {snapshot.evidenceNote}
      </p>
    </section>
  );
}
