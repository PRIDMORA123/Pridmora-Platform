"use client";

import { COACHING_INTELLIGENCE_MODES } from "@/lib/coaching-intelligence/mode-config";
import { getModeLabel } from "@/lib/coaching-intelligence/mode";
import type {
  CoachingIntelligenceMode,
  CoachingIntelligenceStatus,
  IntelligenceSource,
} from "@/types/coaching-intelligence";

type CoachingIntelligenceBarProps = {
  mode: CoachingIntelligenceMode;
  status: CoachingIntelligenceStatus;
  usedSources: IntelligenceSource[];
  lastRefreshedAt?: string | null;
  generatedBriefMode?: CoachingIntelligenceMode | null;
  isBriefOutOfDate?: boolean;
  disabled?: boolean;
  onChangeMode: (mode: CoachingIntelligenceMode) => void;
  onOpenDetails: () => void;
};

export function CoachingIntelligenceBar({
  mode,
  status,
  usedSources,
  lastRefreshedAt,
  generatedBriefMode = null,
  isBriefOutOfDate = false,
  disabled = false,
  onChangeMode,
  onOpenDetails,
}: CoachingIntelligenceBarProps) {
  const configuration = COACHING_INTELLIGENCE_MODES[mode];
  const isPreparing = status === "preparing";
  const modeLabel = getModeLabel(mode);

  return (
    <section
      className={["coaching-intelligence-bar", `is-${mode}`].join(" ")}
      aria-labelledby="coaching-intelligence-title"
    >
      <div className="coaching-intelligence-bar__identity">
        <p>Professional Coaching Intelligence™</p>

        <h2 id="coaching-intelligence-title">
          {modeLabel} support
          {isBriefOutOfDate ? (
            <span className="intelligence-stale-badge">Refresh required</span>
          ) : null}
        </h2>

        <span>{configuration.shortDescription}</span>
      </div>

      <fieldset className="coaching-intelligence-selector" disabled={disabled}>
        <legend className="sr-only">Select coaching intelligence level</legend>

        {(
          ["manual", "assisted", "comprehensive"] as CoachingIntelligenceMode[]
        ).map(option => {
          const optionConfig = COACHING_INTELLIGENCE_MODES[option];

          return (
            <label
              key={option}
              className={mode === option ? "is-selected" : ""}
            >
              <input
                type="radio"
                name="coaching-intelligence-mode"
                value={option}
                checked={mode === option}
                onChange={() => onChangeMode(option)}
                aria-label={`${optionConfig.label} support`}
              />

              <span>
                <strong>{optionConfig.label}</strong>
                <small>{getSelectorDescription(option)}</small>
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="coaching-intelligence-bar__status">
        <IntelligenceStatus
          status={status}
          mode={mode}
          isBriefOutOfDate={isBriefOutOfDate}
        />

        {isPreparing ? (
          <span>Reviewing approved evidence</span>
        ) : isBriefOutOfDate && generatedBriefMode ? (
          <span>
            Current brief used {getModeLabel(generatedBriefMode)} support
          </span>
        ) : mode === "manual" ? (
          <span>AI analysis is off</span>
        ) : (
          <span>
            {usedSources.length} evidence{" "}
            {usedSources.length === 1 ? "source" : "sources"} used
          </span>
        )}

        {!isPreparing && lastRefreshedAt && mode !== "manual" && !isBriefOutOfDate ? (
          <small>Refreshed {formatRelativeTime(lastRefreshedAt)}</small>
        ) : null}

        <button type="button" onClick={onOpenDetails}>
          View details
        </button>
      </div>
    </section>
  );
}

function getSelectorDescription(mode: CoachingIntelligenceMode) {
  switch (mode) {
    case "manual":
      return "No AI";
    case "assisted":
      return "Light support";
    case "comprehensive":
      return "Full context";
  }
}

function IntelligenceStatus({
  status,
  mode,
  isBriefOutOfDate,
}: {
  status: CoachingIntelligenceStatus;
  mode: CoachingIntelligenceMode;
  isBriefOutOfDate: boolean;
}) {
  const modeLabel = getModeLabel(mode);

  let content: string;
  if (status === "preparing") {
    content = `Preparing ${modeLabel.toLowerCase()} intelligence…`;
  } else if (isBriefOutOfDate) {
    content = `${modeLabel} support active`;
  } else if (status === "ready") {
    content = `${modeLabel} intelligence ready`;
  } else if (status === "error") {
    content = "Unable to prepare";
  } else {
    content = "Not refreshed";
  }

  return (
    <strong
      className={`intelligence-status is-${isBriefOutOfDate && status !== "preparing" ? "stale" : status}`}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" />
      {content}
    </strong>
  );
}

function formatRelativeTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "recently";
  }

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en-GB", {
    numeric: "auto",
  });

  const absoluteSeconds = Math.abs(seconds);

  if (absoluteSeconds < 60) {
    return formatter.format(seconds, "second");
  }

  const minutes = Math.round(seconds / 60);

  if (Math.abs(minutes) < 60) {
    return formatter.format(minutes, "minute");
  }

  const hours = Math.round(minutes / 60);

  if (Math.abs(hours) < 24) {
    return formatter.format(hours, "hour");
  }

  return formatter.format(Math.round(hours / 24), "day");
}
