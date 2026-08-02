"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { apiJson, errorMessage } from "@/lib/api-client";
import type { IntelligenceItem } from "@/lib/intelligence/types";
import {
  confidenceLabelDisplay,
  statusDisplay,
} from "@/lib/intelligence/types";
import { getFocusableElements, trapFocusTab } from "@/lib/focus-trap";

type AuditRow = {
  id: string;
  action: string;
  created_at: string;
};

export function EvidenceDrawer({
  item,
  open,
  onClose,
  onChanged,
}: {
  item: IntelligenceItem | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<IntelligenceItem | null>(item);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coachNotes, setCoachNotes] = useState("");
  const [evidenceText, setEvidenceText] = useState("");

  useEffect(() => {
    if (!open || !item) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await apiJson<{ item: IntelligenceItem; audit: AuditRow[] }>(
          `/api/intelligence/items/${item!.id}`
        );
        if (cancelled) return;
        setDetail(data.item);
        setAudit(data.audit ?? []);
        setTitle(data.item.title);
        setDescription(data.item.description);
        setCoachNotes(data.item.coachNotes);
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err, "Unable to load evidence."));
          setDetail(item);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, item]);

  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = requestAnimationFrame(() => {
      const focusable = panelRef.current ? getFocusableElements(panelRef.current) : [];
      (focusable[0] ?? panelRef.current)?.focus();
    });

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (panelRef.current) trapFocusTab(event, panelRef.current);
    }

    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open || !item) return null;

  const current = detail ?? item;

  async function patch(body: Record<string, unknown>, successNotice?: string) {
    setBusy(true);
    setError("");
    try {
      const data = await apiJson<{ item: IntelligenceItem }>(
        `/api/intelligence/items/${current.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      setDetail(data.item);
      setEditing(false);
      if (successNotice) {
        // Keep the drawer open with updated state.
      }
      onChanged();
    } catch (err) {
      setError(errorMessage(err, "Unable to update this insight."));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddEvidence() {
    if (!evidenceText.trim()) {
      setError("Add evidence text before saving.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiJson(`/api/intelligence/items/${current.id}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evidenceText: evidenceText.trim(),
          evidenceType: "manual_entry",
        }),
      });
      setEvidenceText("");
      const data = await apiJson<{ item: IntelligenceItem; audit: AuditRow[] }>(
        `/api/intelligence/items/${current.id}`
      );
      setDetail(data.item);
      setAudit(data.audit ?? []);
      onChanged();
    } catch (err) {
      setError(errorMessage(err, "Unable to add evidence."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="drawer-root" role="presentation">
      <button type="button" className="drawer-backdrop" aria-label="Close" onClick={onClose} />
      <aside
        ref={panelRef}
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="drawer-header">
          <div>
            <p className="eyebrow">Evidence</p>
            <h2 id={titleId}>{current.title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close evidence">
            <X size={18} />
          </button>
        </header>

        {loading ? <p className="muted">Loading evidence…</p> : null}
        {error ? (
          <p className="inline-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="drawer-meta">
          <span className={`status-pill status-${current.status}`}>
            {statusDisplay(current.status)}
          </span>
          <span className="pill">
            {confidenceLabelDisplay(current.confidenceLabel)}
          </span>
          {current.status === "approved" ? (
            <span className="pill approved-pill">Coach-approved</span>
          ) : (
            <span className="pill proposed-pill">Requires validation</span>
          )}
        </div>

        <p className="muted">
          {current.description ||
            "Evidence suggests a possible pattern. Review the supporting entries below before deciding."}
        </p>

        {editing ? (
          <div className="stack-gap">
            <label>
              Title
              <input value={title} onChange={event => setTitle(event.target.value)} />
            </label>
            <label>
              Description
              <textarea
                rows={4}
                value={description}
                onChange={event => setDescription(event.target.value)}
              />
            </label>
            <label>
              Coach notes
              <textarea
                rows={3}
                value={coachNotes}
                onChange={event => setCoachNotes(event.target.value)}
              />
            </label>
            <div className="button-row">
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() =>
                  void patch({
                    title: title.trim(),
                    description: description.trim(),
                    coachNotes: coachNotes.trim(),
                  })
                }
              >
                Save evidence
              </button>
              <button type="button" className="secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {current.coachNotes ? (
              <article className="panel quiet-panel">
                <h3>Coach notes</h3>
                <p>{current.coachNotes}</p>
              </article>
            ) : null}

            <section className="stack-gap">
              <h3>Evidence entries</h3>
              {current.evidence.length === 0 ? (
                <p className="muted empty-state">No evidence recorded yet.</p>
              ) : (
                current.evidence.map(entry => (
                  <article key={entry.id} className="evidence-entry">
                    <div className="drawer-meta">
                      <span className="pill">{entry.evidenceType ?? "manual_entry"}</span>
                      <small className="muted">
                        {entry.occurredAt
                          ? new Date(entry.occurredAt).toLocaleDateString("en-GB")
                          : "Date unknown"}
                      </small>
                    </div>
                    {entry.evidenceType === "AI_interpretation" ? (
                      <p className="ai-label">AI interpretation — requires coach validation</p>
                    ) : null}
                    <p>{entry.isRedacted ? "Evidence redacted." : entry.evidenceText}</p>
                    {entry.sourceExcerpt ? (
                      <p className="muted small">“{entry.sourceExcerpt}”</p>
                    ) : null}
                    {entry.sessionId == null ? (
                      <p className="muted small">Linked session unavailable</p>
                    ) : (
                      <p className="muted small">Linked session on record</p>
                    )}
                  </article>
                ))
              )}
            </section>

            <section className="stack-gap">
              <h3>Add evidence</h3>
              <textarea
                rows={3}
                value={evidenceText}
                onChange={event => setEvidenceText(event.target.value)}
                placeholder="Add a concise observation or source note"
              />
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void handleAddEvidence()}
              >
                Add evidence
              </button>
            </section>

            <section className="stack-gap">
              <h3>Approval history</h3>
              {audit.length === 0 ? (
                <p className="muted">No history yet.</p>
              ) : (
                <ul className="clean-list">
                  {audit.map(entry => (
                    <li key={entry.id}>
                      <strong>{entry.action}</strong>
                      <small className="muted">
                        {" "}
                        · {new Date(entry.created_at).toLocaleString("en-GB")}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        <footer className="drawer-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy || current.isLocked}
            onClick={() => setEditing(true)}
          >
            Edit insight
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || current.isLocked}
            onClick={() => void patch({ isLocked: true })}
          >
            Lock insight
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void patch({ status: "archived", archive: true })}
          >
            Archive
          </button>
        </footer>
      </aside>
    </div>
  );
}
