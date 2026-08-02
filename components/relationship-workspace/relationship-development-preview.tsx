"use client";

import { DevelopmentStatusChip } from "@/components/identity/development-status-chip";
import type { DevelopmentStatus } from "@/components/identity/development-status-chip";
import type { Strength } from "@/lib/types";

export type DevelopmentAreaPreview = {
  id: string;
  label: string;
  status: DevelopmentStatus;
};

function mapStrengthStage(stage: string | undefined): DevelopmentStatus {
  const value = (stage ?? "").toLowerCase();
  if (value.includes("strengthen")) return "strengthening";
  if (value.includes("establish")) return "established";
  if (value.includes("emerg")) return "emerging";
  return "developing";
}

export function buildDevelopmentAreasPreview(input: {
  strengths?: Strength[];
  priorities?: string[];
}): DevelopmentAreaPreview[] {
  const fromStrengths = (input.strengths ?? [])
    .filter(item => item.name.trim())
    .map(item => ({
      id: item.id || item.name,
      label: item.name.trim(),
      status: mapStrengthStage(item.stage),
    }));

  const used = new Set(fromStrengths.map(item => item.label.toLowerCase()));
  const fromPriorities = (input.priorities ?? [])
    .map(label => label.trim())
    .filter(Boolean)
    .filter(label => !used.has(label.toLowerCase()))
    .map((label, index) => ({
      id: `priority-${index}-${label}`,
      label,
      status: "developing" as const,
    }));

  return [...fromStrengths, ...fromPriorities].slice(0, 4);
}

export function RelationshipDevelopmentPreview({
  currentDirection,
  strengths = [],
  priorities = [],
  currentFocus,
  completedSessionCount = 0,
  loadError = false,
  onViewDevelopment,
  onRetry,
}: {
  currentDirection?: string | null;
  strengths?: Strength[];
  priorities?: string[];
  currentFocus?: string | null;
  completedSessionCount?: number;
  loadError?: boolean;
  onViewDevelopment: () => void;
  onRetry?: () => void;
}) {
  const areas = buildDevelopmentAreasPreview({ strengths, priorities });
  const direction =
    currentDirection?.trim() ||
    "A clearer development direction is still emerging.";
  const focus = currentFocus?.trim() || "";
  const evidenceNote =
    completedSessionCount <= 0
      ? "Based on approved coaching evidence."
      : completedSessionCount === 1
        ? "Based on approved evidence from Session 1."
        : `Based on approved evidence from Sessions 1–${completedSessionCount}.`;

  if (loadError) {
    return (
      <section
        className="relationship-development-preview relationship-development-preview--secondary"
        aria-labelledby="development-snapshot-title"
      >
        <h2 id="development-snapshot-title">Development snapshot</h2>
        <div className="relationship-canvas__recoverable" role="alert">
          <p>Development could not be loaded</p>
          <p className="muted">
            Your conversation records remain available.
          </p>
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
      className="relationship-development-preview relationship-development-preview--secondary"
      aria-labelledby="development-snapshot-title"
    >
      <h2 id="development-snapshot-title">Development snapshot</h2>

      <div className="relationship-development-preview__body">
        <div>
          <p className="relationship-development-preview__label">
            Current direction
          </p>
          <p className="relationship-development-preview__text">{direction}</p>
        </div>

        {areas.length > 0 ? (
          <div>
            <ul
              className="relationship-development-preview__areas"
              role="list"
            >
              {areas.map(area => (
                <li
                  key={area.id}
                  className="relationship-development-preview__area"
                >
                  <span className="relationship-development-preview__area-label">
                    {area.label}
                  </span>
                  <DevelopmentStatusChip status={area.status} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {focus ? (
          <div>
            <p className="relationship-development-preview__label">
              Current focus
            </p>
            <p className="relationship-development-preview__text">{focus}</p>
          </div>
        ) : null}

        <p className="relationship-development-preview__evidence">
          {evidenceNote}
        </p>
      </div>

      <button
        type="button"
        className="identity-button is-secondary"
        onClick={onViewDevelopment}
      >
        View development
      </button>
    </section>
  );
}
