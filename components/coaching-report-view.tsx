"use client";

import { ArrowLeft, Download, FileText, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import type { Client } from "@/lib/types";
import { isClientArchived } from "@/lib/types";
import { approvedSessions } from "@/lib/journey";
import {
  DEMO_COACH_DISPLAY_NAME,
  defaultReportPrivacyForClient,
  buildCoachingReportDraft,
  coachingReportAiEvidence,
  formatReportPeriodLabel,
  reportTypeLabel,
  selectApprovedSessionsForReport,
  type CoachingReportDraft,
  type ReportPeriodMode,
  type ReportPeriodSelection,
  type ReportPrivacyOptions,
  type ReportType,
} from "@/lib/coaching-report";
import { getRelationshipDisplayName } from "@/lib/relationship-identity";
import { ClientWorkspaceTabs } from "@/components/client-workspace-tabs";
import { requireBrowserAuth } from "@/lib/auth/browser";
import { apiJson, AuthRequiredError, errorMessage, toError } from "@/lib/api-client";
import { BRAND } from "@/lib/brand";

type GenerateStatus = "idle" | "loading" | "ready" | "error";

function updateTheme(
  draft: CoachingReportDraft,
  index: number,
  patch: Partial<CoachingReportDraft["keyThemes"][number]>
): CoachingReportDraft {
  return {
    ...draft,
    keyThemes: draft.keyThemes.map((item, i) => (i === index ? { ...item, ...patch } : item)),
  };
}

function updateStrength(
  draft: CoachingReportDraft,
  index: number,
  patch: Partial<CoachingReportDraft["strengthsDeveloped"][number]>
): CoachingReportDraft {
  return {
    ...draft,
    strengthsDeveloped: draft.strengthsDeveloped.map((item, i) =>
      i === index ? { ...item, ...patch } : item
    ),
  };
}

function updateMilestone(
  draft: CoachingReportDraft,
  index: number,
  patch: Partial<CoachingReportDraft["progressAndMilestones"][number]>
): CoachingReportDraft {
  return {
    ...draft,
    progressAndMilestones: draft.progressAndMilestones.map((item, i) =>
      i === index ? { ...item, ...patch } : item
    ),
  };
}

export function CoachingReportView({
  client,
  onBack,
  onTabChange,
  loadingSessions = false,
  coachName = DEMO_COACH_DISPLAY_NAME,
}: {
  client: Client;
  onBack: () => void;
  onTabChange?: (tab: import("@/components/client-workspace-tabs").ClientWorkspaceTab) => void;
  loadingSessions?: boolean;
  coachName?: string;
}) {
  const allApproved = useMemo(() => approvedSessions(client.sessions), [client.sessions]);

  const [reportType, setReportType] = useState<ReportType>("progress");
  const [periodMode, setPeriodMode] = useState<ReportPeriodMode>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);

  const [draft, setDraft] = useState<CoachingReportDraft | null>(null);
  const [generateStatus, setGenerateStatus] = useState<GenerateStatus>("idle");
  const [generateError, setGenerateError] = useState("");
  const [aiPartialNotice, setAiPartialNotice] = useState("");

  const [privacy, setPrivacy] = useState<ReportPrivacyOptions>(() =>
    defaultReportPrivacyForClient(client)
  );
  const [reviewed, setReviewed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const [namedExportConfirm, setNamedExportConfirm] = useState(false);

  const displayName = getRelationshipDisplayName(client);
  const isConfidential = client.identityMode === "confidential";

  const periodSelection: ReportPeriodSelection = useMemo(() => {
    if (periodMode === "date-range") {
      return { mode: "date-range", dateFrom, dateTo };
    }
    if (periodMode === "selected") {
      return { mode: "selected", sessionIds: selectedSessionIds };
    }
    return { mode: "all" };
  }, [periodMode, dateFrom, dateTo, selectedSessionIds]);

  const previewSessions = useMemo(
    () => selectApprovedSessionsForReport(client.sessions, periodSelection),
    [client.sessions, periodSelection]
  );

  const periodLabel = useMemo(
    () => formatReportPeriodLabel(previewSessions, periodSelection),
    [previewSessions, periodSelection]
  );

  const dateRangeReady = periodMode !== "date-range" || Boolean(dateFrom && dateTo);
  const selectedReady = periodMode !== "selected" || selectedSessionIds.length > 0;
  const hasEnoughEvidence = allApproved.length >= 2;
  const archived = isClientArchived(client);
  const canConfigure =
    !loadingSessions &&
    !archived &&
    hasEnoughEvidence &&
    previewSessions.length > 0 &&
    dateRangeReady &&
    selectedReady;

  function toggleSession(id: string) {
    setSelectedSessionIds(current =>
      current.includes(id) ? current.filter(item => item !== id) : [...current, id]
    );
  }

  async function generatePreview(options?: { retryAiOnly?: boolean }) {
    if (previewSessions.length === 0) {
      setGenerateError("No approved sessions are available for the selected report period.");
      setGenerateStatus("error");
      return;
    }

    const preservedCommentary = draft?.coachCommentary ?? "";
    const preservedEdits = options?.retryAiOnly ? draft : null;

    setGenerateStatus("loading");
    setGenerateError("");
    setAiPartialNotice("");
    setExportError("");
    if (!options?.retryAiOnly) {
      setReviewed(false);
    }

    const baseDraft = buildCoachingReportDraft({
      client,
      reportType,
      period: periodSelection,
      coachName,
      coachingContext: preservedEdits?.coachingContext,
      suggestedNextFocus: preservedEdits?.suggestedNextFocus,
      includePrivateName: Boolean(privacy.includePrivateName),
    });

    if (preservedEdits) {
      baseDraft.professionalIdentityDevelopment =
        preservedEdits.professionalIdentityDevelopment;
      baseDraft.keyThemes = preservedEdits.keyThemes;
      baseDraft.strengthsDeveloped = preservedEdits.strengthsDeveloped;
      baseDraft.valuesEmerging = preservedEdits.valuesEmerging;
      baseDraft.valuesSectionText = preservedEdits.valuesSectionText;
      baseDraft.progressAndMilestones = preservedEdits.progressAndMilestones;
      baseDraft.outstandingDevelopmentAreas = preservedEdits.outstandingDevelopmentAreas;
      baseDraft.coachCommentary = preservedCommentary;
    } else {
      baseDraft.coachCommentary = preservedCommentary;
    }

    try {
      const payload = await apiJson<{
        coachingContext?: string;
        suggestedNextFocus?: string[];
      }>("/api/coaching-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: client.id,
          clientName: displayName,
          reportType,
          reportPeriodLabel: periodLabel,
          evidence: coachingReportAiEvidence(previewSessions),
        }),
      });

      const nextDraft: CoachingReportDraft = {
        ...baseDraft,
        coachingContext: payload.coachingContext?.trim() || baseDraft.coachingContext,
        suggestedNextFocus:
          payload.suggestedNextFocus && payload.suggestedNextFocus.length > 0
            ? payload.suggestedNextFocus
            : baseDraft.suggestedNextFocus,
        coachCommentary: preservedCommentary,
      };

      setDraft(nextDraft);
      setGenerateStatus("ready");
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        window.location.assign("/auth/sign-in?next=/?view=today");
        return;
      }
      setDraft(baseDraft);
      setGenerateStatus("error");
      setGenerateError(
        errorMessage(
          error,
          "AI generation failed. An evidence-based draft is shown so you can edit and retry."
        )
      );
      setAiPartialNotice(
        "Evidence-based sections are available. You can edit the report and retry AI generation without losing your commentary or edits."
      );
    }
  }

  async function handleExport() {
    if (!draft || !reviewed) return;

    setExporting(true);
    setExportError("");

    try {
      await requireBrowserAuth();
      const response = await fetch("/api/coaching-report/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          draft,
          privacy,
          clientId: client.id,
          approved: true,
          saveReport: true,
        }),
      });

      if (response.status === 401) {
        window.location.assign("/auth/sign-in?next=/?view=today");
        return;
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "PDF export failed.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const type = draft.reportType === "final" ? "final-coaching-report" : "progress-report";
      const safeName = displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      anchor.href = url;
      anchor.download = `development-report-${type}-${safeName || "client"}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        window.location.assign("/auth/sign-in?next=/?view=today");
        return;
      }
      setExportError(
        errorMessage(
          toError(error, "PDF export failed. Please try again — your edited report content is preserved."),
          "PDF export failed. Please try again — your edited report content is preserved."
        )
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="page coaching-report-page">
      <button type="button" className="back" onClick={onBack}>
        <ArrowLeft size={16} /> Back to Current Position
      </button>

      {onTabChange && (
        <ClientWorkspaceTabs
          active="identity-journey"
          clientName={displayName}
          onChange={onTabChange}
        />
      )}

      <div className="page-heading row-between">
        <div>
          <p className="eyebrow">COACHING REPORT</p>
          <h1>{displayName}</h1>
          <p>
            Create a factual coaching report from approved sessions and the{" "}
            {BRAND.journeyName}. Preview and edit before export — you remain
            responsible for the final report.
          </p>
        </div>
      </div>

      {archived ? (
        <div className="inline-notice archived-banner" role="status">
          This client is archived. Restore them to add new coaching activity.
        </div>
      ) : null}

      {loadingSessions ? (
        <div className="skeleton-loading-block" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading approved sessions…</span>
          <article className="panel skeleton-card" aria-hidden>
            <div className="skeleton-block skeleton-label" />
            <div className="skeleton-block skeleton-title" />
            <div className="skeleton-block skeleton-line" />
            <div className="skeleton-block skeleton-line medium" />
          </article>
        </div>
      ) : !hasEnoughEvidence ? (
        <article className="panel empty-panel">
          <p className="eyebrow">REPORT NOT READY YET</p>
          <h2>Available after two approved coaching sessions</h2>
          <p className="muted empty-state">
            Coaching reports are built only from approved session evidence. Once two sessions are
            reviewed and approved, you can generate a Progress Report or Final Coaching Report here.
          </p>
          <p className="muted empty-state">
            {allApproved.length === 0
              ? "No approved sessions on record yet."
              : "One approved session is on record — one more unlocks report generation."}
          </p>
          <div className="button-row">
            <button type="button" className="secondary" onClick={onBack}>
              Return to Journey
            </button>
          </div>
        </article>
      ) : (
        <>
          <article className="panel report-setup-panel">
            <p className="eyebrow">REPORT SETUP</p>
            <h2>Choose report type and period</h2>

            <div className="report-setup-grid">
              <label className="report-field">
                <span>Report type</span>
                <select
                  value={reportType}
                  onChange={e => setReportType(e.target.value as ReportType)}
                >
                  <option value="progress">Progress Report</option>
                  <option value="final">Final Coaching Report</option>
                </select>
              </label>

              <label className="report-field">
                <span>Report period</span>
                <select
                  value={periodMode}
                  onChange={e => setPeriodMode(e.target.value as ReportPeriodMode)}
                >
                  <option value="all">All approved sessions</option>
                  <option value="date-range">Date range</option>
                  <option value="selected">Selected approved sessions</option>
                </select>
              </label>
            </div>

            {periodMode === "date-range" && (
              <div className="report-setup-grid">
                <label className="report-field">
                  <span>From</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                  />
                </label>
                <label className="report-field">
                  <span>To</span>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </label>
              </div>
            )}

            {periodMode === "selected" && (
              <div className="report-session-picker">
                <p className="muted small">
                  Select approved sessions to include. Unapproved sessions are never listed.
                </p>
                <div className="report-session-list">
                  {allApproved.map(session => (
                    <label key={session.id} className="report-session-option">
                      <input
                        type="checkbox"
                        checked={selectedSessionIds.includes(session.id)}
                        onChange={() => toggleSession(session.id)}
                      />
                      <span>
                        Session {session.sessionNumber}
                        {session.date ? ` · ${session.date}` : ""}
                        {session.focus ? ` — ${session.focus}` : ""}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <p className="muted small report-period-summary">
              {reportTypeLabel(reportType)} · {periodLabel} · {previewSessions.length} approved
              session{previewSessions.length === 1 ? "" : "s"}
            </p>

            {periodMode === "date-range" && (!dateFrom || !dateTo) && (
              <p className="ai-approval-hint">
                Choose both start and end dates for the report period.
              </p>
            )}

            {periodMode === "selected" && selectedSessionIds.length === 0 && (
              <p className="ai-approval-hint">Select at least one approved session.</p>
            )}

            <div className="button-row">
              <button
                type="button"
                className="primary"
                disabled={!canConfigure || generateStatus === "loading"}
                onClick={() => void generatePreview()}
              >
                <FileText size={16} />
                {generateStatus === "loading" ? "Generating preview…" : "Generate report preview"}
              </button>
            </div>
          </article>

          {generateError && (
            <div className="inline-error" role="status">
              <p>{generateError}</p>
              {draft && (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => void generatePreview({ retryAiOnly: true })}
                >
                  Retry drafted sections
                </button>
              )}
            </div>
          )}

          {aiPartialNotice && !generateError && (
            <div className="inline-notice" role="status">
              <p>{aiPartialNotice}</p>
            </div>
          )}

          {draft && (
            <>
              <article className="panel report-preview-panel">
                <div className="row-between report-preview-heading">
                  <div>
                    <p className="eyebrow">REPORT PREVIEW</p>
                    <h2>Review and edit before export</h2>
                    <p className="muted">
                      Every section is editable. Commentary is always written by you.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    disabled={generateStatus === "loading"}
                    onClick={() => void generatePreview({ retryAiOnly: true })}
                  >
                    <RefreshCw size={16} /> Refresh drafted sections
                  </button>
                </div>

                <div className="report-section">
                  <h3>1. Report Information</h3>
                  <dl className="report-meta">
                    <div>
                      <dt>Client name</dt>
                      <dd>
                        <input
                          className="report-inline-input"
                          value={draft.clientName}
                          onChange={e => setDraft({ ...draft, clientName: e.target.value })}
                        />
                      </dd>
                    </div>
                    <div>
                      <dt>Coach name</dt>
                      <dd>
                        <input
                          className="report-inline-input"
                          value={draft.coachName}
                          onChange={e => setDraft({ ...draft, coachName: e.target.value })}
                        />
                      </dd>
                    </div>
                    <div>
                      <dt>Report type</dt>
                      <dd>{reportTypeLabel(draft.reportType)}</dd>
                    </div>
                    <div>
                      <dt>Report period</dt>
                      <dd>
                        <input
                          className="report-inline-input"
                          value={draft.reportPeriodLabel}
                          onChange={e =>
                            setDraft({ ...draft, reportPeriodLabel: e.target.value })
                          }
                        />
                      </dd>
                    </div>
                    <div>
                      <dt>Approved sessions included</dt>
                      <dd>{draft.sessionCount}</dd>
                    </div>
                    <div>
                      <dt>Date generated</dt>
                      <dd>{draft.dateGenerated}</dd>
                    </div>
                  </dl>
                </div>

                <div className="report-section">
                  <h3>2. Coaching Context</h3>
                  <textarea
                    rows={5}
                    value={draft.coachingContext}
                    onChange={e => setDraft({ ...draft, coachingContext: e.target.value })}
                  />
                </div>

                <div className="report-section">
                  <h3>3. Professional Identity Development</h3>
                  <p className="muted small">
                    Distinguishes what the client reported, actions completed, and possible patterns
                    identified by AI — not clinical conclusions.
                  </p>
                  <textarea
                    rows={10}
                    value={draft.professionalIdentityDevelopment}
                    onChange={e =>
                      setDraft({
                        ...draft,
                        professionalIdentityDevelopment: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="report-section">
                  <h3>4. Key Themes</h3>
                  {draft.keyThemes.length === 0 ? (
                    <p className="muted">
                      No recurring themes across the selected approved sessions.
                    </p>
                  ) : (
                    draft.keyThemes.map((theme, index) => (
                      <div key={`${theme.theme}-${index}`} className="report-item-edit">
                        <label>
                          Theme
                          <input
                            value={theme.theme}
                            onChange={e =>
                              setDraft(updateTheme(draft, index, { theme: e.target.value }))
                            }
                          />
                        </label>
                        <label>
                          Frequency
                          <input
                            type="number"
                            min={1}
                            value={theme.frequency}
                            onChange={e =>
                              setDraft(
                                updateTheme(draft, index, {
                                  frequency: Number(e.target.value) || 1,
                                })
                              )
                            }
                          />
                        </label>
                        <label>
                          Description
                          <textarea
                            rows={2}
                            value={theme.description}
                            onChange={e =>
                              setDraft(
                                updateTheme(draft, index, { description: e.target.value })
                              )
                            }
                          />
                        </label>
                        <label>
                          Supporting session references
                          <input
                            value={theme.sessionRefs.join("; ")}
                            onChange={e =>
                              setDraft(
                                updateTheme(draft, index, {
                                  sessionRefs: e.target.value
                                    .split(";")
                                    .map(part => part.trim())
                                    .filter(Boolean),
                                })
                              )
                            }
                          />
                        </label>
                      </div>
                    ))
                  )}
                </div>

                <div className="report-section">
                  <h3>5. Strengths Developed</h3>
                  <p className="muted small">
                    Recurring strengths supported by approved session evidence — not formal
                    assessments.
                  </p>
                  {draft.strengthsDeveloped.length === 0 ? (
                    <p className="muted">No evidenced strengths for this period.</p>
                  ) : (
                    draft.strengthsDeveloped.map((item, index) => (
                      <div key={`${item.label}-${index}`} className="report-item-edit">
                        <label>
                          Strength
                          <input
                            value={item.label}
                            onChange={e =>
                              setDraft(updateStrength(draft, index, { label: e.target.value }))
                            }
                          />
                        </label>
                        <label>
                          Sessions observed
                          <input
                            type="number"
                            min={1}
                            value={item.sessionsObserved}
                            onChange={e =>
                              setDraft(
                                updateStrength(draft, index, {
                                  sessionsObserved: Number(e.target.value) || 1,
                                })
                              )
                            }
                          />
                        </label>
                        <label>
                          Concise example
                          <textarea
                            rows={2}
                            value={item.example}
                            onChange={e =>
                              setDraft(updateStrength(draft, index, { example: e.target.value }))
                            }
                          />
                        </label>
                        <label>
                          Originating session reference
                          <input
                            value={item.sessionRef}
                            onChange={e =>
                              setDraft(
                                updateStrength(draft, index, { sessionRef: e.target.value })
                              )
                            }
                          />
                        </label>
                      </div>
                    ))
                  )}
                </div>

                <div className="report-section">
                  <h3>6. Values Emerging</h3>
                  <textarea
                    rows={6}
                    value={draft.valuesSectionText}
                    onChange={e => setDraft({ ...draft, valuesSectionText: e.target.value })}
                  />
                </div>

                <div className="report-section">
                  <h3>7. Progress and Milestones</h3>
                  {draft.progressAndMilestones.length === 0 ? (
                    <p className="muted">No milestones recorded for this period.</p>
                  ) : (
                    draft.progressAndMilestones.map((item, index) => (
                      <div
                        key={`${item.sessionNumber}-${index}`}
                        className="report-item-edit"
                      >
                        <label>
                          Milestone / achievement
                          <textarea
                            rows={2}
                            value={item.title}
                            onChange={e =>
                              setDraft(updateMilestone(draft, index, { title: e.target.value }))
                            }
                          />
                        </label>
                        <label>
                          Session reference
                          <input
                            value={`Session ${item.sessionNumber}${item.date ? ` · ${item.date}` : ""}`}
                            onChange={e => {
                              const match = e.target.value.match(
                                /Session\s+(\d+)(?:\s*·\s*(.+))?/i
                              );
                              setDraft(
                                updateMilestone(draft, index, {
                                  sessionNumber: match
                                    ? Number(match[1]) || item.sessionNumber
                                    : item.sessionNumber,
                                  date: match?.[2]?.trim() || item.date,
                                })
                              );
                            }}
                          />
                        </label>
                      </div>
                    ))
                  )}
                </div>

                <div className="report-section">
                  <h3>8. Outstanding Development Areas</h3>
                  <p className="muted small">
                    Unresolved commitments, recurring challenges, and areas to continue exploring —
                    not diagnoses or mandatory recommendations.
                  </p>
                  <textarea
                    rows={8}
                    value={draft.outstandingDevelopmentAreas}
                    onChange={e =>
                      setDraft({ ...draft, outstandingDevelopmentAreas: e.target.value })
                    }
                  />
                </div>

                <div className="report-section">
                  <h3>9. Suggested Next Focus</h3>
                  <p className="muted small">
                    Up to three suggestions. Each must begin with “Possible next focus:”.
                  </p>
                  <textarea
                    rows={5}
                    value={draft.suggestedNextFocus.join("\n")}
                    onChange={e =>
                      setDraft({
                        ...draft,
                        suggestedNextFocus: e.target.value
                          .split("\n")
                          .map(line => line.trim())
                          .filter(Boolean)
                          .slice(0, 3),
                      })
                    }
                  />
                </div>

                <div className="report-section">
                  <h3>10. Coach Commentary</h3>
                  <p className="muted small">
                    Add your own professional commentary. This section is never auto-generated.
                  </p>
                  <textarea
                    rows={6}
                    placeholder="Write your professional commentary here…"
                    value={draft.coachCommentary}
                    onChange={e => setDraft({ ...draft, coachCommentary: e.target.value })}
                  />
                </div>
              </article>

              <article className="panel">
                <p className="eyebrow">PRIVACY OPTIONS</p>
                <h2>Choose what to include in the PDF</h2>
                <p className="muted">
                  {isConfidential
                    ? "Defaults use the confidential reference and display label. Private names are excluded unless you choose a named export."
                    : "Defaults include standard options. Adjust before export."}
                </p>
                <div className="report-privacy-list">
                  {(
                    [
                      ["includeClientName", isConfidential ? "Display label / reference" : "Client name"],
                      ["includeCoachName", "Coach name"],
                      ["includeSessionDates", "Individual session dates"],
                      ["includeOutstandingCommitments", "Outstanding commitments"],
                      ["includeCoachCommentary", "Coach commentary"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="report-privacy-option">
                      <input
                        type="checkbox"
                        checked={privacy[key]}
                        onChange={e =>
                          setPrivacy(current => ({ ...current, [key]: e.target.checked }))
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                  <label className="report-privacy-option">
                    <input
                      type="checkbox"
                      checked={Boolean(privacy.includePrivateName)}
                      onChange={e => {
                        if (e.target.checked) {
                          setNamedExportConfirm(true);
                        } else {
                          setPrivacy(current => ({
                            ...current,
                            includePrivateName: false,
                          }));
                        }
                      }}
                    />
                    <span>Include private name (named export)</span>
                  </label>
                </div>
                {namedExportConfirm ? (
                  <div className="report-named-export-confirm" role="alertdialog">
                    <p>
                      Named exports include the private name on this report. Confirm only when you
                      intend to share a named document. Organisation and aggregate reports never
                      include private identity.
                    </p>
                    <div className="report-named-export-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setNamedExportConfirm(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="primary"
                        onClick={() => {
                          setPrivacy(current => ({
                            ...current,
                            includePrivateName: true,
                          }));
                          setNamedExportConfirm(false);
                        }}
                      >
                        Confirm named export
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>

              <article className="panel">
                <div className="ai-approval">
                  <label className="ai-approval-label" htmlFor="coaching-report-approval">
                    <input
                      id="coaching-report-approval"
                      type="checkbox"
                      checked={reviewed}
                      onChange={e => {
                        setReviewed(e.target.checked);
                        setExportError("");
                      }}
                    />
                    <span>
                      I have reviewed this report and confirm that it accurately reflects the
                      coaching record.
                    </span>
                  </label>
                  <p className="ai-approval-hint">
                    Export stays disabled until this checkbox is selected. The coach remains
                    responsible for the final report.
                  </p>
                </div>

                {exportError && (
                  <div className="inline-error" role="status">
                    <p>{exportError}</p>
                    <button
                      type="button"
                      className="text-link"
                      disabled={!reviewed || exporting}
                      onClick={() => void handleExport()}
                    >
                      Retry PDF export
                    </button>
                  </div>
                )}

                <div className="button-row">
                  <button
                    type="button"
                    className="primary"
                    disabled={!reviewed || exporting}
                    onClick={() => void handleExport()}
                  >
                    <Download size={16} />
                    {exporting ? "Exporting PDF…" : "Export PDF"}
                  </button>
                </div>
              </article>
            </>
          )}
        </>
      )}
    </section>
  );
}
