"use client";

import { useEffect, useState, type FormEvent } from "react";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerEmpty } from "@/components/owner/owner-empty";
import { OwnerStatus } from "@/components/owner/owner-status";
import { apiJson } from "@/lib/api-client";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  type SupportCase,
} from "@/lib/owner/types";

type SupportRow = SupportCase & { organisationName: string | null };

export default function OwnerSupportPage() {
  const [cases, setCases] = useState<SupportRow[]>([]);
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof SUPPORT_CATEGORIES)[number]>("other");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (priority !== "all") params.set("priority", priority);
    try {
      const payload = await apiJson<{ cases: SupportRow[] }>(
        `/api/owner/support?${params.toString()}`
      );
      setCases(payload.cases);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load support cases.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, priority]);

  async function createCase(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiJson("/api/owner/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, description, category }),
      });
      setSubject("");
      setDescription("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create support case.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <OwnerShell
      title="Support"
      subtitle="Lightweight support case management for platform operations."
    >
      <form className="owner-panel" onSubmit={createCase}>
        <h2 className="owner-panel__title">New support case</h2>
        <div className="owner-filters">
          <div className="owner-field" style={{ minWidth: "16rem", flex: 1 }}>
            <label htmlFor="support-subject">Subject</label>
            <input
              id="support-subject"
              required
              value={subject}
              onChange={event => setSubject(event.target.value)}
            />
          </div>
          <div className="owner-field">
            <label htmlFor="support-category">Category</label>
            <select
              id="support-category"
              value={category}
              onChange={event =>
                setCategory(event.target.value as (typeof SUPPORT_CATEGORIES)[number])
              }
            >
              {SUPPORT_CATEGORIES.map(item => (
                <option key={item} value={item}>
                  {item.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="owner-field" style={{ marginTop: "0.75rem" }}>
          <label htmlFor="support-description">Description</label>
          <textarea
            id="support-description"
            value={description}
            onChange={event => setDescription(event.target.value)}
          />
        </div>
        <div style={{ marginTop: "0.75rem" }}>
          <button type="submit" className="owner-button" disabled={saving}>
            {saving ? "Saving…" : "Create case"}
          </button>
        </div>
      </form>

      <div className="owner-filters">
        <div className="owner-field">
          <label htmlFor="support-status">Status</label>
          <select
            id="support-status"
            value={status}
            onChange={event => setStatus(event.target.value)}
          >
            <option value="all">All</option>
            {SUPPORT_STATUSES.map(item => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="owner-field">
          <label htmlFor="support-priority">Priority</label>
          <select
            id="support-priority"
            value={priority}
            onChange={event => setPriority(event.target.value)}
          >
            <option value="all">All</option>
            {SUPPORT_PRIORITIES.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? <p className="owner-muted">Loading support cases…</p> : null}
      {error ? <p className="owner-error">{error}</p> : null}

      {!loading && cases.length === 0 ? (
        <OwnerEmpty
          title="No support cases"
          description="Create a case when a customer needs operational help."
        />
      ) : null}

      {cases.length > 0 ? (
        <>
          <div className="owner-table-wrap">
            <table className="owner-table">
              <thead>
                <tr>
                  <th scope="col">Subject</th>
                  <th scope="col">Organisation</th>
                  <th scope="col">Category</th>
                  <th scope="col">Status</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Assigned</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {cases.map(item => (
                  <tr key={item.id}>
                    <td>{item.subject}</td>
                    <td>{item.organisationName || "—"}</td>
                    <td>{item.category.replaceAll("_", " ")}</td>
                    <td>
                      <OwnerStatus value={item.status} label={item.status.replaceAll("_", " ")} />
                    </td>
                    <td>{item.priority}</td>
                    <td>{item.assignedTo || "—"}</td>
                    <td>{new Date(item.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="owner-stack" aria-label="Support cases">
            {cases.map(item => (
              <article key={item.id} className="owner-stack-card">
                <p className="owner-attention-item__title">{item.subject}</p>
                <div className="owner-stack-card__row">
                  <span className="owner-stack-card__label">Status</span>
                  <OwnerStatus value={item.status} label={item.status.replaceAll("_", " ")} />
                </div>
                <div className="owner-stack-card__row">
                  <span className="owner-stack-card__label">Priority</span>
                  <span>{item.priority}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </OwnerShell>
  );
}
