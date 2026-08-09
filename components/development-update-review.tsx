"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson, errorMessage } from "@/lib/api-client";
import type { DevelopmentUpdate } from "@/lib/development-updates/types";
import { effectiveChanges, hasAnyProposedChanges } from "@/lib/development-updates/types";
import {
  buildChangeDisplayItems,
  cloneProposedChanges,
  evidenceForChange,
  removeChangeByKey,
  updateChangeValueByKey,
} from "@/lib/development-updates/presentation";
import type { ProposedProfileChanges } from "@/lib/development-updates/types";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ActionButton } from "@/components/feedback/action-button";
import { useToast } from "@/components/feedback/toast-provider";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { toActionButtonStatus } from "@/types/action-feedback";
import {
  PersonFlowBackLink,
  PersonFlowBreadcrumb,
} from "@/components/identity/person-flow-nav";
import { useOrganisation } from "@/lib/organisations/organisation-context";
import { resolveProductLanguage } from "@/lib/role-language";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function DevelopmentUpdateReviewView({
  updateId,
  onBack,
  onBackToPerson,
  onBackToPeople,
  onApplied,
  onDiscarded,
}: {
  updateId: string;
  onBack: () => void;
  onBackToPerson?: () => void;
  onBackToPeople?: () => void;
  onApplied?: () => void;
  onDiscarded?: () => void;
}) {
  const organisation = useOrganisation();
  const language = resolveProductLanguage(organisation?.professionalRole);
  const [update, setUpdate] = useState<DevelopmentUpdate | null>(null);
  const [clientName, setClientName] = useState("Person");
  const [sessionDate, setSessionDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [changesDraft, setChangesDraft] = useState<ProposedProfileChanges>({});
  const [coachNote, setCoachNote] = useState("");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [busy, setBusy] = useState<"apply" | "discard" | "save" | null>(null);
  const applyFeedback = useActionFeedback();
  const saveFeedback = useActionFeedback();
  const { showToast } = useToast();

  const returnToPerson = onBackToPerson ?? onBack;
  const returnToPeople = onBackToPeople ?? onBack;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiJson<{
        update: DevelopmentUpdate;
        clientName: string;
        sessionDate: string;
      }>(`/api/development-updates/${updateId}`);
      setUpdate(data.update);
      setClientName(data.clientName);
      setSessionDate(data.sessionDate);
      setSummaryDraft(data.update.conversationSummary);
      setChangesDraft(cloneProposedChanges(effectiveChanges(data.update)));
      setCoachNote(data.update.coachNote || "");
    } catch (err) {
      setError(errorMessage(err, "Unable to load this development update."));
    } finally {
      setLoading(false);
    }
  }, [updateId]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayChanges = useMemo(
    () => buildChangeDisplayItems(editing ? changesDraft : update ? effectiveChanges(update) : {}),
    [editing, changesDraft, update]
  );

  const meaningful = useMemo(() => {
    if (!update) return false;
    if (editing) return hasAnyProposedChanges(changesDraft);
    return update.hasMeaningfulChanges && hasAnyProposedChanges(effectiveChanges(update));
  }, [update, editing, changesDraft]);

  async function handleSaveEdits() {
    if (!update || busy || saveFeedback.isLoading) return;
    setBusy("save");
    setError("");

    await saveFeedback.runAction(
      async () => {
        const data = await apiJson<{ update: DevelopmentUpdate }>(
          `/api/development-updates/${update.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversationSummary: summaryDraft,
              editedChanges: changesDraft,
              coachNote,
            }),
          }
        );
        setUpdate(data.update);
        setEditing(false);
        setStatusMessage("Your edits have been saved.");
        return data.update;
      },
      {
        loadingMessage: "Saving…",
        successMessage: "Saved",
        errorMessage: "Unable to save edits",
        onSuccess: () => {
          showToast({
            type: "success",
            title: "Edits saved",
          });
        },
        onError: err => {
          console.error("Save development evidence edits failed", err);
          setError(errorMessage(err, "Unable to save your edits."));
          showToast({
            type: "error",
            title: "Edits could not be saved",
            description: "Your changes remain on screen. Please try again.",
            durationMs: 8000,
          });
        },
      }
    );

    setBusy(null);
  }

  async function handleApply() {
    if (!update || busy || applyFeedback.isLoading) return;
    setBusy("apply");
    setError("");
    setStatusMessage("");

    await applyFeedback.runAction(
      async () => {
        if (editing) {
          await apiJson(`/api/development-updates/${update.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversationSummary: summaryDraft,
              editedChanges: changesDraft,
              coachNote,
            }),
          });
        }

        const data = await apiJson<{
          update: DevelopmentUpdate;
          notice?: string;
          alreadyApplied?: boolean;
          error?: string;
        }>(`/api/development-updates/${update.id}/apply`, {
          method: "POST",
        });

        setUpdate(data.update);
        setEditing(false);
        setStatusMessage(
          data.notice || "The living development profile has been updated."
        );
        onApplied?.();
        return data.update;
      },
      {
        loadingMessage: "Updating development evidence…",
        successMessage: "Development evidence updated",
        errorMessage: "Unable to update development evidence",
        successDurationMs: 3000,
        onSuccess: () => {
          showToast({
            type: "success",
            title: "Development evidence updated",
          });
        },
        onError: err => {
          console.error("Update development evidence failed", err);
          setError(
            errorMessage(
              err,
              "We couldn’t update the development profile. No changes have been applied. Please try again."
            )
          );
          showToast({
            type: "error",
            title: "Development evidence could not be updated",
            description: "No changes have been applied. Please try again.",
            durationMs: 8000,
          });
        },
      }
    );

    setBusy(null);
  }

  async function handleDiscard() {
    if (!update || busy) return;
    setBusy("discard");
    setError("");
    try {
      const data = await apiJson<{ update: DevelopmentUpdate; notice?: string }>(
        `/api/development-updates/${update.id}/discard`,
        { method: "POST" }
      );
      setUpdate(data.update);
      setDiscardOpen(false);
      setStatusMessage(
        data.notice ||
          "The suggested update was discarded. The development profile is unchanged."
      );
      onDiscarded?.();
    } catch (err) {
      setError(errorMessage(err, "Unable to discard this development update."));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <section className="page">
        <div className="page-heading">
          <p className="eyebrow">Development update</p>
          <h1>Development Update</h1>
          <p>Preparing the development update…</p>
          <p className="muted">
            Comparing this conversation with the existing development profile.
          </p>
        </div>
        <div className="skeleton-loading-block" aria-hidden="true">
          <div className="skeleton-block skeleton-heading" />
          <div className="skeleton-block skeleton-line" />
          <div className="skeleton-block skeleton-line medium" />
        </div>
      </section>
    );
  }

  if (!update) {
    return (
      <section className="page">
        <PersonFlowBackLink personName={clientName} onBack={returnToPerson} />
        <article className="panel empty-panel">
          <h1>Development Update</h1>
          <p className="muted">{error || "This development update could not be found."}</p>
          {onBackToPeople ? (
            <div className="button-row">
              <button type="button" className="secondary" onClick={returnToPeople}>
                Back to People
              </button>
            </div>
          ) : null}
        </article>
      </section>
    );
  }

  const applied = update.status === "applied";
  const discarded = update.status === "discarded";
  const readOnly = applied || discarded || Boolean(busy);

  return (
    <section className="page">
      <PersonFlowBackLink personName={clientName} onBack={returnToPerson} />
      <PersonFlowBreadcrumb
        personName={clientName}
        stageLabel="Development Update"
        onBackToPeople={returnToPeople}
        onBackToPerson={returnToPerson}
      />

      <div className="page-heading">
        <p className="eyebrow">Development update</p>
        <h1>Development Update</h1>
        <p>
          Review the meaningful changes suggested from this conversation before updating{" "}
          {clientName === "Person" ? "this person’s" : `${clientName}’s`} development
          profile.
        </p>
      </div>

      <div className="button-row" style={{ marginBottom: 16 }}>
        {onBackToPerson ? (
          <button type="button" className="secondary" onClick={returnToPerson}>
            Return to {clientName}
          </button>
        ) : null}
        {onBackToPeople ? (
          <button type="button" className="secondary" onClick={returnToPeople}>
            Back to People
          </button>
        ) : null}
      </div>

      {statusMessage ? (
        <div className="inline-success" role="status" aria-live="polite">
          <p>{statusMessage}</p>
        </div>
      ) : null}

      {error ? (
        <div className="inline-error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <article className="panel">
        <dl className="meta-list compact-meta">
          <div>
            <dt>Person</dt>
            <dd>{clientName}</dd>
          </div>
          <div>
            <dt>Session date</dt>
            <dd>{formatDate(sessionDate)}</dd>
          </div>
        </dl>
      </article>

      <article className="panel">
        <h2>Conversation summary</h2>
        {editing ? (
          <label className="full">
            <span className="sr-only">Conversation summary</span>
            <textarea
              className="full"
              rows={5}
              value={summaryDraft}
              onChange={event => setSummaryDraft(event.target.value)}
              disabled={readOnly}
            />
          </label>
        ) : (
          <p>{update.conversationSummary || "No summary is available for this conversation."}</p>
        )}
      </article>

      <article className="panel">
        <h2>Recommended updates</h2>
        {!meaningful ? (
          <p className="muted">
            No meaningful profile changes were identified from this conversation. The
            existing development profile remains current.
          </p>
        ) : (
          <div className="development-change-list">
            {displayChanges.map(item => (
              <div key={item.key} className="development-change-item">
                <h3>{item.title}</h3>
                {editing && (item.kind === "add" || item.kind === "update" || item.kind === "focus") ? (
                  <label className="full">
                    <span className="sr-only">Edit {item.title}</span>
                    <textarea
                      className="full"
                      rows={3}
                      value={item.body}
                      onChange={event =>
                        setChangesDraft(current =>
                          updateChangeValueByKey(current, item.key, event.target.value)
                        )
                      }
                      disabled={readOnly}
                    />
                  </label>
                ) : (
                  <p>{item.body}</p>
                )}
                {item.statusLabel ? <p className="muted small">{item.statusLabel}</p> : null}
                {editing && !readOnly ? (
                  <button
                    type="button"
                    className="text-link"
                    onClick={() =>
                      setChangesDraft(current => removeChangeByKey(current, item.key))
                    }
                  >
                    Remove this change
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </article>

      {editing ? (
        <article className="panel">
          <h2>{language.notesLabel.replace(/ notes$/i, " note")}</h2>
          <label className="full">
            <span className="sr-only">
              {language.notesLabel.replace(/ notes$/i, " note")}
            </span>
            <textarea
              className="full"
              rows={3}
              value={coachNote}
              onChange={event => setCoachNote(event.target.value)}
              disabled={readOnly}
              placeholder="Optional note for your own records"
            />
          </label>
        </article>
      ) : null}

      {(update.evidenceSummary.length > 0 || editing) && meaningful ? (
        <article className="panel">
          <button
            type="button"
            className="text-link"
            aria-expanded={evidenceOpen}
            onClick={() => setEvidenceOpen(current => !current)}
          >
            {evidenceOpen ? "Hide supporting evidence" : "View supporting evidence"}
          </button>
          {evidenceOpen ? (
            <div className="evidence-list" style={{ marginTop: 16 }}>
              {displayChanges.map(item => {
                const linked = evidenceForChange(update.evidenceSummary, item.key);
                if (linked.length === 0) return null;
                return (
                  <div key={`evidence-${item.key}`} className="development-change-item">
                    <h3>{item.title}</h3>
                    {linked.map((entry, index) => (
                      <p key={`${item.key}-${index}`} className="muted">
                        {entry.evidenceText}
                        {entry.sourceExcerpt ? (
                          <>
                            <br />
                            <span className="small">“{entry.sourceExcerpt}”</span>
                          </>
                        ) : null}
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : null}
        </article>
      ) : null}

      {!applied && !discarded ? (
        <div className="button-row" style={{ marginTop: 28 }}>
          {editing ? (
            <ActionButton
              variant="secondary"
              status={toActionButtonStatus(saveFeedback.feedback.status)}
              idleLabel="Save edits"
              loadingLabel="Saving…"
              successLabel="Saved"
              errorLabel="Try again"
              disabled={Boolean(busy) || saveFeedback.isLoading}
              onClick={() => {
                void handleSaveEdits();
              }}
            />
          ) : (
            <button
              type="button"
              className="secondary"
              disabled={Boolean(busy)}
              onClick={() => {
                setEditing(true);
                setChangesDraft(cloneProposedChanges(effectiveChanges(update)));
                setSummaryDraft(update.conversationSummary);
                setCoachNote(update.coachNote || "");
              }}
            >
              Edit
            </button>
          )}
          <button
            type="button"
            className="secondary"
            disabled={Boolean(busy)}
            onClick={() => setDiscardOpen(true)}
          >
            Discard update
          </button>
          <ActionButton
            variant="primary"
            status={toActionButtonStatus(applyFeedback.feedback.status)}
            idleLabel="Apply update"
            loadingLabel="Updating…"
            successLabel="Updated"
            errorLabel="Try again"
            disabled={Boolean(busy) || applyFeedback.isLoading}
            onClick={() => {
              void handleApply();
            }}
          />
        </div>
      ) : (
        <div className="button-row" style={{ marginTop: 28 }}>
          <button type="button" className="primary" onClick={returnToPerson}>
            Return to {clientName}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={discardOpen}
        title="Discard this suggested update?"
        onClose={() => {
          if (!busy) setDiscardOpen(false);
        }}
        closeDisabled={Boolean(busy)}
        footer={
          <>
            <button
              type="button"
              className="secondary"
              disabled={Boolean(busy)}
              onClick={() => setDiscardOpen(false)}
            >
              Keep update
            </button>
            <button
              type="button"
              className="primary"
              disabled={Boolean(busy)}
              onClick={() => {
                void handleDiscard();
              }}
            >
              {busy === "discard" ? "Discarding…" : "Discard update"}
            </button>
          </>
        }
      >
        <p>The person’s development profile will remain unchanged.</p>
      </ConfirmDialog>
    </section>
  );
}
