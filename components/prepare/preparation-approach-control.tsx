"use client";

import type { RefObject } from "react";
import {
  PREPARATION_STYLE_DESCRIPTIONS,
  PREPARATION_STYLE_LABELS,
  PREPARATION_STYLE_SHORT_DESCRIPTIONS,
  preparationApproachScopeCopy,
  type PreparationApproachScope,
  type PreparationStyle,
} from "@/lib/preparation-style";

export type PreparationRefreshState =
  | "idle"
  | "refreshing"
  | "updated"
  | "update_available"
  | "failed";

export type PreparationApproachControlProps = {
  value: PreparationStyle;
  defaultValue?: PreparationStyle | null;
  scope?: PreparationApproachScope;
  needsRefresh?: boolean;
  isSaving?: boolean;
  isRefreshing?: boolean;
  /** Legacy refresh state machine used by PrepareSessionView. */
  refreshState?: PreparationRefreshState;
  updatedLabel?: string;
  disabled?: boolean;
  changeButtonRef?: RefObject<HTMLButtonElement | null>;
  onChangeApproach: () => void;
  onRefresh?: () => void;
};

function resolveRefreshState(
  refreshState: PreparationRefreshState | undefined,
  needsRefresh: boolean,
  isRefreshing: boolean
): PreparationRefreshState {
  if (isRefreshing || refreshState === "refreshing") return "refreshing";
  if (refreshState === "updated") return "updated";
  if (refreshState === "failed") return "failed";
  if (needsRefresh || refreshState === "update_available") {
    return "update_available";
  }
  return refreshState ?? "idle";
}

export function PreparationApproachControl({
  value,
  defaultValue = null,
  scope = "relationship",
  needsRefresh = false,
  isSaving = false,
  isRefreshing = false,
  refreshState,
  updatedLabel = "Brief updated",
  disabled = false,
  changeButtonRef,
  onChangeApproach,
  onRefresh,
}: PreparationApproachControlProps) {
  const styleLabel = PREPARATION_STYLE_LABELS[value];
  const shortDescription = PREPARATION_STYLE_SHORT_DESCRIPTIONS[value];
  const description = PREPARATION_STYLE_DESCRIPTIONS[value];
  const state = resolveRefreshState(refreshState, needsRefresh, isRefreshing);
  const showRefreshControls = value !== "minimal" && Boolean(onRefresh);
  const defaultLabel = defaultValue
    ? PREPARATION_STYLE_LABELS[defaultValue]
    : null;
  const busy = disabled || isSaving || state === "refreshing";

  return (
    <section
      className="preparation-approach"
      aria-labelledby="preparation-approach-title"
    >
      <div className="preparation-approach__content">
        <p className="preparation-approach__eyebrow">Preparation approach</p>

        <div className="preparation-approach__selection">
          <h2 id="preparation-approach-title">{styleLabel}</h2>
          <span className="preparation-approach__level">{shortDescription}</span>
        </div>

        <p className="preparation-approach__description">{description}</p>

        <p className="preparation-approach__scope">
          {preparationApproachScopeCopy(scope)}
        </p>

        {defaultLabel ? (
          <p className="preparation-approach__default">
            Your default: {defaultLabel}
          </p>
        ) : null}

        {state === "updated" && showRefreshControls ? (
          <p className="preparation-approach__updated" role="status">
            {updatedLabel}
          </p>
        ) : null}
      </div>

      <div className="preparation-approach__actions">
        <button
          type="button"
          ref={changeButtonRef}
          className="identity-button is-secondary identity-button--secondary"
          onClick={onChangeApproach}
          disabled={busy}
        >
          Change approach
        </button>

        {showRefreshControls && state !== "refreshing" ? (
          <button
            type="button"
            className="identity-button is-quiet identity-button--quiet"
            onClick={onRefresh}
            disabled={busy}
          >
            {state === "failed" ? "Try again" : "Refresh"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
