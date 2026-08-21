"use client";

import { useMemo, useState } from "react";
import { EmergingEvidenceState } from "@/components/journey/emerging-evidence-state";
import { DevelopmentSnapshot } from "@/components/development/development-snapshot";
import { DevelopmentStatusChip } from "@/components/identity/development-status-chip";
import { IDENTITY_EMPTY_STATES } from "@/lib/identity-empty-states";
import { buildRelationshipDevelopmentSnapshot } from "@/lib/development-snapshot";
import { visibleDevelopmentProfileSections } from "@/lib/development-snapshot-display";
import {
  conciseThemeExplanation,
  developmentStatusFromConfidence,
} from "@/lib/development-status";
import type {
  DevelopmentMilestone,
  DevelopmentProfileViewModel,
  DevelopmentTheme,
} from "@/types/development-profile";
import type { CoachingPattern } from "@/lib/patterns/types";
import { PatternsOverTimeSection } from "@/components/patterns/pattern-panels";
import { formatSessionDateLabel } from "@/lib/session/session-display";
import "@/app/workspace-refinement.css";

function ConciseList({
  values,
  emptyMessage,
}: {
  values: string[];
  emptyMessage: string;
}) {
  if (values.length === 0) {
    return <p className="identity-empty-copy">{emptyMessage}</p>;
  }

  return (
    <ul className="development-evidence-list">
      {values.map(value => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  );
}

function ThemeCard({
  theme,
  onViewEvidence,
}: {
  theme: DevelopmentTheme;
  onViewEvidence?: (theme: DevelopmentTheme) => void;
}) {
  const status = developmentStatusFromConfidence(
    theme.confidence,
    theme.evidenceCount
  );
  const explanation = conciseThemeExplanation(theme.narrative);

  return (
    <article className="development-theme-card">
      <div className="development-theme-card__header">
        <h3 className="development-theme-card__title">{theme.name}</h3>
        <DevelopmentStatusChip status={status} />
      </div>
      <p className="development-theme-card__explanation">{explanation}</p>
      <p className="development-theme-card__evidence-count">
        Supported by {theme.evidenceCount} reviewed evidence{" "}
        {theme.evidenceCount === 1 ? "item" : "items"}.
      </p>
      {onViewEvidence ? (
        <button
          type="button"
          className="identity-text-action"
          onClick={() => onViewEvidence(theme)}
        >
          View evidence
        </button>
      ) : null}
    </article>
  );
}

function DevelopmentDetail({
  data,
}: {
  data: DevelopmentProfileViewModel;
}) {
  return (
    <div className="development-detail-panel">
      <section className="development-section">
        <h3>Behavioural evidence</h3>
        <ConciseList
          values={data.behaviouralEvidence}
          emptyMessage="Reviewed behavioural evidence will appear as conversations are completed."
        />
      </section>

      <section className="development-section">
        <h3>Development milestones</h3>
        {data.milestones.length === 0 ? (
          <EmergingEvidenceState
            title={IDENTITY_EMPTY_STATES.noDevelopment.title}
            description={IDENTITY_EMPTY_STATES.noDevelopment.description}
          />
        ) : (
          <ol className="development-timeline">
            {data.milestones.map((milestone: DevelopmentMilestone) => (
              <li key={milestone.id}>
                <span className="development-timeline__date">
                  {milestone.date
                    ? formatSessionDateLabel(milestone.date)
                    : "Date emerging"}
                </span>
                <strong>{milestone.title}</strong>
                <p className="development-detail-narrative">
                  {milestone.description}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="development-section">
        <h3>Still developing</h3>
        <ConciseList
          values={data.notYetEstablished}
          emptyMessage="No unresolved evidence gaps have been identified."
        />
      </section>
    </div>
  );
}

/**
 * Concise Development page: snapshot first, themes, quiet supporting context.
 * Answers: “How is this client developing?”
 */
export function DevelopmentProfilePage({
  data,
  patterns = [],
  sessionNumbers,
  pendingUpdateSlot,
  supportingContextSlot,
  onReviewPattern,
  onRefreshPatterns,
  refreshingPatterns = false,
  reviewingPattern = null,
  onCloseReview,
  onSubmitReview,
  reviewBusy = false,
  includeRecognisedPatterns = true,
  onOpenIntelligence,
}: {
  data: DevelopmentProfileViewModel;
  patterns?: CoachingPattern[];
  sessionNumbers?: Map<string, number>;
  pendingUpdateSlot?: React.ReactNode;
  supportingContextSlot?: React.ReactNode;
  onReviewPattern?: (pattern: CoachingPattern) => void;
  onRefreshPatterns?: () => void;
  refreshingPatterns?: boolean;
  reviewingPattern?: CoachingPattern | null;
  onCloseReview?: () => void;
  onSubmitReview?: (input: {
    action: "accept" | "reject" | "edit" | "no_longer_relevant";
    title?: string;
    description?: string;
    coachComment?: string;
  }) => Promise<void>;
  reviewBusy?: boolean;
  /** Recognised patterns belong on the Intelligence layer when false. */
  includeRecognisedPatterns?: boolean;
  onOpenIntelligence?: () => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [showAllPatterns, setShowAllPatterns] = useState(false);
  const [themeEvidenceId, setThemeEvidenceId] = useState<string | null>(null);

  const completedSessionCount = useMemo(() => {
    const fromMilestones = data.milestones.filter(
      m => m.sourceType === "conversation" || m.sourceType === "summary"
    ).length;
    if (sessionNumbers && sessionNumbers.size > 0) {
      return Math.max(fromMilestones, sessionNumbers.size);
    }
    return fromMilestones;
  }, [data.milestones, sessionNumbers]);

  const snapshot = useMemo(
    () =>
      buildRelationshipDevelopmentSnapshot({
        data,
        patterns,
        sessionNumbers,
        completedSessionCount,
      }),
    [data, patterns, sessionNumbers, completedSessionCount]
  );

  const patternTitles = useMemo(
    () =>
      patterns
        .filter(pattern => pattern.coachAccepted !== false && !pattern.suppressed)
        .map(pattern => pattern.title),
    [patterns]
  );

  const visible = useMemo(
    () =>
      visibleDevelopmentProfileSections({
        snapshot,
        themes: data.themes,
        lookingAhead: data.lookingAhead,
        emergingStrengths: data.emergingStrengths,
        blockedInsights: patternTitles,
      }),
    [snapshot, data.themes, data.lookingAhead, data.emergingStrengths, patternTitles]
  );

  const hasContent =
    Boolean(data.currentDirection) ||
    data.emergingStrengths.length > 0 ||
    data.themes.length > 0 ||
    data.milestones.length > 0 ||
    data.behaviouralEvidence.length > 0 ||
    data.lookingAhead.length > 0 ||
    patterns.length > 0;

  return (
    <main className="development-profile-page development-profile-page--concise">
      {pendingUpdateSlot}

      <DevelopmentSnapshot
        snapshot={snapshot}
        blockedInsights={patternTitles}
      />

      {includeRecognisedPatterns ? (
        <PatternsOverTimeSection
          patterns={patterns}
          sessionNumbers={sessionNumbers}
          showAll={showAllPatterns}
          onReview={onReviewPattern}
          onViewAll={() => setShowAllPatterns(true)}
          onRefresh={onRefreshPatterns}
          refreshing={refreshingPatterns}
          reviewingPattern={reviewingPattern}
          onCloseReview={onCloseReview}
          onSubmitReview={onSubmitReview}
          reviewBusy={reviewBusy}
        />
      ) : null}

      {!hasContent ? (
        <div className="identity-development-empty">
          <EmergingEvidenceState
            title={IDENTITY_EMPTY_STATES.noDevelopment.title}
            description={IDENTITY_EMPTY_STATES.noDevelopment.description}
          />
        </div>
      ) : (
        <>
          {visible.themes.length > 0 ? (
            <section
              className="development-section development-themes-section"
              aria-labelledby="development-themes-heading"
            >
              <h2 id="development-themes-heading">Development themes</h2>
              <div className="development-theme-list">
                {visible.themes.map((theme: DevelopmentTheme) => (
                  <div key={theme.id}>
                    <ThemeCard
                      theme={theme}
                      onViewEvidence={t =>
                        setThemeEvidenceId(current =>
                          current === t.id ? null : t.id
                        )
                      }
                    />
                    {themeEvidenceId === theme.id ? (
                      theme.evidenceItems && theme.evidenceItems.length > 0 ? (
                        <ul
                          className="development-evidence-list development-theme-card__evidence-items"
                          aria-label={`Evidence for ${theme.name}`}
                        >
                          {theme.evidenceItems.map(item => (
                            <li key={item.id}>
                              <p className="development-theme-card__evidence-source">
                                {item.sessionLabel
                                  ? `${item.sourceLabel} · ${item.sessionLabel}`
                                  : item.sourceLabel}
                              </p>
                              <p>{item.content}</p>
                            </li>
                          ))}
                        </ul>
                      ) : null
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {visible.emergingStrengths.length > 0 ||
          visible.lookingAhead.length > 0 ? (
            <div className="development-concise-grid">
              {visible.emergingStrengths.length > 0 ? (
                <section className="development-section">
                  <h2>Strengths being demonstrated</h2>
                  <ConciseList
                    values={visible.emergingStrengths}
                    emptyMessage="Strengths will appear when supported by reviewed coaching evidence."
                  />
                </section>
              ) : null}

              {visible.lookingAhead.length > 0 ? (
                <section className="development-section">
                  <h2>Development priorities</h2>
                  <ConciseList
                    values={visible.lookingAhead}
                    emptyMessage="Priorities will appear after review."
                  />
                </section>
              ) : null}
            </div>
          ) : null}

          {onOpenIntelligence ? (
            <p className="development-why-this">
              <button
                type="button"
                className="identity-text-action"
                onClick={onOpenIntelligence}
              >
                Why this?
              </button>
            </p>
          ) : null}
        </>
      )}

      {supportingContextSlot ? (
        <div className="development-supporting-context-slot">
          {supportingContextSlot}
        </div>
      ) : null}

      {hasContent ? (
        <div className="development-detail-disclosure">
          <button
            type="button"
            className="identity-text-action"
            aria-expanded={detailOpen}
            onClick={() => setDetailOpen(value => !value)}
          >
            {detailOpen
              ? "Hide detailed development evidence"
              : "Detailed development evidence"}
          </button>
          {detailOpen ? <DevelopmentDetail data={data} /> : null}
        </div>
      ) : null}
    </main>
  );
}
