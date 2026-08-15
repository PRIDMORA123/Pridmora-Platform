"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { QuickPrivateNote } from "@/components/coach/quick-private-note";
import { JourneyNextStep } from "@/components/coaching-journey/journey-next-step";
import { StagePrimaryAction } from "@/components/coaching-journey/stage-primary-action";
import { SessionSaveStatus } from "@/components/session/session-save-status";
import { useToast } from "@/components/feedback/toast-provider";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import {
  completeCoachingSession,
  startCoachingSession,
  updateCoachNotes,
} from "@/lib/coach-workspace";
import { getConciseSessionFocus, getClientFirstName } from "@/lib/session/session-display";
import { serialiseError } from "@/lib/api-client";
import type { Session } from "@/lib/types";
import type { CoachWorkspaceViewModel } from "@/types/coach-workspace";
// JourneyNextStep retained for ended state only.

export type LiveSessionWorkspaceProps = {
  initialData: CoachWorkspaceViewModel;
  session: Session;
  clientName: string;
  previousCommitment?: string | null;
  onPersist: (session: Session) => Promise<Session>;
  onSessionUpdated: (session: Session) => void;
  onEnded: () => void;
};

/**
 * Live Session Notes workspace — one continuous composition.
 * Orientation lives on the page; this is the principal work area.
 */
export function LiveSessionWorkspace({
  initialData,
  session,
  clientName,
  previousCommitment,
  onPersist,
  onSessionUpdated,
  onEnded,
}: LiveSessionWorkspaceProps) {
  const sessionRef = useRef(session);
  const persistRef = useRef(onPersist);
  const advancedNotesId = useId();

  useEffect(() => {
    persistRef.current = onPersist;
  }, [onPersist]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const [note, setNote] = useState(initialData.conversation.notes ?? "");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "unsaved" | "error"
  >("idle");
  const [ending, setEnding] = useState(false);
  const [starting, setStarting] = useState(false);

  const latestSavedRef = useRef(initialData.conversation.notes ?? "");
  const isSavingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startLockRef = useRef(false);
  const endLockRef = useRef(false);

  const { showToast } = useToast();
  const actionFeedback = useActionFeedback();

  const isLive =
    session.status === "in_progress" || session.status === "paused";
  const isEnded =
    session.status === "awaiting_completion" ||
    session.status === "completed";

  useEffect(() => {
    setNote(initialData.conversation.notes ?? "");
    latestSavedRef.current = initialData.conversation.notes ?? "";
    setSaveState("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- conversation-scoped
  }, [initialData.conversationId]);

  const saveNote = useCallback(
    async (value: string, silent = false) => {
      if (isSavingRef.current) return sessionRef.current;
      if (value === latestSavedRef.current) {
        setSaveState("saved");
        return sessionRef.current;
      }

      isSavingRef.current = true;
      setSaveState("saving");

      try {
        const saved = await updateCoachNotes({
          relationshipId: initialData.relationshipId,
          conversationId: initialData.conversationId,
          notes: value,
          session: sessionRef.current,
          persist: sessionToSave => persistRef.current(sessionToSave),
        });

        latestSavedRef.current = value;
        sessionRef.current = saved;
        onSessionUpdated(saved);
        setSaveState("saved");

        if (!silent) {
          showToast({ type: "success", title: "Private note saved" });
        }

        window.setTimeout(() => {
          setSaveState(current => (current === "saved" ? "idle" : current));
        }, 2500);

        return saved;
      } catch (error) {
        console.error("Live session note save failed", {
          operation: "live_quick_note_save",
          sessionId: initialData.conversationId,
          relationshipId: initialData.relationshipId,
          ...serialiseError(error),
        });
        setSaveState("error");
        if (!silent) {
          showToast({
            type: "error",
            title: "Private note could not be saved",
            description: "Your note remains on screen and has not been lost.",
            durationMs: 5000,
          });
        }
        return null;
      } finally {
        isSavingRef.current = false;
      }
    },
    [
      initialData.conversationId,
      initialData.relationshipId,
      onSessionUpdated,
      showToast,
    ]
  );

  function handleNoteChange(value: string) {
    setNote(value);
    setSaveState("unsaved");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveNote(value, true);
    }, 2500);
  }

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  async function ensureStarted(): Promise<Session | null> {
    if (isEnded) return sessionRef.current;
    // Already live with a start timestamp — nothing to do.
    if (isLive && sessionRef.current.sessionStartedAt) {
      return sessionRef.current;
    }
    // Planned/prepared must not auto-start; only explicit Start or
    // in_progress timestamp recovery reaches here from callers.
    if (startLockRef.current) return null;
    startLockRef.current = true;
    setStarting(true);

    try {
      const saved = await startCoachingSession({
        relationshipId: initialData.relationshipId,
        conversationId: initialData.conversationId,
        session: { ...sessionRef.current, notes: note },
        persist: sessionToSave => persistRef.current(sessionToSave),
      });
      sessionRef.current = saved;
      onSessionUpdated(saved);
      return saved;
    } catch (error) {
      console.error("Live session start failed", {
        operation: "start_session",
        sessionId: initialData.conversationId,
        relationshipId: initialData.relationshipId,
        ...serialiseError(error),
      });
      showToast({
        type: "error",
        title: "Session could not be started",
        description: "Your preparation is unchanged. Please try again.",
      });
      return null;
    } finally {
      startLockRef.current = false;
      setStarting(false);
    }
  }

  // Lifecycle integrity only: fill missing timestamps for sessions already
  // marked in_progress. Do NOT start planned/prepared on mount.
  useEffect(() => {
    if (session.status === "in_progress" && !session.sessionStartedAt) {
      void ensureStarted();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, session.status, session.sessionStartedAt]);

  async function handleExplicitStart() {
    await ensureStarted();
  }

  async function handleEndSession() {
    if (endLockRef.current || ending || isEnded || !isLive) return;

    const confirmed = window.confirm(
      "Finish this conversation and capture what changed or mattered?"
    );
    if (!confirmed) return;

    endLockRef.current = true;
    setEnding(true);

    await actionFeedback.runAction(
      async () => {
        let working = { ...sessionRef.current, notes: note };

        if (note !== latestSavedRef.current) {
          const savedNotes = await saveNote(note, true);
          if (savedNotes) working = savedNotes;
        }

        if (
          working.status !== "in_progress" &&
          working.status !== "paused"
        ) {
          const started = await ensureStarted();
          if (started) working = { ...started, notes: note };
        }

        const saved = await completeCoachingSession({
          relationshipId: initialData.relationshipId,
          conversationId: initialData.conversationId,
          elapsedSeconds: initialData.conversation.elapsedSeconds ?? 0,
          session: working,
          persist: sessionToSave => persistRef.current(sessionToSave),
        });

        sessionRef.current = saved;
        onSessionUpdated(saved);
        onEnded();
        return saved;
      },
      {
        loadingMessage: "Ending conversation…",
        successMessage: "Conversation ended",
        errorMessage: "Unable to end conversation",
        onError: error => {
          console.error("Live session end failed", {
            operation: "end_session",
            sessionId: initialData.conversationId,
            relationshipId: initialData.relationshipId,
            ...serialiseError(error),
          });
          showToast({
            type: "error",
            title: "Conversation could not be ended",
            description:
              "Your notes remain on screen. Please try ending the conversation again.",
          });
        },
      }
    );

    endLockRef.current = false;
    setEnding(false);
  }

  const focus = getConciseSessionFocus({
    purpose: session.prepPurpose,
    focus: session.focus,
    clientFirstName: getClientFirstName(clientName),
  });

  const commitment =
    previousCommitment?.trim() ||
    initialData.context.commitments[0]?.text?.trim() ||
    "";

  if (isEnded) {
    return (
      <div className="live-session-workspace live-session-workspace--ended">
        <SessionSaveStatus feedback={actionFeedback.feedback} />
        <JourneyNextStep
          now={`Session ${session.sessionNumber} conversation has ended`}
          next="Capture the outcome"
        />
        <StagePrimaryAction>
          <button
            type="button"
            className="identity-button primary"
            onClick={onEnded}
          >
            Capture the outcome
          </button>
        </StagePrimaryAction>
      </div>
    );
  }

  // Planned/prepared: require an explicit Start before lifecycle advances.
  if (!isLive) {
    return (
      <div
        className="live-session-workspace live-session-workspace--minimal"
        data-testid="live-session-awaiting-start"
      >
        <header className="live-session-workspace__person">
          <p className="eyebrow">Ready to begin</p>
          <h2>{clientName}</h2>
          {commitment ? (
            <p className="live-session-workspace__commitment-line">
              Previous commitment to revisit · {commitment}
            </p>
          ) : focus ? (
            <p className="muted">{focus}</p>
          ) : null}
          <p className="muted" style={{ marginTop: "0.75rem" }}>
            Start the conversation when you are ready. Opening this view does
            not begin the session on its own.
          </p>
        </header>

        <div className="live-session-workspace__save" aria-live="polite">
          {starting ? (
            <p className="live-session-workspace__starting">Starting…</p>
          ) : null}
          <SessionSaveStatus feedback={actionFeedback.feedback} />
        </div>

        <StagePrimaryAction>
          <button
            type="button"
            className="identity-button primary"
            data-testid="live-session-explicit-start"
            disabled={starting}
            onClick={() => {
              void handleExplicitStart();
            }}
          >
            {starting ? "Starting…" : "Start conversation"}
          </button>
        </StagePrimaryAction>
      </div>
    );
  }

  return (
    <div className="live-session-workspace live-session-workspace--minimal">
      <header className="live-session-workspace__person">
        <p className="eyebrow">In conversation</p>
        <h2>{clientName}</h2>
        {commitment ? (
          <p className="live-session-workspace__commitment-line">
            Previous commitment to revisit · {commitment}
          </p>
        ) : focus ? (
          <p className="muted">{focus}</p>
        ) : null}
      </header>

      <div className="live-session-workspace__save" aria-live="polite">
        {starting ? (
          <p className="live-session-workspace__starting">Starting…</p>
        ) : null}
        <SessionSaveStatus feedback={actionFeedback.feedback} />
      </div>

      <QuickPrivateNote
        value={note}
        disabled={false}
        saveState={saveState}
        onChange={handleNoteChange}
        onSave={() => {
          void saveNote(note, true);
        }}
      />

      <details className="live-session-workspace__advanced">
        <summary>Optional prompts</summary>
        <div id={advancedNotesId} className="live-session-workspace__legacy">
          <p className="muted">
            Keep attention on the person. Use prompts only if helpful.
          </p>
        </div>
      </details>

      <StagePrimaryAction>
        <button
          type="button"
          className="identity-button primary"
          disabled={ending || actionFeedback.isLoading}
          onClick={() => {
            void handleEndSession();
          }}
        >
          {ending ? "Finishing…" : "Finish Conversation"}
        </button>
      </StagePrimaryAction>
    </div>
  );
}
