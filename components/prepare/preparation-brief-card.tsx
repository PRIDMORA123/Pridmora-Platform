"use client";

import type { ReactNode, RefObject } from "react";

type PreparationBriefCardProps = {
  summary: string;
  focusTags: string[];
  commitments: string[];
  lastUpdatedLabel: string;
  controlBar?: ReactNode;
  briefButtonRef?: RefObject<HTMLButtonElement | null>;
  onViewFullBrief: () => void;
};

export function PreparationBriefCard({
  summary,
  focusTags,
  commitments,
  lastUpdatedLabel,
  controlBar,
  briefButtonRef,
  onViewFullBrief,
}: PreparationBriefCardProps) {
  const visibleTags = focusTags.filter(Boolean).slice(0, 3);
  const visibleCommitments = commitments.filter(Boolean).slice(0, 3);

  return (
    <article className="prepare-brief-card">
      {controlBar ? (
        <div className="prepare-brief-card__control">{controlBar}</div>
      ) : null}

      <header className="prepare-brief-card__header">
        <h2>Preparation brief</h2>
        <p className="prepare-brief-card__updated">{lastUpdatedLabel}</p>
      </header>

      <div className="prepare-brief-card__summary">
        <p>{summary}</p>
      </div>

      {visibleTags.length > 0 ? (
        <div className="prepare-brief-card__focus">
          <ul className="prepare-brief-focus-tags" aria-label="Possible focus">
            {visibleTags.map(tag => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {visibleCommitments.length > 0 ? (
        <div className="prepare-brief-card__commitments">
          <p className="prepare-eyebrow">Outstanding commitments</p>
          <ul>
            {visibleCommitments.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <footer className="prepare-brief-card__footer">
        <button
          type="button"
          ref={briefButtonRef}
          className="identity-text-action"
          onClick={onViewFullBrief}
        >
          View detailed brief
        </button>
      </footer>
    </article>
  );
}
