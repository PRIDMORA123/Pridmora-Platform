"use client";

import { useState } from "react";
import type { RelationshipPrimaryAction } from "@/lib/coaching-journey";
import {
  buildCurrentPositionPanelModel,
  getLatestApprovedNextFocus,
  getLatestApprovedSessionCommitments,
  getLatestApprovedSessionEvidence,
} from "@/lib/relationship-workspace/current-position-display";
import type { Session } from "@/lib/types";

export function CurrentPositionPanel({
  narrative,
  identitySummary,
  developmentDirection,
  currentFocus,
  approvedNextFocus,
  clientName,
  outstandingCommitment,
  sessions = [],
  primaryAction,
  onPrimaryAction,
  onViewAllCommitments,
}: {
  narrative?: string | null;
  identitySummary?: string | null;
  developmentDirection?: string | null;
  currentFocus?: string | null;
  approvedNextFocus?: string | null;
  clientName: string;
  outstandingCommitment?: string | null;
  sessions?: Session[];
  /** Intentionally unused for primary CTA — owned by the workspace spine. */
  primaryAction?: RelationshipPrimaryAction | null;
  onPrimaryAction?: (action: RelationshipPrimaryAction) => void;
  onViewAllCommitments?: () => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [commitmentsOpen, setCommitmentsOpen] = useState(false);

  void primaryAction;
  void onPrimaryAction;

  const approvedSessionEvidence = getLatestApprovedSessionEvidence(sessions);
  const sessionCommitments = getLatestApprovedSessionCommitments(sessions);
  const sessionNextFocus =
    approvedNextFocus || getLatestApprovedNextFocus(sessions);

  const model = buildCurrentPositionPanelModel({
    approvedCurrentPosition: narrative,
    identitySummary,
    approvedDevelopmentDirection: developmentDirection,
    approvedSessionEvidence,
    currentFocus,
    approvedNextFocus: sessionNextFocus,
    coachingPurpose: currentFocus,
    clientName,
    outstandingCommitment,
    commitments: sessionCommitments,
  });

  return (
    <section
      className="current-position-panel"
      aria-labelledby="current-position-title"
    >
      <p className="current-position-panel__eyebrow">Current position</p>
      <h2 id="current-position-title" className="sr-only">
        Current position
      </h2>
      <p className="current-position-panel__statement">{model.statement}</p>

      {model.hasDetail ? (
        <button
          type="button"
          className="identity-text-action"
          aria-expanded={detailOpen}
          onClick={() => setDetailOpen(open => !open)}
        >
          {detailOpen ? "Hide detail" : "View detail"}
        </button>
      ) : null}

      {detailOpen && model.fullNarrative ? (
        <p className="current-position-panel__detail">{model.fullNarrative}</p>
      ) : null}

      <div className="current-position-panel__details">
        <div>
          <p className="current-position-panel__label">Current focus</p>
          <p className="current-position-panel__value">{model.currentFocus}</p>
        </div>
        <div>
          <p className="current-position-panel__label">Outstanding commitment</p>
          <p className="current-position-panel__value">
            {model.outstandingCommitment}
          </p>
          {model.commitmentHasMore ? (
            <button
              type="button"
              className="identity-text-action current-position-panel__more"
              aria-expanded={commitmentsOpen}
              onClick={() => {
                setCommitmentsOpen(open => !open);
                onViewAllCommitments?.();
              }}
            >
              {commitmentsOpen
                ? "Hide commitments"
                : "View all commitments"}
            </button>
          ) : null}
          {commitmentsOpen && sessionCommitments.length > 1 ? (
            <ul className="current-position-panel__commitments">
              {sessionCommitments.slice(1).map((item, index) => (
                <li key={`${index}-${item.slice(0, 24)}`}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}
