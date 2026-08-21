import { DevelopmentStatusChip } from "@/components/identity/development-status-chip";
import { visibleDevelopmentSnapshotStory } from "@/lib/development-snapshot-display";
import type { DevelopmentSnapshotModel } from "@/lib/development-snapshot";

export type DevelopmentSnapshotProps = {
  snapshot: DevelopmentSnapshotModel;
  /** Already-shown insights (e.g. Recognised Pattern titles) — display filter only. */
  blockedInsights?: string[];
};

/**
 * Concise manager-facing development story.
 * Underlying snapshot data is unchanged — repeated statements are suppressed
 * at display time only.
 */
export function DevelopmentSnapshot({
  snapshot,
  blockedInsights = [],
}: DevelopmentSnapshotProps) {
  if (!snapshot.hasEnoughEvidence) {
    return (
      <section
        className="development-snapshot"
        aria-labelledby="development-snapshot-heading"
      >
        <p className="development-snapshot__eyebrow">Current development</p>
        <h2 id="development-snapshot-heading">What matters now?</h2>
        <p className="development-snapshot__empty">
          There is not yet enough approved evidence to show development over
          time.
        </p>
      </section>
    );
  }

  const story = visibleDevelopmentSnapshotStory(snapshot, blockedInsights);

  return (
    <section
      className="development-snapshot"
      aria-labelledby="development-snapshot-heading"
    >
      <p className="development-snapshot__eyebrow">Current development</p>
      <h2 id="development-snapshot-heading">What matters now?</h2>

      <div className="development-snapshot__block">
        <p className="development-snapshot__body">{story.whatMattersNow}</p>
      </div>

      {story.recentProgress.length > 0 ? (
        <div className="development-snapshot__block">
          <h3 className="development-snapshot__label">Recent progress</h3>
          <ul className="development-snapshot__areas" role="list">
            {story.recentProgress.map(area => (
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

      {story.currentFocus ? (
        <div className="development-snapshot__block">
          <h3 className="development-snapshot__label">Current focus</h3>
          <p className="development-snapshot__body">{story.currentFocus}</p>
        </div>
      ) : null}

      <p className="development-snapshot__evidence-note">
        {snapshot.evidenceNote}
      </p>
    </section>
  );
}
