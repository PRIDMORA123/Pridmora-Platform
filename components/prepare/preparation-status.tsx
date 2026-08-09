"use client";

import type { PreparationRefreshState } from "@/components/prepare/preparation-approach-control";
import { IdentityProcessingState } from "@/components/identity/identity-processing-state";

export type PreparationStatusProps = {
  refreshState?: PreparationRefreshState;
  hasApprovedEvidence?: boolean;
  mode?: "manual" | "assisted" | "comprehensive";
  onViewSources?: () => void;
  onContinueWithExisting?: () => void;
};

function resolveCopy(input: {
  refreshState: PreparationRefreshState;
  hasApprovedEvidence: boolean;
  isManual: boolean;
}): {
  title: string;
  description: string;
  tone: "ready" | "update" | "busy" | "error";
} {
  if (input.refreshState === "refreshing") {
    return {
      title: "Updating preparation",
      description:
        "Reviewing the latest approved evidence and preparing a new briefing.",
      tone: "busy",
    };
  }

  if (input.refreshState === "failed") {
    return {
      title: "Preparation could not be refreshed safely",
      description:
        "Your existing preparation remains available and has not been changed.",
      tone: "error",
    };
  }

  if (input.refreshState === "update_available") {
    return {
      title: "Update available",
      description: "Refresh the briefing to use the latest approved evidence.",
      tone: "update",
    };
  }

  if (input.isManual) {
    return {
      title: "Manual preparation",
      description:
        "No generated brief is active. Use your own notes and judgement.",
      tone: "ready",
    };
  }

  return {
    title: "Preparation ready",
    description: input.hasApprovedEvidence
      ? "Prepared from approved development evidence."
      : "Prepared from the information currently available.",
    tone: "ready",
  };
}

/**
 * Single preparation status surface for the Prepare page.
 */
export function PreparationStatus({
  refreshState = "idle",
  hasApprovedEvidence = false,
  mode = "assisted",
  onViewSources,
  onContinueWithExisting,
}: PreparationStatusProps) {
  const copy = resolveCopy({
    refreshState,
    hasApprovedEvidence,
    isManual: mode === "manual",
  });

  if (copy.tone === "busy") {
    return (
      <div className="preparation-status preparation-status--busy">
        <IdentityProcessingState
          title={copy.title}
          description={copy.description}
          busy
        />
      </div>
    );
  }

  return (
    <div
      className={`preparation-status preparation-status--${copy.tone}`}
      role="status"
      aria-live="polite"
      aria-busy="false"
    >
      <span className="preparation-status__indicator" aria-hidden="true" />
      <div className="preparation-status__copy">
        <h2 className="preparation-status__title">{copy.title}</h2>
        <p className="preparation-status__description">{copy.description}</p>
        {hasApprovedEvidence && onViewSources && copy.tone === "ready" ? (
          <button
            type="button"
            className="identity-text-action preparation-status__sources"
            onClick={onViewSources}
          >
            View sources
          </button>
        ) : null}
        {copy.tone === "error" && onContinueWithExisting ? (
          <button
            type="button"
            className="identity-text-action preparation-status__sources"
            onClick={onContinueWithExisting}
          >
            Continue with existing preparation
          </button>
        ) : null}
      </div>
    </div>
  );
}
