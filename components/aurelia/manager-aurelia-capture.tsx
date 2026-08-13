"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { apiJson, errorMessage } from "@/lib/api-client";
import {
  MANAGER_AURELIA_CAPTURE_UNAVAILABLE,
  toManagerAureliaUserError,
} from "@/lib/ai/manager-aurelia-user-errors";
import {
  reflectionDraftHasNote,
  type ManagerAureliaActionDraft,
  type ManagerAureliaCaptureType,
  type ManagerAureliaReflectionDraft,
} from "@/lib/ai/manager-aurelia-propose-capture";
import type { ManagerAureliaTurn } from "@/lib/ai/manager-aurelia-conversation";
import { BRAND } from "@/lib/brand";

type CapturePhase =
  | "closed"
  | "choice"
  | "proposing"
  | "review-reflection"
  | "review-action"
  | "saving"
  | "success";

type Props = {
  open: boolean;
  turns: ManagerAureliaTurn[];
  onClose: () => void;
  /** Navigation only — does not change capture behaviour. */
  onViewMyDevelopment?: () => void;
};

export function ManagerAureliaCapturePanel({
  open,
  turns,
  onClose,
  onViewMyDevelopment,
}: Props) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const noticeId = useId();
  const [phase, setPhase] = useState<CapturePhase>("closed");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [reflectionDraft, setReflectionDraft] =
    useState<ManagerAureliaReflectionDraft>({
      title: "",
      whatNoticed: "",
      practiseNext: "",
    });
  const [actionDraft, setActionDraft] = useState<ManagerAureliaActionDraft>({
    title: "",
  });

  useEffect(() => {
    if (open) {
      setPhase("choice");
      setError("");
      setSuccessMessage("");
      return;
    }
    setPhase("closed");
  }, [open]);

  function closeAll() {
    setPhase("closed");
    setError("");
    setSuccessMessage("");
    onClose();
  }

  async function propose(captureType: ManagerAureliaCaptureType) {
    if (turns.length === 0) {
      setError("Have a short conversation before capturing something.");
      return;
    }
    setError("");
    setPhase("proposing");
    try {
      const data = await apiJson<{
        captureType: ManagerAureliaCaptureType;
        draft: ManagerAureliaReflectionDraft | ManagerAureliaActionDraft;
      }>("/api/my-development/aurelia/propose-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captureType, turns }),
        operation: "manager-aurelia-propose-capture",
      });

      if (captureType === "reflection") {
        const draft = data.draft as ManagerAureliaReflectionDraft;
        setReflectionDraft({
          title: draft.title || "Development reflection",
          whatNoticed: draft.whatNoticed || "",
          practiseNext: draft.practiseNext || "",
        });
        setPhase("review-reflection");
        return;
      }

      const draft = data.draft as ManagerAureliaActionDraft;
      setActionDraft({
        title: draft.title || "",
        due: draft.due,
      });
      setPhase("review-action");
    } catch (err) {
      setError(
        toManagerAureliaUserError(err, MANAGER_AURELIA_CAPTURE_UNAVAILABLE)
      );
      setPhase("choice");
    }
  }

  async function confirmReflection() {
    if (!reflectionDraftHasNote(reflectionDraft)) {
      setError("Add at least one reflection note before saving.");
      return;
    }
    setError("");
    setPhase("saving");
    try {
      await apiJson("/api/my-development/reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: reflectionDraft.title.trim(),
          whatNoticed: reflectionDraft.whatNoticed.trim(),
          practiseNext: reflectionDraft.practiseNext.trim(),
        }),
        operation: "manager-aurelia-capture-reflection",
      });
      setSuccessMessage("Reflection saved to your My Development record.");
      setPhase("success");
    } catch (err) {
      setError(
        errorMessage(err, "Unable to save the reflection. Please try again.")
      );
      setPhase("review-reflection");
    }
  }

  async function confirmAction() {
    const title = actionDraft.title.trim();
    if (!title) {
      setError("Add an action title before saving.");
      return;
    }
    setError("");
    setPhase("saving");
    try {
      await apiJson("/api/my-development/aurelia/capture-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          due: actionDraft.due?.trim() || undefined,
        }),
        operation: "manager-aurelia-capture-action",
      });
      setSuccessMessage("Action saved to your My Development record.");
      setPhase("success");
    } catch (err) {
      setError(
        errorMessage(err, "Unable to save the action. Please try again.")
      );
      setPhase("review-action");
    }
  }

  if (!open || phase === "closed") return null;

  const busy = phase === "proposing" || phase === "saving";
  const modalTitle =
    phase === "choice"
      ? "Take something forward"
      : phase === "proposing"
        ? "Preparing a draft"
        : phase === "review-reflection"
          ? "Review reflection"
          : phase === "review-action"
            ? "Review action"
            : phase === "saving"
              ? "Saving"
              : "Saved";

  return (
    <Modal
      isOpen
      title={modalTitle}
      eyebrow={BRAND.intelligenceName}
      descriptionId={noticeId}
      onClose={closeAll}
      closeDisabled={busy}
      size="md"
      initialFocusRef={titleInputRef}
      footer={
        <>
          {phase === "choice" ? (
            <button
              type="button"
              className="identity-button is-quiet"
              onClick={closeAll}
              data-testid="manager-aurelia-capture-nothing"
            >
              Nothing to save
            </button>
          ) : null}
          {phase === "review-reflection" ? (
            <>
              <button
                type="button"
                className="identity-button is-quiet"
                onClick={closeAll}
              >
                Cancel
              </button>
              <button
                type="button"
                className="identity-button is-primary"
                onClick={() => void confirmReflection()}
                data-testid="manager-aurelia-capture-confirm-reflection"
              >
                Save reflection
              </button>
            </>
          ) : null}
          {phase === "review-action" ? (
            <>
              <button
                type="button"
                className="identity-button is-quiet"
                onClick={closeAll}
              >
                Cancel
              </button>
              <button
                type="button"
                className="identity-button is-primary"
                onClick={() => void confirmAction()}
                data-testid="manager-aurelia-capture-confirm-action"
              >
                Save action
              </button>
            </>
          ) : null}
          {phase === "success" ? (
            <>
              {onViewMyDevelopment ? (
                <button
                  type="button"
                  className="identity-button is-secondary"
                  onClick={() => {
                    closeAll();
                    onViewMyDevelopment();
                  }}
                  data-testid="manager-aurelia-capture-view-my-development"
                >
                  View My Development
                </button>
              ) : null}
              <button
                type="button"
                className="identity-button is-primary"
                onClick={closeAll}
                data-testid="manager-aurelia-capture-success-done"
              >
                Done
              </button>
            </>
          ) : null}
        </>
      }
    >
      <div className="manager-aurelia-capture" data-testid="manager-aurelia-capture">
        {error ? (
          <p className="manager-aurelia-capture__error" role="alert">
            {error}
          </p>
        ) : null}

        {phase === "choice" ? (
          <div className="manager-aurelia-capture__choice">
            <p id={noticeId} className="manager-aurelia-capture__lead muted">
              Choose what to keep from this private conversation. The chat itself
              is not saved unless you confirm a capture.
            </p>
            <button
              type="button"
              className="identity-button is-secondary manager-aurelia-capture__choice-button"
              onClick={() => void propose("reflection")}
              data-testid="manager-aurelia-capture-choose-reflection"
            >
              Capture a reflection
            </button>
            <button
              type="button"
              className="identity-button is-secondary manager-aurelia-capture__choice-button"
              onClick={() => void propose("action")}
              data-testid="manager-aurelia-capture-choose-action"
            >
              Create an action
            </button>
          </div>
        ) : null}

        {phase === "proposing" || phase === "saving" ? (
          <p className="muted" id={noticeId}>
            {phase === "proposing"
              ? `${BRAND.intelligenceName} is preparing a short draft for you to edit…`
              : "Saving to your My Development record…"}
          </p>
        ) : null}

        {phase === "review-reflection" ? (
          <div className="manager-aurelia-capture__form">
            <p id={noticeId} className="manager-aurelia-capture__notice">
              Saving this reflection adds it to your My Development record and
              contributes to your development picture. Prefer describing the
              situation without naming colleagues if this will sit in your
              development record.
            </p>
            <label className="manager-aurelia-capture__label">
              Title
              <input
                ref={titleInputRef}
                className="manager-aurelia-capture__input"
                value={reflectionDraft.title}
                onChange={event =>
                  setReflectionDraft(current => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                maxLength={120}
              />
            </label>
            <label className="manager-aurelia-capture__label">
              What I noticed
              <textarea
                className="manager-aurelia-capture__textarea"
                value={reflectionDraft.whatNoticed}
                onChange={event =>
                  setReflectionDraft(current => ({
                    ...current,
                    whatNoticed: event.target.value,
                  }))
                }
                rows={4}
              />
            </label>
            <label className="manager-aurelia-capture__label">
              What I will practise next
              <textarea
                className="manager-aurelia-capture__textarea"
                value={reflectionDraft.practiseNext}
                onChange={event =>
                  setReflectionDraft(current => ({
                    ...current,
                    practiseNext: event.target.value,
                  }))
                }
                rows={3}
              />
            </label>
          </div>
        ) : null}

        {phase === "review-action" ? (
          <div className="manager-aurelia-capture__form">
            <p id={noticeId} className="manager-aurelia-capture__notice">
              Saving this action adds it to your My Development record. Prefer
              wording that keeps ownership with you rather than naming
              colleagues unless necessary.
            </p>
            <label className="manager-aurelia-capture__label">
              Action
              <input
                ref={titleInputRef}
                className="manager-aurelia-capture__input"
                value={actionDraft.title}
                onChange={event =>
                  setActionDraft(current => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                maxLength={120}
                data-testid="manager-aurelia-capture-action-title"
              />
            </label>
            <label className="manager-aurelia-capture__label">
              Due date (optional)
              <input
                className="manager-aurelia-capture__input"
                type="date"
                value={actionDraft.due || ""}
                onChange={event =>
                  setActionDraft(current => ({
                    ...current,
                    due: event.target.value || undefined,
                  }))
                }
              />
            </label>
          </div>
        ) : null}

        {phase === "success" ? (
          <p id={noticeId} data-testid="manager-aurelia-capture-success">
            {successMessage}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
