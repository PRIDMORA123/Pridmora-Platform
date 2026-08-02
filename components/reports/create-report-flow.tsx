"use client";

import { useEffect, useMemo, useState } from "react";
import { apiJson, errorMessage, toError } from "@/lib/api-client";
import type { Client } from "@/lib/types";
import type {
  DevelopmentProfile,
  DevelopmentUpdate,
} from "@/lib/development-updates/types";
import {
  collectAvailableEvidence,
  commitmentsFromSelection,
  createCoachAddedEvidence,
  evidenceItemsFromSelection,
} from "@/lib/reports/evidence";
import { buildCoachingImpactMetrics } from "@/lib/reports/metrics";
import type {
  AssociatedIndicator,
  AvailableEvidenceItem,
  DevelopmentReport,
  ReportAudience,
  ReportCreationStep,
  ReportDetailsForm,
  ReportType,
} from "@/lib/reports/types";
import {
  REPORT_AUDIENCE_LABELS,
  REPORT_TYPE_LABELS,
  defaultAudienceForType,
  defaultTitleForType,
} from "@/lib/reports/types";
import { EvidenceSelectionItem } from "@/components/reports/evidence-selection-item";
import { ReportSectionEditor } from "@/components/reports/report-section-editor";
import { DevelopmentReportPreview } from "@/components/reports/development-report-preview";
import { ActionButton } from "@/components/feedback/action-button";
import { useToast } from "@/components/feedback/toast-provider";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { toActionButtonStatus } from "@/types/action-feedback";

const STEPS: ReportCreationStep[] = ["details", "evidence", "review", "approve"];

function ReportStepIndicator({
  currentStep,
}: {
  currentStep: ReportCreationStep;
}) {
  return (
    <p className="report-step-indicator" aria-label="Report creation steps">
      {STEPS.map((step, index) => {
        const label =
          step === "details"
            ? "Details"
            : step === "evidence"
              ? "Evidence"
              : step === "review"
                ? "Review"
                : "Approve";
        const active = step === currentStep;
        return (
          <span key={step} className={active ? "is-active" : undefined}>
            {index + 1} {label}
            {index < STEPS.length - 1 ? "    " : ""}
          </span>
        );
      })}
    </p>
  );
}

export function CreateReportFlow({
  client,
  coachName,
  initialType,
  existingReport,
  onCancel,
  onCompleted,
}: {
  client: Client;
  coachName: string;
  initialType?: ReportType;
  existingReport?: DevelopmentReport | null;
  onCancel: () => void;
  onCompleted: (report: DevelopmentReport) => void;
}) {
  const [step, setStep] = useState<ReportCreationStep>(
    existingReport?.evidenceItems.length ? "review" : "details"
  );
  const [report, setReport] = useState<DevelopmentReport | null>(
    existingReport ?? null
  );
  const [profile, setProfile] = useState<DevelopmentProfile | null>(null);
  const [updates, setUpdates] = useState<DevelopmentUpdate[]>([]);
  const [availableEvidence, setAvailableEvidence] = useState<
    AvailableEvidenceItem[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [coachAddedArea, setCoachAddedArea] = useState("");
  const [coachAddedEvidence, setCoachAddedEvidence] = useState("");
  const createFeedback = useActionFeedback();
  const generateFeedback = useActionFeedback();
  const reviewFeedback = useActionFeedback();
  const approveFeedback = useActionFeedback();
  const { showToast } = useToast();
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [audienceConfirmed, setAudienceConfirmed] = useState(false);
  const [draftNotice, setDraftNotice] = useState(false);
  const [indicatorDraft, setIndicatorDraft] = useState({
    name: "",
    baselineValue: "",
    currentValue: "",
    context: "",
  });

  const [details, setDetails] = useState<ReportDetailsForm>(() => {
    const type = existingReport?.type ?? initialType ?? "progress_snapshot";
    return {
      type,
      title:
        existingReport?.title ?? defaultTitleForType(type, client.name),
      audience: existingReport?.audience ?? defaultAudienceForType(type),
      reportingPeriodStart: existingReport?.reportingPeriodStart ?? "",
      reportingPeriodEnd: existingReport?.reportingPeriodEnd ?? "",
      includeCoachStatement: existingReport?.includeCoachStatement ?? false,
    };
  });

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const data = await apiJson<{
          profile: DevelopmentProfile;
          updates: DevelopmentUpdate[];
        }>(`/api/development-profiles/${client.id}`);
        if (cancelled) return;
        setProfile(data.profile);
        setUpdates(data.updates ?? []);
      } catch {
        if (!cancelled) {
          setProfile(null);
          setUpdates([]);
        }
      }
    }
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [client.id]);

  useEffect(() => {
    const items = collectAvailableEvidence({
      client,
      profile,
      updates,
      reportingPeriodStart: details.reportingPeriodStart,
      reportingPeriodEnd: details.reportingPeriodEnd,
    });

    setAvailableEvidence(current => {
      const coachAdded = current.filter(item => item.sourceType === "coach_added");
      const merged = [...coachAdded, ...items];
      const seen = new Set<string>();
      return merged.filter(item => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    });

    setSelectedIds(current => {
      if (current.size > 0) return current;
      if (report?.evidenceItems.length) {
        return new Set(report.evidenceItems.map(item => item.id));
      }
      return new Set(items.filter(item => item.suggested).map(item => item.id));
    });
  }, [
    client,
    profile,
    updates,
    details.reportingPeriodStart,
    details.reportingPeriodEnd,
    report,
  ]);

  const selectedEvidence = useMemo(
    () => availableEvidence.filter(item => selectedIds.has(item.id)),
    [availableEvidence, selectedIds]
  );

  function updateDetails<K extends keyof ReportDetailsForm>(
    key: K,
    value: ReportDetailsForm[K]
  ) {
    setDetails(current => {
      const next = { ...current, [key]: value };
      if (key === "type") {
        const type = value as ReportType;
        next.audience = defaultAudienceForType(type);
        if (
          !current.title ||
          current.title === defaultTitleForType(current.type, client.name)
        ) {
          next.title = defaultTitleForType(type, client.name);
        }
      }
      return next;
    });
  }

  async function createOrUpdateDetails() {
    if (createFeedback.isLoading) return;
    setError("");

    const created = await createFeedback.runAction(
      async () => {
        const coachingPurpose =
          (profile?.currentFocus || client.currentFocus || "").trim() || null;

        let nextReport: DevelopmentReport;
        if (report) {
          const data = await apiJson<{ report: DevelopmentReport }>(
            `/api/development-reports/${report.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: details.title.trim(),
                audience: details.audience,
                reportingPeriodStart: details.reportingPeriodStart || null,
                reportingPeriodEnd: details.reportingPeriodEnd || null,
                includeCoachStatement: details.includeCoachStatement,
                coachingPurpose,
              }),
            }
          );
          nextReport = data.report;
        } else {
          const requestId = crypto.randomUUID();
          const data = await apiJson<{ report: DevelopmentReport }>(
            "/api/development-reports",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                requestId,
                clientId: client.id,
                type: details.type,
                audience: details.audience,
                title: details.title.trim(),
                reportingPeriodStart: details.reportingPeriodStart || null,
                reportingPeriodEnd: details.reportingPeriodEnd || null,
                includeCoachStatement: details.includeCoachStatement,
                coachingPurpose,
                personName: client.name,
              }),
            }
          );
          nextReport = data.report;
        }

        setReport(nextReport);
        setStep("evidence");
        return nextReport;
      },
      {
        loadingMessage: report ? "Saving…" : "Creating report…",
        successMessage: report ? "Saved" : "Report created",
        errorMessage: "Unable to create report",
        successDurationMs: 3000,
        onSuccess: nextReport => {
          if (!report) {
            showToast({
              type: "success",
              title: "Report created",
              description: "The draft is ready for review.",
            });
          } else {
            showToast({
              type: "success",
              title: "Report details saved",
            });
          }
          void nextReport;
        },
        onError: err => {
          console.error("Create report failed", err);
          setError(errorMessage(toError(err)));
          showToast({
            type: "error",
            title: "Report could not be created",
            description: "No report has been saved. Please try again.",
            durationMs: 5000,
          });
        },
      }
    );

    void created;
  }

  async function persistEvidenceAndGenerate() {
    if (!report || generateFeedback.isLoading) return;
    setError("");
    setDraftNotice(false);

    await generateFeedback.runAction(
      async () => {
        const evidenceItems = evidenceItemsFromSelection(selectedEvidence);
        const commitments = commitmentsFromSelection(
          selectedEvidence,
          profile,
          client
        );
        const impactMetrics = buildCoachingImpactMetrics({
          client,
          updates,
          reportingPeriodStart: details.reportingPeriodStart || null,
          reportingPeriodEnd: details.reportingPeriodEnd || null,
        });

        await apiJson(`/api/development-reports/${report.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            evidenceItems,
            commitments,
            impactMetrics,
            coachingPurpose:
              selectedEvidence.find(
                item => item.sourceType === "coaching_purpose"
              )?.evidence ??
              report.coachingPurpose ??
              client.currentFocus,
          }),
        });

        const data = await apiJson<{ report: DevelopmentReport }>(
          `/api/development-reports/${report.id}/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              evidenceItems,
              commitments,
              coachingPurpose:
                selectedEvidence.find(
                  item => item.sourceType === "coaching_purpose"
                )?.evidence ?? report.coachingPurpose,
            }),
          }
        );

        setReport(data.report);
        setDraftNotice(true);
        setStep("review");
        return data.report;
      },
      {
        loadingMessage: "Creating report…",
        successMessage: "Report created",
        errorMessage: "Unable to create report",
        successDurationMs: 3000,
        onSuccess: () => {
          showToast({
            type: "success",
            title: "Report created",
            description: "The draft is ready for review.",
          });
        },
        onError: err => {
          console.error("Generate report failed", err);
          setError(errorMessage(toError(err)));
          showToast({
            type: "error",
            title: "Report could not be created",
            description: "No report has been saved. Please try again.",
            durationMs: 5000,
          });
        },
      }
    );
  }

  async function saveReviewAndContinue() {
    if (!report || reviewFeedback.isLoading) return;
    setError("");

    await reviewFeedback.runAction(
      async () => {
        const data = await apiJson<{ report: DevelopmentReport }>(
          `/api/development-reports/${report.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              executiveSummary: report.executiveSummary,
              progressSummary: report.progressSummary,
              developmentThemes: report.developmentThemes,
              futurePriorities: report.futurePriorities,
              coachStatement: report.coachStatement,
              includeCoachStatement: details.includeCoachStatement,
              associatedIndicators: report.associatedIndicators,
            }),
          }
        );
        setReport(data.report);
        setStep("approve");
        return data.report;
      },
      {
        loadingMessage: "Saving…",
        successMessage: "Saved",
        errorMessage: "Unable to save report",
        onSuccess: () => {
          showToast({
            type: "success",
            title: "Report saved",
          });
        },
        onError: err => {
          console.error("Save report review failed", err);
          setError(errorMessage(toError(err)));
          showToast({
            type: "error",
            title: "Report could not be saved",
            description: "Your changes remain on screen. Please try again.",
            durationMs: 5000,
          });
        },
      }
    );
  }

  async function approveReport() {
    if (!report || !confirmed || approveFeedback.isLoading) return;
    setError("");

    await approveFeedback.runAction(
      async () => {
        const data = await apiJson<{ report: DevelopmentReport }>(
          `/api/development-reports/${report.id}/approve`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              confidentialityConfirmed: confirmed,
              audienceConfirmed:
                report.audience !== "sponsor" || audienceConfirmed,
            }),
          }
        );
        onCompleted(data.report);
        return data.report;
      },
      {
        loadingMessage: "Approving…",
        successMessage: "Report approved",
        errorMessage: "Unable to approve report",
        successDurationMs: 3000,
        onSuccess: () => {
          showToast({
            type: "success",
            title: "Report approved",
          });
        },
        onError: err => {
          console.error("Approve report failed", err);
          setError(errorMessage(toError(err)));
          showToast({
            type: "error",
            title: "Report could not be approved",
            description: "Please try again.",
            durationMs: 5000,
          });
        },
      }
    );
  }

  function addCoachEvidence() {
    if (!coachAddedEvidence.trim()) return;
    const item = createCoachAddedEvidence(coachAddedArea, coachAddedEvidence);
    setAvailableEvidence(current => [item, ...current]);
    setSelectedIds(current => new Set([...current, item.id]));
    setCoachAddedArea("");
    setCoachAddedEvidence("");
  }

  function addAssociatedIndicator() {
    if (!report || !indicatorDraft.name.trim()) return;
    const indicator: AssociatedIndicator = {
      id: crypto.randomUUID(),
      name: indicatorDraft.name.trim(),
      baselineValue: indicatorDraft.baselineValue.trim(),
      currentValue: indicatorDraft.currentValue.trim(),
      context: indicatorDraft.context.trim() || undefined,
    };
    setReport({
      ...report,
      associatedIndicators: [...report.associatedIndicators, indicator],
    });
    setIndicatorDraft({
      name: "",
      baselineValue: "",
      currentValue: "",
      context: "",
    });
  }

  return (
    <div className="report-editor-shell">
      <div className="report-editor-actions">
        <button
          type="button"
          className="identity-button identity-button--quiet is-quiet is-sm"
          onClick={onCancel}
        >
          Back to reports
        </button>
      </div>

      <ReportStepIndicator currentStep={step} />

      {error ? <p className="report-inline-error">{error}</p> : null}

      {step === "details" && (
        <section className="report-step-panel">
          <header>
            <p className="reports-eyebrow">Step 1</p>
            <h2>Report details</h2>
            <p>Choose the report shape, audience and reporting period.</p>
          </header>

          <div className="report-details-form">
            <label>
              Report type
              <select
                value={details.type}
                onChange={event =>
                  updateDetails("type", event.target.value as ReportType)
                }
                disabled={Boolean(report)}
              >
                {(Object.keys(REPORT_TYPE_LABELS) as ReportType[]).map(type => (
                  <option key={type} value={type}>
                    {REPORT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Report title
              <input
                value={details.title}
                onChange={event => updateDetails("title", event.target.value)}
              />
            </label>

            <label>
              Audience
              <select
                value={details.audience}
                onChange={event =>
                  updateDetails(
                    "audience",
                    event.target.value as ReportAudience
                  )
                }
              >
                {(Object.keys(REPORT_AUDIENCE_LABELS) as ReportAudience[]).map(
                  audience => (
                    <option key={audience} value={audience}>
                      {REPORT_AUDIENCE_LABELS[audience]}
                    </option>
                  )
                )}
              </select>
            </label>

            <div className="report-details-period">
              <label>
                Reporting period start
                <input
                  type="date"
                  value={details.reportingPeriodStart}
                  onChange={event =>
                    updateDetails("reportingPeriodStart", event.target.value)
                  }
                />
              </label>
              <label>
                Reporting period end
                <input
                  type="date"
                  value={details.reportingPeriodEnd}
                  onChange={event =>
                    updateDetails("reportingPeriodEnd", event.target.value)
                  }
                />
              </label>
            </div>

            <label className="report-checkbox-row">
              <input
                type="checkbox"
                checked={details.includeCoachStatement}
                onChange={event =>
                  updateDetails("includeCoachStatement", event.target.checked)
                }
              />
              <span>Include an optional coach statement</span>
            </label>
          </div>

          <div className="report-editor-actions">
            <ActionButton
              variant="primary"
              status={toActionButtonStatus(createFeedback.feedback.status)}
              idleLabel={report ? "Continue to evidence" : "Create report"}
              loadingLabel={report ? "Saving…" : "Creating report…"}
              successLabel={report ? "Saved" : "Report created"}
              errorLabel="Try again"
              disabled={createFeedback.isLoading || !details.title.trim()}
              onClick={() => void createOrUpdateDetails()}
            />
          </div>
        </section>
      )}

      {step === "evidence" && (
        <section className="report-step-panel">
          <header>
            <p className="reports-eyebrow">Step 2</p>
            <h2>Select approved evidence</h2>
            <p>
              Suggested items may begin selected. Remove anything that should
              not appear in this report.
            </p>
          </header>

          <div className="evidence-selection-list">
            {availableEvidence.length === 0 ? (
              <p className="muted">
                No approved evidence is available yet for this reporting period.
              </p>
            ) : (
              availableEvidence.map(item => (
                <EvidenceSelectionItem
                  key={item.id}
                  item={item}
                  selected={selectedIds.has(item.id)}
                  onChange={selected => {
                    setSelectedIds(current => {
                      const next = new Set(current);
                      if (selected) next.add(item.id);
                      else next.delete(item.id);
                      return next;
                    });
                  }}
                />
              ))
            )}
          </div>

          <div className="coach-added-evidence">
            <h3>Add coach-created evidence</h3>
            <label>
              Development area
              <input
                value={coachAddedArea}
                onChange={event => setCoachAddedArea(event.target.value)}
              />
            </label>
            <label>
              Evidence
              <textarea
                value={coachAddedEvidence}
                onChange={event => setCoachAddedEvidence(event.target.value)}
                rows={3}
              />
            </label>
            <button
              type="button"
              className="identity-button identity-button--secondary is-secondary is-sm"
              onClick={addCoachEvidence}
            >
              Add evidence
            </button>
          </div>

          <div className="report-editor-actions">
            <button
              type="button"
              className="identity-button identity-button--quiet is-quiet"
              onClick={() => setStep("details")}
            >
              Back
            </button>
            <ActionButton
              variant="primary"
              status={toActionButtonStatus(generateFeedback.feedback.status)}
              idleLabel="Generate draft and review"
              loadingLabel="Creating report…"
              successLabel="Report created"
              errorLabel="Try again"
              disabled={generateFeedback.isLoading || selectedIds.size === 0}
              onClick={() => void persistEvidenceAndGenerate()}
            />
          </div>
        </section>
      )}

      {step === "review" && report && (
        <section className="report-step-panel">
          <header>
            <p className="reports-eyebrow">Step 3</p>
            <h2>Review and edit</h2>
            <p>
              Suggested wording based on selected coaching evidence. Review and
              edit every section before approval.
            </p>
          </header>

          {draftNotice ? (
            <p className="report-draft-notice">
              Suggested wording based on selected coaching evidence. Review and
              edit every section before approval.
            </p>
          ) : null}

          <ReportSectionEditor
            label="Executive summary"
            value={report.executiveSummary ?? ""}
            onChange={value =>
              setReport({ ...report, executiveSummary: value })
            }
          />
          <ReportSectionEditor
            label="Progress summary"
            value={report.progressSummary ?? ""}
            onChange={value => setReport({ ...report, progressSummary: value })}
          />
          <ReportSectionEditor
            label="Coaching purpose"
            value={report.coachingPurpose ?? ""}
            onChange={value => setReport({ ...report, coachingPurpose: value })}
          />
          <ReportSectionEditor
            label="Development themes"
            helperText="One theme per block: Title — summary"
            value={report.developmentThemes
              .map(theme => `${theme.title} — ${theme.summary}`)
              .join("\n\n")}
            onChange={value =>
              setReport({
                ...report,
                developmentThemes: value
                  .split(/\n\s*\n/)
                  .map((block, index) => {
                    const [title, ...rest] = block.split("—");
                    return {
                      id: report.developmentThemes[index]?.id ?? `theme-${index}`,
                      title: (title ?? "").trim(),
                      summary: rest.join("—").trim(),
                    };
                  })
                  .filter(theme => theme.title || theme.summary),
              })
            }
          />
          <ReportSectionEditor
            label="Future priorities"
            helperText="One priority per line"
            value={report.futurePriorities.join("\n")}
            onChange={value =>
              setReport({
                ...report,
                futurePriorities: value
                  .split("\n")
                  .map(item => item.trim())
                  .filter(Boolean),
              })
            }
          />

          {details.includeCoachStatement ? (
            <ReportSectionEditor
              label="Coach statement"
              helperText="Optional. Written by the coach — never auto-generated."
              value={report.coachStatement ?? ""}
              onChange={value =>
                setReport({ ...report, coachStatement: value })
              }
            />
          ) : null}

          {report.type === "impact_summary" ? (
            <div className="associated-indicators-editor">
              <h3>Associated organisational indicators</h3>
              <p>
                Optional measures entered by the organisation. Do not label
                these as results caused by coaching.
              </p>
              {report.associatedIndicators.map(indicator => (
                <div key={indicator.id} className="report-indicator-edit">
                  <strong>{indicator.name}</strong>
                  <span>
                    {indicator.baselineValue} → {indicator.currentValue}
                  </span>
                </div>
              ))}
              <div className="report-details-form">
                <label>
                  Indicator name
                  <input
                    value={indicatorDraft.name}
                    onChange={event =>
                      setIndicatorDraft(current => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Baseline value
                  <input
                    value={indicatorDraft.baselineValue}
                    onChange={event =>
                      setIndicatorDraft(current => ({
                        ...current,
                        baselineValue: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Current value
                  <input
                    value={indicatorDraft.currentValue}
                    onChange={event =>
                      setIndicatorDraft(current => ({
                        ...current,
                        currentValue: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Context
                  <input
                    value={indicatorDraft.context}
                    onChange={event =>
                      setIndicatorDraft(current => ({
                        ...current,
                        context: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                className="identity-button identity-button--secondary is-secondary is-sm"
                onClick={addAssociatedIndicator}
              >
                Add indicator
              </button>
            </div>
          ) : null}

          <div className="report-preview-toolbar">
            <h3>Preview</h3>
          </div>
          <DevelopmentReportPreview
            report={report}
            client={client}
            coachName={coachName}
          />

          <div className="report-editor-actions">
            <button
              type="button"
              className="identity-button identity-button--quiet is-quiet"
              onClick={() => setStep("evidence")}
            >
              Back
            </button>
            <ActionButton
              variant="primary"
              status={toActionButtonStatus(reviewFeedback.feedback.status)}
              idleLabel="Continue to approve"
              loadingLabel="Saving…"
              successLabel="Saved"
              errorLabel="Try again"
              disabled={reviewFeedback.isLoading}
              onClick={() => void saveReviewAndContinue()}
            />
          </div>
        </section>
      )}

      {step === "approve" && report && (
        <section className="report-step-panel">
          <header>
            <p className="reports-eyebrow">Step 4</p>
            <h2>Approve report</h2>
            <p>
              Confirm confidentiality before preserving this as an approved
              record.
            </p>
          </header>

          <DevelopmentReportPreview
            report={report}
            client={client}
            coachName={coachName}
          />

          <label className="report-confidentiality-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={event => setConfirmed(event.target.checked)}
            />
            <span>
              I have reviewed this report and confirmed that it contains no
              private coaching notes, unapproved reflections or confidential
              disclosures that should not be shared with the selected audience.
            </span>
          </label>

          {report.audience === "sponsor" ? (
            <label className="report-confidentiality-confirmation">
              <input
                type="checkbox"
                checked={audienceConfirmed}
                onChange={event => setAudienceConfirmed(event.target.checked)}
              />
              <span>
                I confirm this report is intended for a sponsor or
                organisational audience and excludes confidential coaching
                content.
              </span>
            </label>
          ) : null}

          <div className="report-editor-actions">
            <button
              type="button"
              className="identity-button identity-button--quiet is-quiet"
              onClick={() => setStep("review")}
            >
              Back
            </button>
            <ActionButton
              variant="primary"
              status={toActionButtonStatus(approveFeedback.feedback.status)}
              idleLabel="Approve report"
              loadingLabel="Approving…"
              successLabel="Report approved"
              errorLabel="Try again"
              disabled={
                !confirmed ||
                approveFeedback.isLoading ||
                (report.audience === "sponsor" && !audienceConfirmed)
              }
              onClick={() => void approveReport()}
            />
          </div>
        </section>
      )}
    </div>
  );
}
