"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { ActionButton } from "@/components/feedback/action-button";
import { useToast } from "@/components/feedback/toast-provider";
import { IdentityDrawer } from "@/components/identity/drawer";
import {
  getModeLabel,
  modeToPreparationStyle,
  preparationStyleToMode,
} from "@/lib/coaching-intelligence/mode";
import {
  PREPARATION_STYLE_LABELS,
  PREPARATION_STYLE_SELECTOR_OPTIONS,
  preparationApproachScopeCopy,
} from "@/lib/preparation-style";
import { updateRelationshipIntelligenceMode } from "@/services/coaching-intelligence";
import type { CoachingIntelligenceMode } from "@/types/coaching-intelligence";

export type PreparationApproachDrawerProps = {
  open: boolean;
  relationshipId: string;
  defaultMode: CoachingIntelligenceMode;
  initialMode: CoachingIntelligenceMode;
  client: {
    name: string;
    organisation?: string | null;
    role?: string | null;
    email?: string | null;
  };
  onClose: () => void;
  onSaved: (
    mode: CoachingIntelligenceMode,
    updatedClient: {
      id: string;
      preparationStyleOverride?: string | null;
    }
  ) => void;
  triggerRef?: RefObject<HTMLElement | null>;
};

type SaveStatus = "idle" | "changed" | "saving" | "saved" | "error";

export function PreparationApproachDrawer({
  open,
  relationshipId,
  defaultMode,
  initialMode,
  client,
  onClose,
  onSaved,
  triggerRef,
}: PreparationApproachDrawerProps) {
  const { showToast } = useToast();
  const savingRef = useRef(false);

  const [savedMode, setSavedMode] =
    useState<CoachingIntelligenceMode>(initialMode);
  const [draftMode, setDraftMode] =
    useState<CoachingIntelligenceMode>(initialMode);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  savingRef.current = saveStatus === "saving";

  const hasModeChanged = draftMode !== savedMode;
  const defaultModeLabel = getModeLabel(defaultMode);
  const draftStyle = modeToPreparationStyle(draftMode);

  useEffect(() => {
    if (!open) return;
    setSavedMode(initialMode);
    setDraftMode(initialMode);
    setSaveStatus("idle");
  }, [open, initialMode]);

  const closeDrawer = useCallback(() => {
    if (savingRef.current) return;
    onClose();
  }, [onClose]);

  function handleSelectMode(mode: CoachingIntelligenceMode) {
    setDraftMode(mode);
    setSaveStatus(mode === savedMode ? "idle" : "changed");
  }

  function handleUseDefault() {
    handleSelectMode(defaultMode);
  }

  async function handleSaveApproach() {
    if (!hasModeChanged || saveStatus === "saving") {
      return;
    }

    setSaveStatus("saving");

    try {
      const result = await updateRelationshipIntelligenceMode({
        relationshipId,
        mode: draftMode,
        client,
      });

      setSavedMode(draftMode);
      setSaveStatus("saved");
      onSaved(draftMode, result.client);

      showToast({
        type: "success",
        title: "Approach saved",
        description:
          draftMode === "manual"
            ? "AI-generated preparation is turned off for this relationship."
            : "Refresh the preparation brief to apply the new approach.",
      });

      window.setTimeout(() => {
        setSaveStatus("idle");
        onClose();
      }, 1200);
    } catch (error) {
      console.error("Unable to save intelligence approach", error);

      setSaveStatus("error");

      showToast({
        type: "error",
        title: "The preparation approach could not be saved",
        description: "Your previous support level remains active.",
      });
    }
  }

  return (
    <IdentityDrawer
      open={open}
      eyebrow="Preparation"
      title="Choose preparation approach"
      description="Select how much preparation support you would like for this coaching relationship."
      supportingNote={
        <>
          Your default: <strong>{defaultModeLabel}</strong>
        </>
      }
      closeAriaLabel="Close preparation approach"
      onClose={closeDrawer}
      triggerRef={triggerRef}
      footer={
        <div className="intelligence-approach-footer">
          <div className="intelligence-approach-footer__status">
            {saveStatus === "changed" ? <span>Unsaved change</span> : null}
            {saveStatus === "saving" ? <span>Saving approach…</span> : null}
            {saveStatus === "saved" ? <span>Approach saved</span> : null}
            {saveStatus === "error" ? <span>Unable to save</span> : null}
          </div>

          <div className="intelligence-approach-footer__actions">
            <button
              type="button"
              className="secondary"
              onClick={closeDrawer}
              disabled={saveStatus === "saving"}
            >
              Cancel
            </button>

            {draftMode !== defaultMode ? (
              <button
                type="button"
                className="secondary"
                onClick={handleUseDefault}
                disabled={saveStatus === "saving"}
              >
                Use default
              </button>
            ) : null}

            <ActionButton
              status={
                saveStatus === "saving"
                  ? "loading"
                  : saveStatus === "saved"
                    ? "success"
                    : saveStatus === "error"
                      ? "error"
                      : "idle"
              }
              idleLabel="Save approach"
              loadingLabel="Saving…"
              successLabel="Approach saved"
              errorLabel="Try again"
              disabled={!hasModeChanged || saveStatus === "saving"}
              onClick={() => void handleSaveApproach()}
            />
          </div>
        </div>
      }
    >
      <p className="intelligence-default-note">
        Your default: <strong>{defaultModeLabel}</strong>
      </p>

      <fieldset className="intelligence-options preparation-approach-options">
        <legend className="sr-only">Preparation approach</legend>

        {PREPARATION_STYLE_SELECTOR_OPTIONS.map(option => {
          const mode = preparationStyleToMode(option.value);
          const selected = draftMode === mode;

          return (
            <label
              key={option.value}
              className={`intelligence-option preparation-approach-option${
                selected ? " is-selected" : ""
              }`}
            >
              <input
                type="radio"
                name="preparation-style"
                value={option.value}
                checked={selected}
                onChange={() => handleSelectMode(mode)}
              />

              <div>
                <div className="preparation-approach-option-heading">
                  <strong>{option.label}</strong>
                  <span className="preparation-approach-option__level">
                    {option.shortDescription}
                  </span>
                  {option.recommended ? (
                    <span className="preparation-approach-option__recommended">
                      Recommended
                    </span>
                  ) : null}
                </div>
                <p>{option.summary}</p>
                <p className="preparation-approach-option__best-for">
                  Best for: {option.bestFor}
                </p>
              </div>
            </label>
          );
        })}
      </fieldset>

      <p className="intelligence-scope-note">
        {preparationApproachScopeCopy("relationship")}
      </p>

      {hasModeChanged ? (
        <div
          className="intelligence-change-notice"
          role="status"
          aria-live="polite"
        >
          <strong>
            {PREPARATION_STYLE_LABELS[draftStyle]} approach selected
          </strong>
          <span>
            Save the approach to use this level for future preparation in this
            coaching relationship.
          </span>
        </div>
      ) : null}
    </IdentityDrawer>
  );
}
