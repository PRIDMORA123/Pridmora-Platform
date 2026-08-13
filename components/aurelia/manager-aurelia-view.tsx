"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { apiJson } from "@/lib/api-client";
import {
  MANAGER_AURELIA_MAX_MESSAGE_CHARS,
  type ManagerAureliaTurn,
} from "@/lib/ai/manager-aurelia-conversation";
import {
  MANAGER_AURELIA_CHAT_UNAVAILABLE,
  toManagerAureliaUserError,
} from "@/lib/ai/manager-aurelia-user-errors";
import { BRAND } from "@/lib/brand";
import { ManagerAureliaCapturePanel } from "@/components/aurelia/manager-aurelia-capture";

/**
 * Stage 2.2 — live multi-turn Manager Aurelia with deliberate capture (2.2.4).
 * Conversation state is React memory only — never persisted.
 */
export function ManagerAureliaView({
  onBackHome,
  onViewMyDevelopment,
}: {
  onBackHome: () => void;
  onViewMyDevelopment?: () => void;
}) {
  const inputId = useId();
  const noticeId = useId();
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendingRef = useRef(false);

  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<ManagerAureliaTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [captureOpen, setCaptureOpen] = useState(false);

  useEffect(() => {
    const node = logRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [turns, sending, error]);

  function clearConversation() {
    setTurns([]);
    setDraft("");
    setError("");
    sendingRef.current = false;
    setSending(false);
    setCaptureOpen(false);
    inputRef.current?.focus();
  }

  function handleNewConversation() {
    if (sending) return;
    if (turns.length > 0 || draft.trim()) {
      const confirmed = window.confirm(
        "Start a new conversation? The current working session will be cleared and cannot be recovered."
      );
      if (!confirmed) return;
    }
    clearConversation();
  }

  async function sendMessage() {
    const message = draft.trim();
    if (!message || sendingRef.current) return;
    if (message.length > MANAGER_AURELIA_MAX_MESSAGE_CHARS) {
      setError(
        `Messages must be ${MANAGER_AURELIA_MAX_MESSAGE_CHARS} characters or fewer.`
      );
      return;
    }

    sendingRef.current = true;
    setSending(true);
    setError("");
    const priorTurns = turns;
    setDraft("");

    try {
      const data = await apiJson<{ reply: string }>(
        "/api/my-development/aurelia/chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            turns: priorTurns,
            message,
          }),
          operation: "manager-aurelia-chat",
        }
      );

      const reply = data.reply?.trim();
      if (!reply) {
        setDraft(message);
        setError(MANAGER_AURELIA_CHAT_UNAVAILABLE);
        return;
      }

      setTurns([
        ...priorTurns,
        { role: "manager", content: message },
        { role: "aurelia", content: reply },
      ]);
    } catch (err) {
      setDraft(message);
      setError(toManagerAureliaUserError(err, MANAGER_AURELIA_CHAT_UNAVAILABLE));
    } finally {
      sendingRef.current = false;
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  const canSend = Boolean(draft.trim()) && !sending;
  const canCapture = turns.length > 0 && !sending;

  return (
    <section
      className="manager-aurelia identity-reveal"
      aria-labelledby="manager-aurelia-title"
      data-testid="manager-aurelia-view"
    >
      <header className="manager-aurelia__header">
        <p className="eyebrow">{BRAND.intelligenceName}</p>
        <h1 id="manager-aurelia-title">Talk something through</h1>
        <p className="manager-aurelia__lead">
          Bring a situation, challenge, decision or management question.{" "}
          {BRAND.intelligenceName} will help you think it through.
        </p>
        <p className="manager-aurelia__privacy" id={noticeId}>
          This is a private working session with {BRAND.intelligenceName}. It is
          not saved. If you leave or refresh this page, the conversation will be
          lost. Capture anything you want to keep.{" "}
          {`${BRAND.intelligenceName} can use your current development focus and actions to make this conversation more relevant.`}
        </p>
      </header>

      <div
        ref={logRef}
        className="manager-aurelia__conversation"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={`Conversation with ${BRAND.intelligenceName}`}
      >
        <div className="manager-aurelia__turn manager-aurelia__turn--aurelia">
          <p className="manager-aurelia__turn-label">{BRAND.intelligenceName}</p>
          <div className="manager-aurelia__turn-body">
            <p className="manager-aurelia__opening">What’s on your mind?</p>
          </div>
        </div>

        {turns.map((turn, index) => (
          <div
            key={`${turn.role}-${index}`}
            className={
              turn.role === "manager"
                ? "manager-aurelia__turn manager-aurelia__turn--manager"
                : "manager-aurelia__turn manager-aurelia__turn--aurelia"
            }
          >
            <p className="manager-aurelia__turn-label">
              {turn.role === "manager" ? "You" : BRAND.intelligenceName}
            </p>
            <div className="manager-aurelia__turn-body">
              <p className="manager-aurelia__turn-text">{turn.content}</p>
            </div>
          </div>
        ))}

        {sending ? (
          <div
            className="manager-aurelia__turn manager-aurelia__turn--aurelia"
            aria-busy="true"
          >
            <p className="manager-aurelia__turn-label">{BRAND.intelligenceName}</p>
            <div className="manager-aurelia__turn-body">
              <p className="manager-aurelia__thinking">
                {BRAND.intelligenceName} is thinking…
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="manager-aurelia__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <form className="manager-aurelia__composer" onSubmit={handleSubmit}>
        <label className="manager-aurelia__composer-label" htmlFor={inputId}>
          Message to {BRAND.intelligenceName}
        </label>
        <textarea
          ref={inputRef}
          id={inputId}
          className="manager-aurelia__input"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What’s on your mind?"
          rows={3}
          aria-describedby={noticeId}
          disabled={sending}
          maxLength={MANAGER_AURELIA_MAX_MESSAGE_CHARS}
        />
        <div className="manager-aurelia__composer-actions">
          <button
            type="submit"
            className="identity-button is-primary"
            disabled={!canSend}
            aria-disabled={!canSend}
          >
            {sending ? "Sending…" : "Send"}
          </button>
          <p className="manager-aurelia__composer-hint muted">
            Enter to send · Shift+Enter for a new line
          </p>
        </div>
      </form>

      <footer className="manager-aurelia__footer">
        <button
          type="button"
          className="identity-button is-secondary"
          onClick={() => setCaptureOpen(true)}
          disabled={!canCapture}
          aria-disabled={!canCapture}
          title={
            canCapture
              ? "Capture a reflection or action from this conversation"
              : "Have a short conversation before capturing something"
          }
          data-testid="manager-aurelia-take-forward"
        >
          Take something forward
        </button>
        <button
          type="button"
          className="identity-button is-secondary"
          onClick={handleNewConversation}
          disabled={sending}
        >
          New conversation
        </button>
        <button
          type="button"
          className="identity-button is-quiet"
          onClick={onBackHome}
          disabled={sending}
        >
          Back to Home
        </button>
      </footer>

      <ManagerAureliaCapturePanel
        open={captureOpen}
        turns={turns}
        onClose={() => setCaptureOpen(false)}
        onViewMyDevelopment={onViewMyDevelopment}
      />
    </section>
  );
}
