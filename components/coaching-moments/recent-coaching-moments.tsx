"use client";

import {
  conciseMomentTitle,
  type CoachingMoment,
} from "@/lib/coaching-moments/coaching-moment";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import { resolveProductLanguage } from "@/lib/role-language";

export type RecentCoachingMomentsProps = {
  moments: CoachingMoment[];
  onOpenMoment?: (moment: CoachingMoment) => void;
  onViewAll?: () => void;
};

function formatDate(value: string | null): string {
  if (!value) return "Recently";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
    }).format(new Date(value));
  } catch {
    return "Recently";
  }
}

function commitmentLabel(moment: CoachingMoment): string {
  if (moment.noCommitmentAgreed) return "No commitment agreed";
  if (moment.agreedCommitment?.trim()) return "Commitment recorded";
  if (moment.followUp?.trim()) return "Follow-up noted";
  return "Captured";
}

/**
 * Secondary Current Position surface — never dominates formal journey.
 */
export function RecentCoachingMoments({
  moments,
  onOpenMoment,
  onViewAll,
}: RecentCoachingMomentsProps) {
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);
  const items = moments.slice(0, 3);
  if (items.length === 0) return null;

  return (
    <section
      className="coaching-moment-recent"
      aria-labelledby="recent-coaching-moments-heading"
    >
      <div className="coaching-moment-recent__header">
        <h2 id="recent-coaching-moments-heading">
          Recent {language.momentsTitle}
        </h2>
        {onViewAll ? (
          <button
            type="button"
            className="identity-button is-quiet"
            onClick={onViewAll}
          >
            View all interactions
          </button>
        ) : null}
      </div>

      <ul className="coaching-moment-recent__list">
        {items.map(moment => (
          <li key={moment.id}>
            {onOpenMoment ? (
              <button
                type="button"
                className="coaching-moment-recent__item"
                onClick={() => onOpenMoment(moment)}
              >
                <span className="coaching-moment-recent__date">
                  {formatDate(moment.occurredAt || moment.updatedAt)}
                </span>
                <span className="coaching-moment-recent__title">
                  {conciseMomentTitle(moment)}
                </span>
                <span className="coaching-moment-recent__meta">
                  {commitmentLabel(moment)}
                </span>
              </button>
            ) : (
              <div className="coaching-moment-recent__item">
                <span className="coaching-moment-recent__date">
                  {formatDate(moment.occurredAt || moment.updatedAt)}
                </span>
                <span className="coaching-moment-recent__title">
                  {conciseMomentTitle(moment)}
                </span>
                <span className="coaching-moment-recent__meta">
                  {commitmentLabel(moment)}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
