"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CoachNotesEditor } from "@/components/coach/coach-notes-editor";
import { CoachingContextPanel } from "@/components/coach/coaching-context-panel";
import { SessionActionBar } from "@/components/coach/session-action-bar";
import { SessionContextHeader } from "@/components/coach/session-context-header";
import { IntelligenceModeIndicator } from "@/components/coaching-intelligence/intelligence-mode-indicator";
import { useToast } from "@/components/feedback/toast-provider";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import {
  completeCoachingSession,
  pauseCoachingSession,
  resumeCoachingSession,
  startCoachingSession,
  updateCoachNotes,
} from "@/lib/coach-workspace";
import { preparationStyleToMode } from "@/lib/coaching-intelligence/mode";
import type { Session } from "@/lib/types";
import { toActionButtonStatus } from "@/types/action-feedback";
import type {
  CoachWorkspaceViewModel,
  SaveState,
  SessionStatus,
  SuggestedQuestion,
} from "@/types/coach-workspace";
import type { CoachingIntelligenceMode } from "@/types/coaching-intelligence";

type CoachWorkspacePageProps = {
  initialData: CoachWorkspaceViewModel;
  session: Session;
  preparation?: string;
  intelligenceMode?: CoachingIntelligenceMode;
  onPersist: (session: Session) => Promise<Session>;
  onSessionUpdated: (session: Session) => void;
  onContinueToReflection: () => void;
};

export function CoachWorkspacePage({
  initialData,
  session,
  preparation = "",
  intelligenceMode,
  onPersist,
  onSessionUpdated,
  onContinueToReflection,
}: CoachWorkspacePageProps) {
  const resolvedMode =
    intelligenceMode ??
    (session.intelligenceMode
      ? session.intelligenceMode
      : preparationStyleToMode(session.prepAiBriefStyle || "guided"));
  const sessionRef = useRef(session);
  const persistRef = useRef(onPersist);

  useEffect(() => {
    persistRef.current = onPersist;
  }, [onPersist]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const [notes, setNotes] = useState(initialData.conversation.notes ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>(
    initialData.conversation.status
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(
    initialData.conversation.elapsedSeconds ?? 0
  );
  const [isContextOpen, setIsContextOpen] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSavedNotesRef = useRef(initialData.conversation.notes ?? "");
  const isSavingRef = useRef(false);

  const { showToast } = useToast();
  const sessionFeedback = useActionFeedback();
  const isTimerRunning = sessionStatus === "in_progress";

  useEffect(() => {
    setNotes(initialData.conversation.notes ?? "");
    latestSavedNotesRef.current = initialData.conversation.notes ?? "";
    setSessionStatus(initialData.conversation.status);
    setElapsedSeconds(initialData.conversation.elapsedSeconds ?? 0);
    setSaveState("idle");
    // Re-hydrate only when the conversation workspace changes — not on every parent save.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional conversation-scoped reset
  }, [initialData.conversationId]);

  useEffect(() => {
    if (!isTimerRunning) return;

    const interval = window.setInterval(() => {
      setElapsedSeconds(current => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isTimerRunning]);

  const saveNotes = useCallback(
    async (value: string, silent = false) => {
      if (isSavingRef.current) return sessionRef.current;

      if (value === latestSavedNotesRef.current) {
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

        latestSavedNotesRef.current = value;
        sessionRef.current = saved;
        onSessionUpdated(saved);
        setSaveState("saved");

        if (!silent) {
          showToast({
            type: "success",
            title: "Coach notes saved",
          });
        }

        window.setTimeout(() => {
          setSaveState(current => (current === "saved" ? "idle" : current));
        }, 2500);

        return saved;
      } catch (error) {
        console.error("Unable to save coach notes", error);

        setSaveState("error");

        if (!silent) {
          showToast({
            type: "error",
            title: "Coach notes could not be saved",
            description: "Your notes remain on screen. Please try again.",
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

  function handleNotesChange(value: string) {
    setNotes(value);
    setSaveState("unsaved");

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      void saveNotes(value, true);
    }, 2500);
  }

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  async function handleManualSave() {
    if (saveState === "saving") return;
    await saveNotes(notes);
  }

  async function handleStartSession() {
    if (sessionStatus === "in_progress") return;

    await sessionFeedback.runAction(
      async () => {
        const saved = await startCoachingSession({
          relationshipId: initialData.relationshipId,
          conversationId: initialData.conversationId,
          session: { ...sessionRef.current, notes },
          persist: sessionToSave => persistRef.current(sessionToSave),
        });

        sessionRef.current = saved;
        onSessionUpdated(saved);
        setSessionStatus("in_progress");
        return saved;
      },
      {
        loadingMessage: "Starting…",
        successMessage: "Conversation started",
        errorMessage: "Unable to start conversation",
        onSuccess: () => {
          showToast({ type: "success", title: "Conversation started" });
        },
        onError: error => {
          console.error("Unable to start conversation", error);
          showToast({
            type: "error",
            title: "Conversation could not be started",
          });
        },
      }
    );
  }

  async function handlePauseSession() {
    if (sessionStatus !== "in_progress") return;

    await sessionFeedback.runAction(
      async () => {
        const saved = await pauseCoachingSession({
          conversationId: initialData.conversationId,
          elapsedSeconds,
          session: { ...sessionRef.current, notes },
          persist: sessionToSave => persistRef.current(sessionToSave),
        });

        sessionRef.current = saved;
        onSessionUpdated(saved);
        setSessionStatus("paused");
        return saved;
      },
      {
        loadingMessage: "Pausing…",
        successMessage: "Conversation paused",
        errorMessage: "Unable to pause conversation",
        onSuccess: () => {
          showToast({ type: "success", title: "Conversation paused" });
        },
        onError: error => {
          console.error("Unable to pause conversation", error);
          showToast({
            type: "error",
            title: "Conversation could not be paused",
          });
        },
      }
    );
  }

  async function handleResumeSession() {
    if (sessionStatus !== "paused") return;

    await sessionFeedback.runAction(
      async () => {
        const saved = await resumeCoachingSession({
          conversationId: initialData.conversationId,
          session: { ...sessionRef.current, notes },
          persist: sessionToSave => persistRef.current(sessionToSave),
        });

        sessionRef.current = saved;
        onSessionUpdated(saved);
        setSessionStatus("in_progress");
        return saved;
      },
      {
        loadingMessage: "Resuming…",
        successMessage: "Conversation resumed",
        errorMessage: "Unable to resume conversation",
        onSuccess: () => {
          showToast({ type: "success", title: "Conversation resumed" });
        },
        onError: error => {
          console.error("Unable to resume conversation", error);
          showToast({
            type: "error",
            title: "Conversation could not be resumed",
          });
        },
      }
    );
  }

  async function handleCompleteSession() {
    if (sessionStatus !== "in_progress" && sessionStatus !== "paused") {
      return;
    }

    const confirmed = window.confirm(
      "Complete this coaching conversation? You will still be able to review the notes afterwards."
    );

    if (!confirmed) return;

    await sessionFeedback.runAction(
      async () => {
        let working = { ...sessionRef.current, notes };

        if (notes !== latestSavedNotesRef.current) {
          const savedNotes = await saveNotes(notes, true);
          if (savedNotes) working = savedNotes;
        }

        const saved = await completeCoachingSession({
          relationshipId: initialData.relationshipId,
          conversationId: initialData.conversationId,
          elapsedSeconds,
          session: working,
          persist: sessionToSave => persistRef.current(sessionToSave),
        });

        sessionRef.current = saved;
        onSessionUpdated(saved);
        setSessionStatus("completed");
        return saved;
      },
      {
        loadingMessage: "Completing…",
        successMessage: "Conversation completed",
        errorMessage: "Unable to complete conversation",
        onSuccess: () => {
          showToast({
            type: "success",
            title: "Conversation completed",
            description: "The session is ready for reflection and summary.",
          });
        },
        onError: error => {
          console.error("Unable to complete conversation", error);
          showToast({
            type: "error",
            title: "Conversation could not be completed",
          });
        },
      }
    );
  }

  function handleInsertQuestion(question: SuggestedQuestion) {
    const prefix = notes.trim().length > 0 ? "\n\n" : "";
    const nextNotes = `${notes}${prefix}${question.text}\n`;
    handleNotesChange(nextNotes);
  }

  function handleAddSupportToNotes(content: string) {
    const prefix = notes.trim().length > 0 ? "\n\n" : "";
    handleNotesChange(`${notes}${prefix}${content.trim()}\n`);
  }

  return (
    <main className="identity-coach-page">
      <SessionContextHeader
        client={initialData.client}
        conversation={initialData.conversation}
        sessionStatus={sessionStatus}
        onOpenContext={() => setIsContextOpen(true)}
        intelligenceIndicator={
          <IntelligenceModeIndicator
            mode={resolvedMode}
            usedSources={session.intelligenceSources}
            lastRefreshedAt={
              session.intelligenceLastRefreshedAt ||
              session.prepAiBriefGeneratedAt ||
              null
            }
          />
        }
      />

      <div className="identity-coach-layout">
        <CoachNotesEditor
          value={notes}
          saveState={saveState}
          disabled={sessionStatus === "completed"}
          onChange={handleNotesChange}
          onSave={() => {
            void handleManualSave();
          }}
        />

        <CoachingContextPanel
          focus={initialData.conversation.focus}
          commitments={initialData.context.commitments}
          insights={initialData.context.insights}
          suggestedQuestions={initialData.context.suggestedQuestions}
          elapsedSeconds={elapsedSeconds}
          sessionStatus={sessionStatus}
          notes={notes}
          clientName={initialData.client.name}
          preparation={preparation}
          isOpen={isContextOpen}
          onClose={() => setIsContextOpen(false)}
          onInsertQuestion={handleInsertQuestion}
          onAddSupportToNotes={handleAddSupportToNotes}
          onStartSession={() => {
            void handleStartSession();
          }}
          onPauseSession={() => {
            void handlePauseSession();
          }}
          onResumeSession={() => {
            void handleResumeSession();
          }}
        />
      </div>

      <SessionActionBar
        saveState={saveState}
        sessionStatus={sessionStatus}
        sessionActionStatus={toActionButtonStatus(sessionFeedback.feedback.status)}
        busy={sessionFeedback.isLoading}
        onSave={() => {
          void handleManualSave();
        }}
        onStart={() => {
          void handleStartSession();
        }}
        onPause={() => {
          void handlePauseSession();
        }}
        onResume={() => {
          void handleResumeSession();
        }}
        onComplete={() => {
          void handleCompleteSession();
        }}
        onContinueToReflection={onContinueToReflection}
      />
    </main>
  );
}
