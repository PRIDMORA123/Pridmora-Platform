"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { OrganisationShell } from "@/components/organisation/organisation-shell";
import {
  MetricGroup,
  MetricItem,
} from "@/components/organisation/metric-group";
import {
  OrganisationIntelligenceEvidenceDrawer,
  OrganisationIntelligenceThemeDrawer,
} from "@/components/organisation/intelligence/evidence-drawers";
import { apiJson } from "@/lib/api-client";
import {
  GENERATION_STAGE_LABELS,
  ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
  PREVALENCE_DIRECTION_NOTE,
  COVERAGE_CAVEAT_NOTE,
  confidenceDisplayLabel,
  directionLabel,
  directionScreenReaderLabel,
  type ConfidenceLevel,
  type EvidenceTrace,
  type GenerationStage,
  type OrganisationIntelligencePeriod,
  type OrganisationIntelligenceSnapshotView,
  type ThemeView,
} from "@/lib/organisation-intelligence";

/** Snapshot header / theme labels: "Moderate" not "Moderate confidence". */
function confidenceLevelWord(level: ConfidenceLevel): string {
  if (level === "high") return "High";
  if (level === "moderate") return "Moderate";
  return "Low";
}

type HistoryItem = {
  id: string;
  periodStart: string;
  periodEnd: string;
  periodKey: string;
  generatedAt: string;
  confidenceLevel: string;
  status: string;
  sourceRelationshipCount: number;
};

type EvidenceIndicators = {
  contributingRelationships: number;
  conversations: number;
  readyToGenerate: boolean;
};

type LoadPayload = {
  snapshot: OrganisationIntelligenceSnapshotView | null;
  history: HistoryItem[];
  defaultPeriod: OrganisationIntelligencePeriod;
  privacyNote: string;
  confidentialityNote: string;
  migrationRequired?: boolean;
  evidenceIndicators?: EvidenceIndicators | null;
};

const PERIOD_OPTIONS = [
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "last_12_months", label: "Last 12 months" },
  { value: "custom", label: "Custom date range" },
] as const;

const VALUE_STEPS = [
  {
    title: "Record development evidence",
    copy: "Approved conversations, actions and development updates form the evidence base.",
  },
  {
    title: "Aggregate it safely",
    copy: "Pridmora combines anonymised signals without exposing private identity.",
  },
  {
    title: "Identify development patterns",
    copy: "Recurring themes and capability trends become visible once enough relationships contribute.",
  },
  {
    title: "Support informed decisions",
    copy: "Leaders can focus organisational attention where the evidence is strongest.",
  },
] as const;

/**
 * Never surface React/DOM Event objects (or their stringification) in the UI.
 */
function getSafeErrorMessage(
  error: unknown,
  fallback = "We could not complete that action. Please try again."
): string {
  if (typeof Event !== "undefined" && error instanceof Event) {
    return fallback;
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (!message || /^\[object [\w]*Event\]$/.test(message)) {
      return fallback;
    }
    // Guard against API/DB messages produced when an Event was encoded as an ID.
    if (message.includes("[object Event]") || message.includes("%5Bobject%20Event%5D")) {
      return fallback;
    }
    return message;
  }

  if (typeof error === "string") {
    const message = error.trim();
    if (!message || /^\[object [\w]*Event\]$/.test(message)) {
      return fallback;
    }
    return message;
  }

  return fallback;
}

function asOptionalSnapshotId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asPeriodPresetValue(value: unknown): string {
  return typeof value === "string" ? value : "last_90_days";
}

function PrivacyThresholdHint() {
  const tipId = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className="org-intelligence-threshold-hint">
      <button
        type="button"
        className="org-intelligence-threshold-hint__trigger"
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        aria-label="About the privacy threshold"
        onClick={() => setOpen(current => !current)}
        onBlur={() => setOpen(false)}
        onKeyDown={event => {
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      >
        ?
      </button>
      {open ? (
        <span id={tipId} role="tooltip" className="org-intelligence-threshold-hint__tip">
          A minimum of five contributing relationships helps reduce the risk of
          identifying individuals. Themes appear only when that threshold is
          met and reflect contributing authorised evidence — not every licensed
          manager. {PREVALENCE_DIRECTION_NOTE}
        </span>
      ) : null}
    </span>
  );
}

export default function OrganisationIntelligencePage() {
  const [payload, setPayload] = useState<LoadPayload | null>(null);
  const [snapshot, setSnapshot] =
    useState<OrganisationIntelligenceSnapshotView | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generationStage, setGenerationStage] =
    useState<GenerationStage | null>(null);
  const [period, setPeriod] = useState("last_90_days");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedTheme, setSelectedTheme] = useState<ThemeView | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<EvidenceTrace | null>(
    null
  );

  const load = useCallback(async (snapshotId?: unknown) => {
    // Ignore React click/change Event objects if a handler is ever wired as onClick={load}.
    const safeSnapshotId = asOptionalSnapshotId(snapshotId);
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (safeSnapshotId) {
        params.set("snapshotId", safeSnapshotId);
      } else {
        params.set("period", asPeriodPresetValue(period));
        if (period === "custom") {
          if (customStart) params.set("periodStart", customStart);
          if (customEnd) params.set("periodEnd", customEnd);
        }
      }
      const query = params.toString() ? `?${params.toString()}` : "";
      const data = await apiJson<LoadPayload>(
        `/api/organisations/intelligence${query}`
      );
      setPayload(data);
      setSnapshot(data.snapshot);
      if (data.snapshot?.period.preset) {
        setPeriod(asPeriodPresetValue(data.snapshot.period.preset));
      }
    } catch (err) {
      setError(
        getSafeErrorMessage(err, "Unable to load organisation intelligence.")
      );
    } finally {
      setLoading(false);
    }
  }, [customEnd, customStart, period]);

  useEffect(() => {
    void load();
  }, [load]);

  const generateIntelligence = async () => {
    const safePeriod = asPeriodPresetValue(period);
    setGenerating(true);
    setError("");
    setGenerationStage("gathering_evidence");
    try {
      setGenerationStage("calculating_trends");
      const body: Record<string, string> = { period: safePeriod };
      if (safePeriod === "custom") {
        body.periodStart = customStart;
        body.periodEnd = customEnd;
      }
      setGenerationStage("preparing_executive_brief");
      const result = await apiJson<{
        snapshot: OrganisationIntelligenceSnapshotView;
        stage: GenerationStage;
      }>("/api/organisations/intelligence/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setGenerationStage("completing_checks");
      setSnapshot(result.snapshot);
      await load(result.snapshot.id);
    } catch (err) {
      setError(
        getSafeErrorMessage(
          err,
          "Unable to generate organisation intelligence."
        )
      );
    } finally {
      setGenerating(false);
      setGenerationStage(null);
    }
  };

  const overviewMetrics = useMemo(() => {
    if (!snapshot) return null;
    const find = (key: string) =>
      snapshot.metrics.find(metric => metric.metricKey === key);
    return {
      relationships: find("active_relationships"),
      practitioners: find("active_practitioners"),
      conversations: find("development_conversations"),
      evidence: find("evidence_items"),
      momentum: find("development_momentum"),
    };
  }, [snapshot]);

  const periodLabel =
    PERIOD_OPTIONS.find(option => option.value === period)?.label ||
    "Last 90 days";

  const statusLabel = generating
    ? GENERATION_STAGE_LABELS[generationStage || "gathering_evidence"]
    : snapshot?.emptyState
      ? "Insufficient evidence"
      : snapshot
        ? "Ready"
        : payload?.evidenceIndicators?.readyToGenerate
          ? "Ready to generate"
          : "Not yet generated";

  const evidenceIndicators = payload?.evidenceIndicators;
  const relationshipCountDisplay =
    snapshot?.sourceRelationshipCount ??
    evidenceIndicators?.contributingRelationships;
  const conversationCountDisplay =
    snapshot?.sourceConversationCount ?? evidenceIndicators?.conversations;

  const readyToGeneratePanel =
    !loading &&
    !payload?.migrationRequired &&
    !snapshot &&
    evidenceIndicators?.readyToGenerate;

  const showInsufficientJourney =
    !loading &&
    !payload?.migrationRequired &&
    ((snapshot && snapshot.emptyState) ||
      (!snapshot &&
        !readyToGeneratePanel &&
        (!evidenceIndicators || !evidenceIndicators.readyToGenerate)));

  const showPreGenerationJourney =
    !loading &&
    !payload?.migrationRequired &&
    !snapshot &&
    !readyToGeneratePanel;

  const reportableThemes = useMemo(() => {
    if (!snapshot || snapshot.emptyState) return [];
    return snapshot.themes.filter(theme => !theme.suppressed);
  }, [snapshot]);

  const openEvidenceFor = (insightKey: string, label: string) => {
    const trace =
      snapshot?.evidenceTraces.find(item => item.insightKey === insightKey) ??
      null;
    if (trace) {
      setSelectedTrace(trace);
      return;
    }
    if (!snapshot) return;
    setSelectedTrace({
      insightKey,
      insightLabel: label,
      evidenceCount: snapshot.sourceEvidenceCount,
      relationshipCount: snapshot.sourceRelationshipCount,
      sourceTypes: ["aggregated_evidence"],
      dateRange: {
        start: snapshot.period.periodStart,
        end: snapshot.period.periodEnd,
      },
      capabilities: [],
      confidenceLevel: snapshot.confidenceLevel,
      confidenceBasis: confidenceDisplayLabel(snapshot.confidenceLevel),
      suppressionApplied: false,
      suppressionReason: null,
    });
  };

  return (
    <OrganisationShell
      compactHeader
      eyebrow="People Development"
      title="People Development Intelligence"
      subtitle="Patterns emerging through developmental work with people — separate from Manager Development Intelligence."
    >
      <div className="org-intelligence-layout">
        {loading ? (
          <p className="organisation-muted">Loading people development intelligence…</p>
        ) : null}
        {error ? <p className="organisation-error">{error}</p> : null}

        <p className="organisation-muted org-intelligence-lens-note">
          This lens uses anonymised signals from work with people you support.
          For privacy-safe patterns from Managers&apos; own development, open{" "}
          <Link href="/organisation/manager-development">
            Manager Development
          </Link>
          .
        </p>

        <aside className="org-intelligence-privacy-notice" role="note">
          <span className="org-intelligence-privacy-notice__icon" aria-hidden="true">
            <Lock size={16} strokeWidth={1.75} />
          </span>
          <div>
            <p className="org-intelligence-privacy-notice__title">
              Privacy protected
            </p>
            <p className="org-intelligence-privacy-notice__copy">
              People Development Intelligence shows privacy-safe collective
              patterns from authorised development evidence. It does not expose
              private conversations, individual development records or
              performance scores.
            </p>
          </div>
        </aside>

        {payload?.migrationRequired ? (
          <div className="org-intelligence-empty-panel" role="status">
            <p className="org-intelligence-empty-panel__eyebrow">
              Organisation intelligence
            </p>
            <h2>Intelligence storage is not ready yet</h2>
            <p>
              The organisation intelligence migration has not been applied.
              Review and apply it before generating snapshots.
            </p>
          </div>
        ) : null}

        <section
          className="org-intelligence-controls"
          aria-label="Reporting controls"
        >
          <div className="org-intelligence-controls__meta">
            <label className="org-intelligence-controls__field">
              <span className="org-intelligence-controls__label">
                Reporting period
              </span>
              <select
                value={asPeriodPresetValue(period)}
                onChange={event => {
                  setPeriod(asPeriodPresetValue(event.target.value));
                }}
                disabled={generating}
                aria-label="Reporting period"
              >
                {PERIOD_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {period === "custom" ? (
              <>
                <label className="org-intelligence-controls__field">
                  <span className="org-intelligence-controls__label">From</span>
                  <input
                    type="date"
                    value={customStart}
                    onChange={event => setCustomStart(event.target.value)}
                    aria-label="Custom period start"
                  />
                </label>
                <label className="org-intelligence-controls__field">
                  <span className="org-intelligence-controls__label">To</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={event => setCustomEnd(event.target.value)}
                    aria-label="Custom period end"
                  />
                </label>
              </>
            ) : null}

            <div className="org-intelligence-controls__stat">
              <span className="org-intelligence-controls__label">Status</span>
              <span className="org-intelligence-controls__value">{statusLabel}</span>
            </div>

            <div className="org-intelligence-controls__stat">
              <span className="org-intelligence-controls__label">
                Privacy threshold
                <PrivacyThresholdHint />
              </span>
              <span className="org-intelligence-controls__value">
                {ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD} relationships
              </span>
            </div>
          </div>

          <div className="org-intelligence-controls__actions">
            <button
              type="button"
              className="btn"
              onClick={() => void generateIntelligence()}
              disabled={generating || payload?.migrationRequired}
              aria-label={
                snapshot ? "Refresh Intelligence" : "Generate Executive Brief"
              }
            >
              {generating
                ? "Generating…"
                : snapshot
                  ? "Refresh Intelligence"
                  : "Generate Executive Brief"}
            </button>
            {snapshot && !snapshot.emptyState ? (
              <a
                className="btn secondary"
                href={`/api/organisations/intelligence/${snapshot.id}/export`}
                target="_blank"
                rel="noreferrer"
              >
                Export
              </a>
            ) : (
              <Link href="/organisation" className="btn secondary">
                Review development activity
              </Link>
            )}
          </div>
        </section>

        {generating && generationStage ? (
          <p
            className="org-intelligence-progress"
            role="status"
            aria-live="polite"
          >
            {GENERATION_STAGE_LABELS[generationStage]}
          </p>
        ) : null}

        {readyToGeneratePanel ? (
          <section
            className="org-intelligence-empty-panel org-intelligence-ready-panel"
            aria-labelledby="org-intel-ready-heading"
            role="status"
          >
            <p className="org-intelligence-empty-panel__eyebrow">Ready to generate</p>
            <h2 id="org-intel-ready-heading">Ready to generate</h2>
            <p className="org-intelligence-empty-panel__copy">
              Pridmora has enough anonymised evidence to create an
              organisation-level Executive Brief.
            </p>

            <div className="org-intelligence-evidence-indicators">
              <div>
                <p className="org-intelligence-evidence-indicators__label">
                  Relationships contributing
                </p>
                <p className="org-intelligence-evidence-indicators__value">
                  {relationshipCountDisplay ?? "—"}
                </p>
              </div>
              <div>
                <p className="org-intelligence-evidence-indicators__label">
                  Conversations contributing
                </p>
                <p className="org-intelligence-evidence-indicators__value">
                  {conversationCountDisplay ?? "—"}
                </p>
              </div>
              <div>
                <p className="org-intelligence-evidence-indicators__label">
                  Minimum privacy threshold
                  <PrivacyThresholdHint />
                </p>
                <p className="org-intelligence-evidence-indicators__value">
                  {ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD} relationships
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {showInsufficientJourney ? (
          <>
            <section
              className="org-intelligence-empty-panel"
              aria-labelledby="org-intel-empty-heading"
              role="status"
            >
              <p className="org-intelligence-empty-panel__eyebrow">
                Building organisation intelligence
              </p>
              <h2 id="org-intel-empty-heading">
                {snapshot?.emptyState
                  ? "More evidence is needed to report safely."
                  : "Your organisation is beginning to build a clearer picture."}
              </h2>
              <p className="org-intelligence-empty-panel__copy">
                {snapshot?.emptyState
                  ? snapshot.insufficientEvidenceMessage ||
                    "Organisation Intelligence becomes available when enough anonymised development evidence has been recorded to report safely. Absence of themes does not prove that no development need exists."
                  : "As authorised development evidence grows, Pridmora will identify recurring privacy-safe development themes and prevalence changes while protecting individual confidentiality. Prevalence is not a performance measure, and missing themes do not prove needs are absent."}
              </p>

              <div className="org-intelligence-evidence-indicators">
                <div>
                  <p className="org-intelligence-evidence-indicators__label">
                    Relationships contributing
                  </p>
                  <p className="org-intelligence-evidence-indicators__value">
                    {relationshipCountDisplay ?? "Not yet generated"}
                  </p>
                </div>
                <div>
                  <p className="org-intelligence-evidence-indicators__label">
                    Conversations contributing
                  </p>
                  <p className="org-intelligence-evidence-indicators__value">
                    {conversationCountDisplay ?? "Not yet generated"}
                  </p>
                </div>
                <div>
                  <p className="org-intelligence-evidence-indicators__label">
                    Minimum privacy threshold
                    <PrivacyThresholdHint />
                  </p>
                  <p className="org-intelligence-evidence-indicators__value">
                    {snapshot?.privacyThreshold ??
                      ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD}{" "}
                    relationships
                  </p>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {showPreGenerationJourney || readyToGeneratePanel ? (
          <section
            className="org-intelligence-value"
            aria-labelledby="org-intel-value-heading"
          >
            <h2 id="org-intel-value-heading" className="org-intelligence-sr-only">
              How organisation intelligence develops
            </h2>
            <ol className="org-intelligence-value__steps">
              {VALUE_STEPS.map((step, index) => (
                <li key={step.title}>
                  <span className="org-intelligence-value__index" aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {snapshot && !snapshot.emptyState ? (
          <>
            <header className="org-intelligence-summary-meta">
              <p>
                <strong>{snapshot.organisationName}</strong>
              </p>
              <p>
                {snapshot.period.label} · Last generated{" "}
                {new Date(snapshot.generatedAt).toLocaleString("en-GB")}
              </p>
            </header>

            <section
              className="org-intelligence-section"
              aria-labelledby="org-intel-executive-insight"
            >
              <div className="org-intelligence-section__header">
                <h2 id="org-intel-executive-insight">Executive insight</h2>
                <button
                  type="button"
                  className="organisation-text-link"
                  onClick={() =>
                    openEvidenceFor("executive_brief", "Executive insight")
                  }
                >
                  View supporting evidence
                </button>
              </div>

              {reportableThemes.length > 0 ? (
                <div className="org-intelligence-brief">
                  <article className="org-intelligence-brief__section">
                    <p className="organisation-meta">What the evidence indicates</p>
                    <h3>{reportableThemes[0].themeLabel}</h3>
                    <p>
                      {reportableThemes[0].summary ||
                        "A collective people development pattern has met the reporting threshold for this period."}
                    </p>
                  </article>

                  <article className="org-intelligence-brief__section">
                    <h3>What this means — and does not mean</h3>
                    <p>
                      This is a privacy-safe collective development signal from
                      authorised evidence. It can help identify where
                      organisational support may be useful. It is not an
                      individual assessment, performance score or conclusion
                      about every person in the organisation.
                    </p>
                  </article>

                  <article className="org-intelligence-brief__section">
                    <h3>Recommended organisational response</h3>
                    <p>
                      {snapshot.recommendations[0]?.recommendation ||
                        snapshot.attentionAreas[0]?.recommendedReview ||
                        "Keep the pattern under proportionate review and use it to inform development support rather than individual judgement."}
                    </p>
                  </article>
                </div>
              ) : (
                <div className="org-intelligence-brief">
                  <article className="org-intelligence-brief__section">
                    <p className="organisation-meta">What the evidence indicates</p>
                    <h3>
                      No reportable people development theme has emerged in this
                      period.
                    </h3>
                    <p>
                      The available authorised evidence does not currently
                      support a collective theme above the reporting threshold.
                    </p>
                  </article>

                  <article className="org-intelligence-brief__section">
                    <h3>What this means — and does not mean</h3>
                    <p>
                      There is not enough consistent collective evidence to
                      justify an organisational theme. This does not prove that
                      development needs are absent and it should not be used to
                      infer anything about an individual.
                    </p>
                  </article>

                  <article className="org-intelligence-brief__section">
                    <h3>Recommended organisational response</h3>
                    <p>
                      Continue normal developmental conversations and authorised
                      evidence capture. No additional organisational intervention
                      is indicated solely because no reportable theme is present.
                    </p>
                  </article>
                </div>
              )}
            </section>

            {reportableThemes.length > 0 ? (
              <section
                className="org-intelligence-section"
                aria-labelledby="org-intel-themes"
              >
                <h2 id="org-intel-themes">Reportable themes</h2>
                <p className="organisation-muted">
                  Collective themes are shown only when the privacy and evidence
                  thresholds are met. {COVERAGE_CAVEAT_NOTE}{" "}
                  {PREVALENCE_DIRECTION_NOTE}
                </p>

                <ol className="org-intelligence-theme-list">
                  {reportableThemes.map(theme => (
                    <li key={theme.themeKey}>
                      <button
                        type="button"
                        className="org-intelligence-theme-item"
                        onClick={() => setSelectedTheme(theme)}
                      >
                        <span className="org-intelligence-theme-item__title">
                          {theme.themeLabel}
                        </span>
                        <span className="org-intelligence-theme-item__meta">
                          {theme.relationshipCount} relationships ·{" "}
                          {theme.evidenceCount} evidence ·{" "}
                          <span className="org-intelligence-sr-only">
                            {directionScreenReaderLabel(
                              theme.direction ?? "insufficient_evidence"
                            )}
                          </span>
                          {directionLabel(
                            theme.direction ?? "insufficient_evidence"
                          )}{" "}
                          · Theme confidence:{" "}
                          {confidenceLevelWord(theme.confidenceLevel)}
                        </span>
                        {theme.summary ? (
                          <span className="org-intelligence-theme-item__summary">
                            {theme.summary}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            <section
              className="org-intelligence-section"
              aria-labelledby="org-intel-evidence-context"
            >
              <h2 id="org-intel-evidence-context">Evidence context</h2>
              <p className="organisation-muted">
                These figures describe the evidence base available to this
                snapshot. They are context for interpreting the intelligence,
                not participation targets or performance measures.
              </p>

              <div className="organisation-metric-groups">
                <MetricGroup title="Evidence base">
                  <MetricItem
                    value={overviewMetrics?.relationships?.metricValue ?? 0}
                    label="Active relationships"
                  />
                  <MetricItem
                    value={snapshot.sourceRelationshipCount}
                    label="Relationships contributing"
                  />
                  <MetricItem
                    value={snapshot.sourceConversationCount}
                    label="Conversations contributing"
                  />
                  <MetricItem
                    value={snapshot.sourceEvidenceCount}
                    label="Evidence items"
                  />
                </MetricGroup>
              </div>

              <p className="organisation-meta">
                The Active relationships figure shows the broader relationship
                activity in scope. Relationships contributing is the privacy-safe sample that
                actually informed this snapshot. Evidence base confidence:{" "}
                {confidenceLevelWord(snapshot.confidenceLevel)}. Confidence
                describes the overall anonymised evidence base and does not mean
                that a reportable theme must be present.
              </p>

              {snapshot.restrictedEvidenceExcluded ? (
                <p className="organisation-muted">
                  Restricted evidence was excluded from this view.
                </p>
              ) : null}
            </section>

            <section
              className="org-intelligence-section"
              aria-labelledby="org-intel-activity"
            >
              <h2 id="org-intel-activity">Development activity</h2>
              <p className="organisation-muted">
                Activity helps explain how much developmental work is being
                recorded in Pridmora. It is not an intelligence finding,
                participation target or measure of organisational performance.
              </p>

              <div className="organisation-metric-groups">
                <MetricGroup title="Activity in this view">
                  <MetricItem
                    value={overviewMetrics?.practitioners?.metricValue ?? 0}
                    label="Active Managers"
                  />
                  <MetricItem
                    value={overviewMetrics?.conversations?.metricValue ?? 0}
                    label="Recorded conversations"
                  />
                </MetricGroup>
              </div>
            </section>

            {snapshot.capabilities.some(capability => !capability.suppressed) ? (
              <section
                className="org-intelligence-section"
                aria-labelledby="org-intel-capabilities"
              >
                <h2 id="org-intel-capabilities">Capability trends</h2>
                <p className="organisation-muted">
                  Six Foundations view derived from reportable people development
                  signals. Only capabilities with sufficient privacy-safe evidence
                  are shown.
                </p>

                <div
                  className="org-intelligence-table-wrap"
                  role="region"
                  aria-label="Capability trends"
                >
                  <table className="organisation-table org-intelligence-table">
                    <thead>
                      <tr>
                        <th scope="col">Capability</th>
                        <th scope="col">Direction</th>
                        <th scope="col">Evidence</th>
                        <th scope="col">Relationships</th>
                        <th scope="col">Capability confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.capabilities
                        .filter(capability => !capability.suppressed)
                        .map(capability => (
                          <tr key={capability.key}>
                            <th scope="row">{capability.label}</th>
                            <td>
                              <span className="org-intelligence-sr-only">
                                {directionScreenReaderLabel(capability.direction)}
                              </span>
                              {capability.changeLabel}
                            </td>
                            <td>{capability.evidenceCount}</td>
                            <td>{capability.relationshipCount}</td>
                            <td>
                              {confidenceLevelWord(capability.confidenceLevel)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            <details className="org-intelligence-section">
              <summary>How to read this intelligence</summary>
              <div className="organisation-muted">
                <p>
                  People Development Intelligence uses anonymised, aggregated
                  authorised development evidence. Collective themes are shown
                  only when the privacy threshold is met.
                </p>
                <p>
                  {COVERAGE_CAVEAT_NOTE} {PREVALENCE_DIRECTION_NOTE}
                </p>
                <p>
                  Absence of a reportable theme does not prove that development
                  needs are absent. Confidence describes the strength of the
                  anonymised evidence base and should not be interpreted as an
                  individual judgement or performance measure.
                </p>
                {snapshot.restrictedEvidenceExcluded ? (
                  <p>
                    Restricted evidence was excluded from this view.
                  </p>
                ) : null}
              </div>
            </details>

            {snapshot.coachingImpact.length > 0 ? (
              <section
                className="org-intelligence-section"
                aria-labelledby="org-intel-impact"
              >
                <h2 id="org-intel-impact">Development indicators</h2>
                <p className="organisation-muted">
                  Outcomes associated with recorded people development activity
                  in the selected period. These observations do not claim
                  causation.
                </p>

                <ul className="org-intelligence-simple-list">
                  {snapshot.coachingImpact.map(item => (
                    <li key={item.key}>
                      <strong>{item.label}.</strong> {item.statement}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}

        {snapshot &&
        payload?.history?.some(
          item =>
            item.id !== snapshot.id &&
            item.status === "ready" &&
            item.periodKey === snapshot.period.preset
        ) ? (
          <section
            className="org-intelligence-section"
            aria-labelledby="org-intel-history"
          >
            <h2 id="org-intel-history">Previous comparable reports</h2>
            <p className="organisation-muted">
              Earlier reports using the same reporting period are shown here for
              proportionate comparison.
            </p>
            <ul className="org-intelligence-history">
              {payload.history
                .filter(
                  item =>
                    item.id !== snapshot.id &&
                    item.status === "ready" &&
                    item.periodKey === snapshot.period.preset
                )
                .map(item => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="organisation-text-link"
                      onClick={() => void load(item.id)}
                    >
                      {item.periodStart} to {item.periodEnd} ·{" "}
                      {new Date(item.generatedAt).toLocaleString("en-GB")}
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ) : null}

        <p className="org-intelligence-sr-only">
          Selected reporting period: {periodLabel}
        </p>
      </div>

      <OrganisationIntelligenceThemeDrawer
        open={Boolean(selectedTheme)}
        themeLabel={selectedTheme?.themeLabel || ""}
        summary={selectedTheme?.summary ?? null}
        direction={selectedTheme?.direction ?? null}
        evidenceCount={selectedTheme?.evidenceCount ?? 0}
        relationshipCount={selectedTheme?.relationshipCount ?? 0}
        confidence={selectedTheme?.confidenceLevel || "low"}
        relatedCapabilities={selectedTheme?.relatedCapabilities || []}
        evidenceTypes={selectedTheme?.evidenceTypes || []}
        onClose={() => setSelectedTheme(null)}
        onViewEvidence={() => {
          if (!selectedTheme) return;
          openEvidenceFor(
            `theme:${selectedTheme.themeKey}`,
            selectedTheme.themeLabel
          );
          setSelectedTheme(null);
        }}
      />

      <OrganisationIntelligenceEvidenceDrawer
        open={Boolean(selectedTrace)}
        trace={selectedTrace}
        onClose={() => setSelectedTrace(null)}
      />
    </OrganisationShell>
  );
}
