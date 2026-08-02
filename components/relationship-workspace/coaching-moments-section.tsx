"use client";

import { CoachingMomentLauncher } from "@/components/coaching-moments/coaching-moment-launcher";
import {
  conciseMomentTitle,
  type CoachingMoment,
} from "@/lib/coaching-moments/coaching-moment";

export type CoachingMomentsSectionProps = {
  moments?: CoachingMoment[];
  archived?: boolean;
  loadError?: boolean;
  onNewMoment?: () => void;
  onOpenMoment?: (moment: CoachingMoment) => void;
  onViewAll?: () => void;
  onRetry?: () => void;
};

function formatDate(value: string | null): string {
  if (!value) return "Recently";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "Recently";
  }
}

/**
 * Quiet utility surface for optional Coaching Moments.
 * Must never compete with Current Conversation or the primary CTA.
 */
export function CoachingMomentsSection({
  moments = [],
  archived = false,
  loadError = false,
  onNewMoment,
  onOpenMoment,
  onViewAll,
  onRetry,
}: CoachingMomentsSectionProps) {
  const items = moments.slice(0, 3);

  if (loadError) {
    return (
      <section
        className="coaching-moments-section coaching-moments-section--utility"
        aria-labelledby="coaching-moments-title"
      >
        <h2 id="coaching-moments-title">Coaching Moments</h2>
        <div className="relationship-canvas__recoverable" role="alert">
          <p>Coaching Moments are temporarily unavailable.</p>
          {onRetry ? (
            <button
              type="button"
              className="identity-button is-secondary is-sm"
              onClick={onRetry}
            >
              Try again
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section
      className="coaching-moments-section coaching-moments-section--utility"
      aria-labelledby="coaching-moments-title"
    >
      <h2 id="coaching-moments-title">Coaching Moments</h2>
      <p className="coaching-moments-section__copy">
        Capture a significant coaching interaction outside the formal
        conversation sequence.
      </p>

      {archived ? (
        <p className="coaching-moments-section__archived muted">
          This relationship is archived. New Coaching Moments cannot be created.
          Historical moments remain available below.
        </p>
      ) : onNewMoment ? (
        <div className="coaching-moments-section__action">
          <CoachingMomentLauncher
            variant="button"
            onLaunch={onNewMoment}
          />
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="coaching-moments-section__recent">
          <p className="coaching-moments-section__recent-label">
            Recent moments
          </p>
          <ul className="coaching-moments-section__list">
            {items.map(moment => (
              <li key={moment.id}>
                {onOpenMoment ? (
                  <button
                    type="button"
                    className="coaching-moments-section__item"
                    onClick={() => onOpenMoment(moment)}
                  >
                    <span className="coaching-moments-section__item-title">
                      {conciseMomentTitle(moment)}
                    </span>
                    <span className="coaching-moments-section__item-date">
                      {formatDate(moment.occurredAt || moment.updatedAt)}
                    </span>
                  </button>
                ) : (
                  <div className="coaching-moments-section__item">
                    <span className="coaching-moments-section__item-title">
                      {conciseMomentTitle(moment)}
                    </span>
                    <span className="coaching-moments-section__item-date">
                      {formatDate(moment.occurredAt || moment.updatedAt)}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {onViewAll && moments.length > 3 ? (
            <button
              type="button"
              className="identity-text-action"
              onClick={onViewAll}
            >
              View all moments
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
