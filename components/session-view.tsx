"use client";

import { ArrowLeft, ArrowRight, Plus, Save, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Client, Session } from "@/lib/types";
import { isClientArchived } from "@/lib/types";
import {
  hasAiReviewContent,
  hasManualAiReviewEdits,
  newestSession,
  normalizeSession,
  sessionsChronological,
  snapshotAiReviewSections,
  type AiReviewSectionKey,
  type AiReviewSnapshot,
  type StructuredDraftSections,
} from "@/lib/sessions";
import { ClientWorkspaceTabs } from "@/components/client-workspace-tabs";
import { apiJson, AuthRequiredError, errorMessage, toError } from "@/lib/api-client";
import { getRelationshipDisplayName } from "@/lib/relationship-identity";

function parseCoachingQuestions(text: string): string[] {
  return text
    .split("\n")
    .map(line => line.match(/^\d+\.\s*(.+)$/)?.[1]?.trim())
    .filter((question): question is string => Boolean(question));
}

const AI_SECTION_FIELDS: Array<{
  sessionKey: AiReviewSectionKey;
  label: string;
  rows: number;
}> = [
  { sessionKey: "summary", label: "Conversation Summary", rows: 5 },
  { sessionKey: "emergingThemes", label: "Emerging Themes", rows: 4 },
  { sessionKey: "strengthsObserved", label: "Strengths", rows: 4 },
  { sessionKey: "valuesBecomingVisible", label: "Values", rows: 4 },
  {
    sessionKey: "professionalIdentityDevelopment",
    label: "Professional Identity Development",
    rows: 4,
  },
  { sessionKey: "agreedActions", label: "Agreed Actions", rows: 4 },
  { sessionKey: "suggestedFocus", label: "Suggested Next Focus", rows: 4 },
  { sessionKey: "coachReflection", label: "Coach Reflection", rows: 4 },
];

function sessionFromClient(client: Client, sessionId?: string): Session {
  const selected =
    (sessionId ? client.sessions.find(item => item.id === sessionId) : undefined) ??
    newestSession(client.sessions) ??
    client.sessions[0];

  if (!selected) {
    throw new Error("This client has no sessions to open.");
  }

  return normalizeSession(selected, {
    clientId: client.id,
    coachId: selected.coachId,
    index: 0,
    total: client.sessions.length,
  });
}

function reviewStateFromSession(session: Session): {
  baseline: AiReviewSnapshot | null;
  approved: boolean;
} {
  const snapshot = snapshotAiReviewSections(session);
  const hasAi = hasAiReviewContent(snapshot);
  return {
    baseline: hasAi ? snapshot : null,
    approved: session.aiSummaryApproved || !hasAi,
  };
}

export function SessionView({
  client,
  onBack,
  onSave,
  onCreateSession,
  onOpenJourney,
  onTabChange,
  focusSessionId,
}: {
  client: Client;
  onBack: () => void;
  onSave: (session: Session) => void | Promise<void>;
  onCreateSession: () => Promise<Session>;
  onOpenJourney?: () => void;
  onTabChange?: (tab: import("@/components/client-workspace-tabs").ClientWorkspaceTab) => void;
  /** When set, open this session instead of the newest (e.g. Journey commitment click-through). */
  focusSessionId?: string | null;
}) {
  const initialId =
    (focusSessionId && client.sessions.some(item => item.id === focusSessionId)
      ? focusSessionId
      : undefined) ??
    newestSession(client.sessions)?.id ??
    client.sessions[0]?.id ??
    "";
  const [selectedSessionId, setSelectedSessionId] = useState(initialId);
  const [session, setSession] = useState(() => sessionFromClient(client, initialId));
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [draftError, setDraftError] = useState("");
  const [draftingSummary, setDraftingSummary] = useState(false);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [questionsError, setQuestionsError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [questionSuggested, setQuestionSuggested] = useState(false);
  const initialReview = reviewStateFromSession(sessionFromClient(client, initialId));
  const [aiBaseline, setAiBaseline] = useState<AiReviewSnapshot | null>(initialReview.baseline);
  const [approvalChecked, setApprovalChecked] = useState(initialReview.approved);
  const reviewPanelRef = useRef<HTMLElement | null>(null);

  const coachingQuestions = session.coachingQuestions ?? [];
  const history = sessionsChronological(client.sessions);
  const sessionIdsKey = client.sessions.map(item => item.id).join("|");
  const currentAiSnapshot = snapshotAiReviewSections(session);
  const hasAiContent = hasAiReviewContent(currentAiSnapshot);
  const hasManualEdits = hasManualAiReviewEdits(aiBaseline, currentAiSnapshot);
  const archived = isClientArchived(client);
  const canSaveSession =
    !archived &&
    (!hasAiContent || approvalChecked || hasManualEdits || session.aiSummaryApproved);

  function applyLoadedSession(next: Session) {
    const review = reviewStateFromSession(next);
    setSession(next);
    setAiBaseline(review.baseline);
    setApprovalChecked(review.approved);
    setSaved(false);
    setSaving(false);
    setSaveError("");
    setDraftError("");
    setQuestionsError("");
    setQuestionSuggested(false);
  }

  // Opening / switching client → load all sessions with newest (or focused) selected.
  useEffect(() => {
    const focused =
      focusSessionId && client.sessions.some(item => item.id === focusSessionId)
        ? focusSessionId
        : null;
    const nextId =
      focused ?? newestSession(client.sessions)?.id ?? client.sessions[0]?.id ?? "";
    setSelectedSessionId(nextId);
    applyLoadedSession(sessionFromClient(client, nextId));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when client or focus target changes
  }, [client.id, focusSessionId]);

  // If the sessions list is refreshed and the selection is missing, fall back to newest.
  useEffect(() => {
    if (client.sessions.length === 0) return;
    const exists = client.sessions.some(item => item.id === selectedSessionId);
    if (!exists) {
      const newestId = newestSession(client.sessions)?.id ?? client.sessions[0].id;
      setSelectedSessionId(newestId);
      applyLoadedSession(sessionFromClient(client, newestId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by session id membership, not every field
  }, [client.id, sessionIdsKey, selectedSessionId]);

  // Selecting a session loads notes, AI summary, coaching questions, and coach notes.
  useEffect(() => {
    if (!selectedSessionId) return;
    if (!client.sessions.some(item => item.id === selectedSessionId)) return;
    applyLoadedSession(sessionFromClient(client, selectedSessionId));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on selection change only
  }, [selectedSessionId]);

  function selectSession(sessionId: string) {
    if (sessionId === selectedSessionId) return;
    setSelectedSessionId(sessionId);
  }

  function update(field: keyof Session, value: string | number | string[] | boolean) {
    setSession(current => ({ ...current, [field]: value }));
    setSaved(false);
    setSaveError("");
  }

  function updateAiSection(field: AiReviewSectionKey, value: string) {
    setSession(current => ({ ...current, [field]: value }));
    setSaved(false);
    setSaveError("");
  }

  async function save() {
    if (!canSaveSession || saving) return;

    const toSave: Session = {
      ...session,
      aiSummaryApproved:
        !hasAiContent || approvalChecked || hasManualEdits || session.aiSummaryApproved,
    };

    setSaving(true);
    setSaveError("");
    try {
      await onSave(toSave);
      setSession(toSave);
      setAiBaseline(snapshotAiReviewSections(toSave));
      setApprovalChecked(true);
      setSaved(true);
    } catch (error) {
      setSaved(false);
      setSaveError(errorMessage(error, "Unable to save this session. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  async function createSession() {
    setCreatingSession(true);
    setSaveError("");
    try {
      const created = await onCreateSession();
      setSelectedSessionId(created.id);
      applyLoadedSession(
        normalizeSession(created, {
          clientId: client.id,
          coachId: created.coachId,
          index: 0,
          total: client.sessions.length + 1,
        })
      );
    } catch (error) {
      setSaveError(errorMessage(error, "Unable to create a new session. Please try again."));
    } finally {
      setCreatingSession(false);
    }
  }

  async function copyQuestion(question: string, index: number) {
    try {
      await navigator.clipboard.writeText(question);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex(current => (current === index ? null : current)), 2000);
    } catch {
      setQuestionsError("Failed to copy question. Please try again.");
    }
  }

  function suggestQuestion() {
    const prompt = "Possible question: What feels different about how you describe yourself now?";
    const next = session.preparation.trim()
      ? `${session.preparation.trim()}\n\n${prompt}`
      : prompt;
    update("preparation", next);
    setQuestionSuggested(true);
    window.setTimeout(() => setQuestionSuggested(false), 2000);
  }

  async function generateCoachingQuestions() {
    if (!session.notes.trim()) {
      update("coachingQuestions", []);
      setQuestionsError("Add session notes before generating coaching questions.");
      return;
    }

    setGeneratingQuestions(true);
    setQuestionsError("");
    try {
      const data = await apiJson<{ questions?: string; error?: string }>("/api/coaching-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: session.notes, clientId: client.id }),
      });

      const parsed = parseCoachingQuestions(String(data.questions ?? ""));
      update("coachingQuestions", parsed.length > 0 ? parsed : [String(data.questions ?? "")]);
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        window.location.assign("/auth/sign-in?next=/?view=today");
        return;
      }
      update("coachingQuestions", []);
      setQuestionsError(
        errorMessage(error, "Failed to generate coaching questions. Please try again.")
      );
    } finally {
      setGeneratingQuestions(false);
    }
  }

  async function draftSummary() {
    if (!session.notes.trim()) {
      setDraftError("Add session notes before drafting a summary.");
      return;
    }

    setDraftingSummary(true);
    setDraftError("");
    try {
      const data = await apiJson<{
        summary?: string;
        sections?: StructuredDraftSections;
        error?: string;
      }>("/api/draft-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: session.notes,
          focus: session.focus,
          preparation: session.preparation,
          clientName: getRelationshipDisplayName(client),
          clientId: client.id,
        }),
      });

      const sections = data.sections;
      let drafted: Session | undefined;

      setSession(current => {
        drafted = sections
          ? {
              ...current,
              summary: sections.aiDraftSummary || data.summary || "",
              emergingThemes: sections.emergingThemes || "",
              strengthsObserved: sections.strengthsObserved || "",
              valuesBecomingVisible: sections.valuesBecomingVisible || "",
              professionalIdentityDevelopment: sections.professionalIdentityDevelopment || "",
              agreedActions: sections.agreedActions || "",
              suggestedFocus: sections.suggestedFocus || "",
              coachReflection: sections.coachReflection || "",
              aiSummaryApproved: false,
            }
          : {
              ...current,
              summary: String(data.summary ?? ""),
              aiSummaryApproved: false,
            };
        return drafted;
      });

      if (drafted) {
        setAiBaseline(snapshotAiReviewSections(drafted));
      }
      setApprovalChecked(false);
      setSaved(false);
      window.requestAnimationFrame(() => {
        reviewPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        window.location.assign("/auth/sign-in?next=/?view=today");
        return;
      }
      setDraftError(
        errorMessage(toError(error), "Failed to draft summary. Please try again.")
      );
    } finally {
      setDraftingSummary(false);
    }
  }

  const saveLabel = saving ? "Saving..." : saved ? "Saved" : "Save Session";

  return (
    <section className="page">
      <button type="button" className="back" onClick={onBack}>
        <ArrowLeft size={16} /> Back to Prepare Session
      </button>

      {onTabChange && (
        <ClientWorkspaceTabs
          active="sessions"
          clientName={getRelationshipDisplayName(client)}
          onChange={onTabChange}
        />
      )}

      <div className="page-heading row-between">
        <div>
          <p className="eyebrow">SESSION WORKSPACE</p>
          <h1>{getRelationshipDisplayName(client)}</h1>
          <p>
            Session {session.sessionNumber}
            {session.date ? ` · ${session.date}` : ""}
            {session.time ? ` at ${session.time}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="primary"
          onClick={() => {
            void save();
          }}
          disabled={!canSaveSession || saving}
          aria-busy={saving}
          title={
            archived
              ? "Restore this client to save session changes."
              : canSaveSession
                ? undefined
                : "Review and approve the proposed summary, or edit at least one section, before saving."
          }
        >
          <Save size={17} /> {saveLabel}
        </button>
      </div>

      {archived ? (
        <div className="inline-notice archived-banner" role="status">
          This client is archived. Restore them to add new coaching activity.
        </div>
      ) : null}

      {saved && (
        <div className="inline-success" role="status">
          <p>
            {session.aiSummaryApproved
              ? `Session approved and added to ${getRelationshipDisplayName(client)}'s Development Journey.`
              : `Session saved for ${getRelationshipDisplayName(client)}. Approve the coaching record when you are ready for it to shape their journey.`}
          </p>
          {onOpenJourney && session.aiSummaryApproved && (
            <button type="button" className="text-link" onClick={onOpenJourney}>
              View Journey <ArrowRight size={16} />
            </button>
          )}
        </div>
      )}

      {saveError && (
        <div className="inline-error" role="alert">
          <p>{saveError}</p>
        </div>
      )}

      <div className="session-layout">
        <aside className="panel session-history" aria-label="Conversation history">
          <p className="eyebrow">SESSION HISTORY</p>
          {history.length === 0 ? (
            <p className="muted empty-state">No sessions yet. Prepare one to begin the record.</p>
          ) : (
            <div className="session-history-list">
              {history.map(item => {
                const active = item.id === selectedSessionId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`session-history-item${active ? " active" : ""}`}
                    onClick={() => selectSession(item.id)}
                    aria-current={active ? "true" : undefined}
                  >
                    <strong>Session {item.sessionNumber}</strong>
                    <small>{item.date || "Date to schedule"}</small>
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            className="session-history-new"
            onClick={() => {
              void createSession();
            }}
            disabled={creatingSession || archived}
            aria-busy={creatingSession}
            title={archived ? "Restore this client to create a new session." : undefined}
          >
            <Plus size={16} /> {creatingSession ? "Creating..." : "New Session"}
          </button>
        </aside>

        <div>
          <article className="panel">
            <p className="eyebrow">PREPARATION</p>
            <h2>{session.focus || "Conversation focus"}</h2>
            <textarea
              rows={4}
              value={session.preparation}
              onChange={e => update("preparation", e.target.value)}
              aria-label="Conversation preparation"
              readOnly={archived}
            />
          </article>

          <article className="panel">
            <p className="eyebrow">SESSION NOTES</p>
            <textarea
              rows={10}
              value={session.notes}
              onChange={e => update("notes", e.target.value)}
              placeholder="Capture only what is useful for the coaching process..."
              aria-label="Conversation notes"
              readOnly={archived}
            />
          </article>

          <article className="panel">
            <p className="eyebrow">PRIVATE COACH REFLECTION</p>
            <textarea
              rows={6}
              value={session.reflection}
              onChange={e => update("reflection", e.target.value)}
              placeholder="What did you notice? What may be worth revisiting?"
              aria-label="Coach private notes"
              readOnly={archived}
            />
          </article>

          <article className="panel" ref={reviewPanelRef} id="ai-summary-review">
            <p className="eyebrow">AI SUMMARY REVIEW</p>
            <p className="muted">
              Edit any section below. The coach remains the author of the coaching record — AI is an
              assistant only.
            </p>
            {draftError && (
              <p className="ai-error" role="alert">
                {draftError}
              </p>
            )}
            {!hasAiContent && !draftError && (
              <p className="muted empty-state">
                Draft a summary from session notes to populate this review, or write sections
                manually.
              </p>
            )}
            {AI_SECTION_FIELDS.map(section => (
              <div key={section.sessionKey} className="session-section-field">
                <label htmlFor={`session-${section.sessionKey}`}>{section.label}</label>
                <textarea
                  id={`session-${section.sessionKey}`}
                  rows={section.rows}
                  value={String(session[section.sessionKey] ?? "")}
                  onChange={e => updateAiSection(section.sessionKey, e.target.value)}
                  placeholder={`Draft ${section.label.toLowerCase()}...`}
                  aria-label={section.label}
                  readOnly={archived}
                />
              </div>
            ))}

            <div className="ai-approval">
              <label className="ai-approval-label" htmlFor="ai-summary-approval">
                <input
                  id="ai-summary-approval"
                  type="checkbox"
                  checked={approvalChecked}
                  onChange={e => {
                    setApprovalChecked(e.target.checked);
                    setSaved(false);
                    setSaveError("");
                  }}
                  disabled={!hasAiContent || archived}
                />
                <span>I have reviewed and approved this AI-generated coaching record.</span>
              </label>
              {hasAiContent && !canSaveSession ? (
                <p className="ai-approval-hint">
                  Save Session stays disabled until you approve this record or edit at least one
                  section.
                </p>
              ) : null}
              {hasAiContent && hasManualEdits && !approvalChecked ? (
                <p className="ai-approval-hint">
                  Manual edits recorded — Save Session is available. You may still tick approval if
                  preferred.
                </p>
              ) : null}
            </div>
          </article>

          {(coachingQuestions.length > 0 || questionsError) && (
            <article className="panel">
              <p className="eyebrow">POWERFUL COACHING QUESTIONS</p>
              {questionsError ? (
                <p className="ai-error" role="alert">
                  {questionsError}
                </p>
              ) : (
                <ol className="coaching-questions-list">
                  {coachingQuestions.map((question, index) => (
                    <li key={index} className="coaching-question-row">
                      <span>{question}</span>
                      <button
                        type="button"
                        className="copy-question-button"
                        onClick={() => copyQuestion(question, index)}
                      >
                        {copiedIndex === index ? "Copied" : "Copy"}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </article>
          )}
        </div>

        <aside className="assistant-card">
          <Sparkles size={22} />
          <h2>Coaching support</h2>
          <p>Use these tools to sharpen your thinking. Your judgement remains central.</p>
          <button type="button" onClick={suggestQuestion} disabled={archived}>
            {questionSuggested ? "Added to preparation" : "Suggest a question"}
          </button>
          <button
            type="button"
            onClick={() => {
              void draftSummary();
            }}
            disabled={draftingSummary || generatingQuestions || archived}
            aria-busy={draftingSummary}
          >
            {draftingSummary ? "Drafting summary..." : "Draft Summary"}
          </button>
          <button
            type="button"
            onClick={() => {
              void generateCoachingQuestions();
            }}
            disabled={generatingQuestions || draftingSummary || archived}
            aria-busy={generatingQuestions}
          >
            {generatingQuestions ? "Generating questions..." : "Generate Coaching Questions"}
          </button>
          <small>Drafts stay private until you review and approve them.</small>
        </aside>
      </div>
    </section>
  );
}
