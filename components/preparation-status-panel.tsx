"use client";

import { forwardRef } from "react";
import { IdentityButton } from "@/components/identity";
import type { PreparationWorkspaceViewModel } from "@/lib/preparation-workspace";
import { preparationPrimaryActionLabel } from "@/lib/preparation-workspace";

export type PreparationStatusPanelProps = {
  viewModel: PreparationWorkspaceViewModel;
  onChangeStyle: () => void;
  onPrimaryAction: () => void;
  updating?: boolean;
  saving?: boolean;
  disabled?: boolean;
};

export const PreparationStatusPanel = forwardRef<
  HTMLButtonElement,
  PreparationStatusPanelProps
>(function PreparationStatusPanel(
  {
    viewModel,
    onChangeStyle,
    onPrimaryAction,
    updating = false,
    saving = false,
    disabled = false,
  },
  ref
) {
  const showPrimaryInPanel =
    viewModel.nextAction === "create_brief" ||
    viewModel.nextAction === "update_brief" ||
    viewModel.generationStatus === "unavailable" ||
    viewModel.generationStatus === "failed";

  const primaryLabel = preparationPrimaryActionLabel(viewModel.nextAction, {
    generating: updating,
    saving,
  });

  return (
    <section
      className="preparation-status-panel"
      aria-label="Preparation brief preference"
    >
      <div className="preparation-status-primary">
        <p className="preparation-status-eyebrow">Preparation brief</p>

        <div className="preparation-status-title-row">
          <h3>{viewModel.supportTitle}</h3>

          <button
            ref={ref}
            type="button"
            className="identity-button is-quiet is-sm"
            onClick={onChangeStyle}
            disabled={disabled}
          >
            Change approach
          </button>
        </div>

        <p className="identity-supporting">{viewModel.supportDescription}</p>

        <p className="preparation-status-preference">
          {viewModel.isClientOverride
            ? "Selected for this coaching relationship."
            : "Using your default preference."}
        </p>

        {viewModel.aiSupportAvailable ? (
          <p className="preparation-status-evidence">{viewModel.evidenceLabel}</p>
        ) : null}
      </div>

      <div
        className={
          viewModel.briefNeedsUpdate ||
          viewModel.generationStatus === "unavailable" ||
          viewModel.generationStatus === "failed" ||
          viewModel.nextAction === "create_brief"
            ? "preparation-status-update"
            : "preparation-status-current"
        }
      >
        <div>
          <p className="preparation-status-update-title">
            {viewModel.statusHeadline}
          </p>

          <p>{viewModel.statusDetail}</p>

          {viewModel.lastUpdated ? (
            <p className="preparation-status-timestamp">
              Last updated: {viewModel.lastUpdated}
            </p>
          ) : null}
        </div>

        {showPrimaryInPanel &&
        viewModel.generationStatus !== "unavailable" &&
        viewModel.generationStatus !== "failed" ? (
          <IdentityButton
            variant={viewModel.nextAction === "create_brief" ? "primary" : "secondary"}
            size="md"
            onClick={onPrimaryAction}
            disabled={disabled || updating || saving}
          >
            {primaryLabel}
          </IdentityButton>
        ) : null}
      </div>
    </section>
  );
});
