"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { CoachingMomentCapture } from "@/components/coaching-moments/coaching-moment-capture";
import { CoachingMomentConversation } from "@/components/coaching-moments/coaching-moment-conversation";
import { CoachingMomentGuidanceCard } from "@/components/coaching-moments/coaching-moment-guidance";
import { CoachingMomentPrepare } from "@/components/coaching-moments/coaching-moment-prepare";
import { CoachingMomentInsightReview } from "@/components/coaching-moments/coaching-moment-insight-review";
import {
  CoachingMomentSaveState,
  CoachingMomentStatusBadge,
} from "@/components/coaching-moments/coaching-moment-status";
import { apiJson } from "@/lib/api-client";
import {
  coachingMomentStage,
  guidanceFromMoment,
  type CoachingMoment,
} from "@/lib/coaching-moments/coaching-moment";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import { resolveProductLanguage } from "@/lib/role-language";

type WorkspaceView =
  | "prepare"
  | "guidance"
  | "conversation"
  | "capture"
  | "insight"
  | "done";

export type CoachingMomentWorkspaceProps = {
  open: boolean;
  clientId: string;
  clientName: string;
  initialMoment?: CoachingMoment | null;
  onClose: () => void;
  onSaved?: (moment: CoachingMoment) => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
};

type MomentResponse = { moment: CoachingMoment };

export function CoachingMomentWorkspace({
  open,
  clientId,
  clientName,
  initialMoment = null,
  onClose,
  onSaved,
  triggerRef,
}: CoachingMomentWorkspaceProps) {
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);
  const [moment, setMoment] = useState<CoachingMoment | null>(initialMoment);
  const [view, setView] = useState<WorkspaceView>("prepare");
  const [situation, setSituation] = useState(initialMoment?.situation ?? "");
  const [desiredOutcome, setDesiredOutcome] = useState(
    initialMoment?.desiredOutcome ?? ""
  );
  const [privateNote, setPrivateNote] = useState(
    initialMoment?.privateNote ?? ""
  );
  const [whatHappened, setWhatHappened] = useState(
    initialMoment?.outcomeNotes ?? ""
  );
  const [whatWasAgreed, setWhatWasAgreed] = useState(
    initialMoment?.agreedCommitment ?? ""
  );
  const [followUp, setFollowUp] = useState(initialMoment?.followUp ?? "");
  const [noCommitment, setNoCommitment] = useState(
    initialMoment?.noCommitmentAgreed ?? false
  );
  const [insightSummary, setInsightSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "unsaved" | "error"
  >("idle");
  const [confirmClose, setConfirmClose] = useState(false);
  const creatingRef = useRef(false);
  const guidanceRequestRef = useRef(false);
  const dirtyRef = useRef(false);

  const syncFromMoment = useCallback((next: CoachingMoment) => {
    setMoment(next);
    setSituation(next.situation);
    setDesiredOutcome(next.desiredOutcome ?? "");
    setPrivateNote(next.privateNote);
    setWhatHappened(next.outcomeNotes ?? "");
    setWhatWasAgreed(next.agreedCommitment ?? "");
    setFollowUp(next.followUp ?? "");
    setNoCommitment(next.noCommitmentAgreed);
    if (next.generatedInsight?.summary) {
      setInsightSummary(next.generatedInsight.summary);
    }

    const stage = coachingMomentStage(next.status);
    if (next.status === "prepared" && next.generatedIntention) {
      setView("guidance");
    } else if (stage === "conversation") {
      setView("conversation");
    } else if (stage === "capture") {
      setView("capture");
    } else if (
      next.insightStatus === "draft" &&
      next.generatedInsight
    ) {
      setView("insight");
    } else if (stage === "complete") {
      setView("done");
    } else {
      setView("prepare");
    }
  }, []);

  useEffect(() => {
    if (!open) {
      creatingRef.current = false;
      guidanceRequestRef.current = false;
      dirtyRef.current = false;
      setConfirmClose(false);
      setError(null);
      setBusy(false);
      setSaveState("idle");
      setMoment(null);
      setView("prepare");
      setSituation("");
      setDesiredOutcome("");
      setPrivateNote("");
      setWhatHappened("");
      setWhatWasAgreed("");
      setFollowUp("");
      setNoCommitment(false);
      setInsightSummary("");
      return;
    }

    if (initialMoment) {
      syncFromMoment(initialMoment);
      return;
    }

    if (creatingRef.current) return;
    creatingRef.current = true;
    setBusy(true);
    setError(null);

    void apiJson<MomentResponse>("/api/coaching-moments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", clientId }),
    })
      .then(response => {
        syncFromMoment(response.moment);
      })
      .catch(() => {
        setError(
          `Unable to start a ${language.momentSingular.toLowerCase()}. Please try again.`
        );
      })
      .finally(() => {
        setBusy(false);
        creatingRef.current = false;
      });
  }, [open, clientId, initialMoment, syncFromMoment]);

  function markDirty() {
    dirtyRef.current = true;
    if (saveState === "saved") setSaveState("unsaved");
  }

  function requestClose() {
    if (busy) return;
    if (dirtyRef.current && view !== "done") {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  async function ensureMomentId(): Promise<string | null> {
    if (moment?.id) return moment.id;
    return null;
  }

  async function handlePrepareGuidance() {
    if (!situation.trim() || guidanceRequestRef.current) return;
    const momentId = await ensureMomentId();
    if (!momentId) return;

    guidanceRequestRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const response = await apiJson<MomentResponse>("/api/coaching-moments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare_guidance",
          momentId,
          clientId,
          situation,
          desiredOutcome: desiredOutcome || null,
        }),
      });
      dirtyRef.current = false;
      setSaveState("saved");
      syncFromMoment(response.moment);
      setView("guidance");
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Guidance could not be prepared. Your notes remain available, and you can continue without AI support.";
      setError(
        message.includes("Guidance could not")
          ? message
          : "Guidance could not be prepared. Your notes remain available, and you can continue without AI support."
      );
    } finally {
      setBusy(false);
      guidanceRequestRef.current = false;
    }
  }

  async function handleContinueWithoutGuidance() {
    if (!situation.trim()) {
      setError("Describe the conversation you are preparing for.");
      return;
    }
    const momentId = await ensureMomentId();
    if (!momentId) return;

    setBusy(true);
    setError(null);
    try {
      const response = await apiJson<MomentResponse>("/api/coaching-moments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "continue_without_guidance",
          momentId,
          situation,
          desiredOutcome: desiredOutcome || null,
        }),
      });
      dirtyRef.current = false;
      setSaveState("saved");
      syncFromMoment(response.moment);
      setView("conversation");
    } catch {
      setError("Unable to start the conversation. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleStartFromGuidance() {
    const momentId = await ensureMomentId();
    if (!momentId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiJson<MomentResponse>("/api/coaching-moments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", momentId }),
      });
      syncFromMoment(response.moment);
      setView("conversation");
    } catch {
      setError("Unable to start the conversation. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePrivateNote() {
    const momentId = await ensureMomentId();
    if (!momentId) return;
    setSaveState("saving");
    try {
      const response = await apiJson<MomentResponse>("/api/coaching-moments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_private_note",
          momentId,
          privateNote,
        }),
      });
      setMoment(response.moment);
      dirtyRef.current = false;
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  async function handleSaveOutcome(thenInsight = false) {
    if (!whatHappened.trim()) {
      setError("Capture what happened before saving.");
      return;
    }
    const momentId = await ensureMomentId();
    if (!momentId) return;

    setBusy(true);
    setError(null);
    setSaveState("saving");

    try {
      const response = await apiJson<MomentResponse>("/api/coaching-moments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_outcome",
          momentId,
          outcomeNotes: whatHappened,
          agreedCommitment: noCommitment ? null : whatWasAgreed || null,
          noCommitmentAgreed: noCommitment,
          followUp: followUp || null,
        }),
      });
      dirtyRef.current = false;
      setSaveState("saved");
      syncFromMoment(response.moment);
      onSaved?.(response.moment);

      if (thenInsight) {
        await handleGenerateInsight(response.moment.id);
      } else {
        const completed = await apiJson<MomentResponse>(
          "/api/coaching-moments",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "complete",
              momentId: response.moment.id,
            }),
          }
        );
        syncFromMoment(completed.moment);
        onSaved?.(completed.moment);
        setView("done");
      }
    } catch {
      setSaveState("unsaved");
      setError("Unable to save. Your notes remain here — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateInsight(momentId?: string) {
    const id = momentId ?? (await ensureMomentId());
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiJson<MomentResponse>("/api/coaching-moments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_insight", momentId: id }),
      });
      syncFromMoment(response.moment);
      setInsightSummary(response.moment.generatedInsight?.summary ?? "");
      setView("insight");
    } catch {
      setError(
        `Insight could not be created right now. Your ${language.momentSingular.toLowerCase()} remains saved.`
      );
      setView("done");
    } finally {
      setBusy(false);
    }
  }

  async function handleInsightDecision(
    decision: "accepted" | "edited" | "discarded"
  ) {
    const momentId = await ensureMomentId();
    if (!momentId || !moment?.generatedInsight) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiJson<MomentResponse>("/api/coaching-moments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review_insight",
          momentId,
          insightDecision: decision,
          insight:
            decision === "discarded"
              ? null
              : {
                  ...moment.generatedInsight,
                  summary: insightSummary.trim() || moment.generatedInsight.summary,
                },
        }),
      });
      syncFromMoment(response.moment);
      onSaved?.(response.moment);
      setView("done");
    } catch {
      setError("Unable to update the insight. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscard() {
    const momentId = await ensureMomentId();
    if (!momentId) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await apiJson<MomentResponse>("/api/coaching-moments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discard", momentId }),
      });
      dirtyRef.current = false;
      onClose();
    } catch {
      setError("Unable to discard. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const guidance = moment ? guidanceFromMoment(moment) : null;
  const title =
    view === "conversation"
      ? language.momentSingular
      : view === "capture"
        ? "Capture outcome"
        : view === "insight"
          ? "Review insight"
          : view === "done"
            ? `${language.momentSingular} saved`
            : language.newMomentLabel;

  return (
    <>
      <Modal
        isOpen={open}
        title={title}
        eyebrow={clientName}
        onClose={requestClose}
        closeDisabled={busy}
        size="lg"
        footer={
          view === "prepare" ? (
            <>
              <button
                type="button"
                className="identity-modal-button identity-modal-button--secondary"
                disabled={busy || !situation.trim()}
                onClick={() => void handleContinueWithoutGuidance()}
              >
                Continue without guidance
              </button>
              <button
                type="button"
                className="identity-modal-button identity-modal-button--primary"
                disabled={busy || !situation.trim()}
                aria-busy={busy}
                onClick={() => void handlePrepareGuidance()}
              >
                {busy ? "Preparing…" : "Prepare guidance"}
              </button>
            </>
          ) : view === "capture" ? (
            <>
              <button
                type="button"
                className="identity-modal-button identity-modal-button--secondary"
                disabled={busy || !whatHappened.trim()}
                onClick={() => void handleSaveOutcome(true)}
              >
                Create concise insight
              </button>
              <button
                type="button"
                className="identity-modal-button identity-modal-button--primary"
                disabled={busy || !whatHappened.trim()}
                aria-busy={busy}
                onClick={() => void handleSaveOutcome(false)}
              >
                {busy ? "Saving…" : language.saveMomentLabel}
              </button>
            </>
          ) : view === "done" ? (
            <button
              type="button"
              className="identity-modal-button identity-modal-button--primary"
              onClick={onClose}
            >
              Done
            </button>
          ) : view === "guidance" || view === "conversation" || view === "insight" ? (
            <button
              type="button"
              className="identity-modal-button identity-modal-button--secondary"
              disabled={busy}
              onClick={requestClose}
            >
              Close
            </button>
          ) : (
            <button
              type="button"
              className="identity-modal-button identity-modal-button--secondary"
              disabled={busy}
              onClick={requestClose}
            >
              Cancel
            </button>
          )
        }
      >
        <div className="coaching-moment-workspace">
          {moment ? <CoachingMomentStatusBadge moment={moment} /> : null}
          <CoachingMomentSaveState state={saveState} />

          <p className="coaching-moment-record-note" aria-live="polite">
            {view === "done"
              ? `Saved as a ${language.momentSingular} — not a formal ${language.conversationSingular}.`
              : `This will be added to the development record as a ${language.momentSingular}, not a formal ${language.conversationSingular}.`}
          </p>

          {view === "prepare" ? (
            <CoachingMomentPrepare
              situation={situation}
              desiredOutcome={desiredOutcome}
              disabled={busy}
              error={error}
              onSituationChange={value => {
                setSituation(value);
                markDirty();
              }}
              onDesiredOutcomeChange={value => {
                setDesiredOutcome(value);
                markDirty();
              }}
            />
          ) : null}

          {view === "guidance" && guidance ? (
            <CoachingMomentGuidanceCard
              guidance={guidance}
              busy={busy}
              onBack={() => setView("prepare")}
              onStartConversation={() => void handleStartFromGuidance()}
            />
          ) : null}

          {view === "conversation" ? (
            <CoachingMomentConversation
              clientName={clientName}
              intention={moment?.generatedIntention}
              opening={moment?.generatedOpening}
              privateNote={privateNote}
              saveState={saveState}
              disabled={busy}
              onPrivateNoteChange={value => {
                setPrivateNote(value);
                markDirty();
              }}
              onPrivateNoteSave={() => void handleSavePrivateNote()}
              onEndConversation={() => setView("capture")}
            />
          ) : null}

          {view === "capture" ? (
            <CoachingMomentCapture
              whatHappened={whatHappened}
              whatWasAgreed={whatWasAgreed}
              followUp={followUp}
              noCommitmentAgreed={noCommitment}
              disabled={busy}
              error={error}
              onWhatHappenedChange={value => {
                setWhatHappened(value);
                markDirty();
              }}
              onWhatWasAgreedChange={value => {
                setWhatWasAgreed(value);
                markDirty();
              }}
              onFollowUpChange={value => {
                setFollowUp(value);
                markDirty();
              }}
              onNoCommitmentChange={value => {
                setNoCommitment(value);
                markDirty();
              }}
            />
          ) : null}

          {view === "insight" && moment?.generatedInsight ? (
            <CoachingMomentInsightReview
              insight={moment.generatedInsight}
              editedSummary={insightSummary}
              busy={busy}
              error={error}
              onEditedSummaryChange={setInsightSummary}
              onKeep={() => void handleInsightDecision("accepted")}
              onSaveEdit={() => void handleInsightDecision("edited")}
              onDiscard={() => void handleInsightDecision("discarded")}
            />
          ) : null}

          {view === "done" ? (
            <div className="coaching-moment-done">
              <p>
                Your {language.momentSingular} for <strong>{clientName}</strong> has been
                saved. It may inform Current Position and Development where
                relevant, without counting as a formal session.
              </p>
              {error ? (
                <p className="coaching-moment-error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}

          {view === "prepare" && moment?.status === "draft" ? (
            <button
              type="button"
              className="identity-button is-quiet coaching-moment-discard"
              disabled={busy}
              onClick={() => void handleDiscard()}
            >
              Discard draft
            </button>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmClose}
        title="Leave without saving?"
        onClose={() => setConfirmClose(false)}
        footer={
          <>
            <button
              type="button"
              className="secondary"
              onClick={() => setConfirmClose(false)}
            >
              Keep editing
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                setConfirmClose(false);
                dirtyRef.current = false;
                onClose();
                // Restore focus to launcher when possible
                triggerRef?.current?.focus?.();
              }}
            >
              Leave
            </button>
          </>
        }
      >
        <p>
          You have unsaved changes. Leaving now will discard content that has
          not been saved.
        </p>
      </ConfirmDialog>
    </>
  );
}
