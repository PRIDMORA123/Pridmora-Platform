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
  MOMENTUM_METHODOLOGY,
  MOMENTUM_WEIGHTS,
  ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
  PREVALENCE_DIRECTION_NOTE,
  COVERAGE_CAVEAT_NOTE,
  SIX_FOUNDATIONS,
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

const EXECUTIVE_BRIEF_SECTION_TITLES = [
  "What is changing",
  "What the evidence shows about theme prevalence",
  "What needs attention",
  "Themes to monitor",
  "Where evidence is strong",
  "Evidence posture",
  "Where evidence is limited",
  "Where evidence remains limited",
  "Recommended questions / actions",
  "Evidence base",
] as const;

/** Snapshot header / theme labels: "Moderate" not "Moderate confidence". */
function confidenceLevelWord(level: ConfidenceLevel): string {
  if (level === "high") return "High";
  if (level === "moderate") return "Moderate";
  return "Low";
}

/**
 * Themes-to-monitor UI only. Capability/foundation roll-ups stay in Capability trends.
 * Do not change snapshot attentionAreas — filter at presentation time only.
 */
function isThemeMonitorAttentionArea(area: {
  key: string;
  label: string;
  kind?: string | null;
}): boolean {
  if (area.kind === "capability") return false;
  if (area.kind === "theme") return true;
  // Legacy rows without kind: drop exact Six Foundations labels (e.g. "Psychological Safety").
  const foundation = SIX_FOUNDATIONS.find(row => row.key === area.key);
  if (foundation && foundation.label === area.label) return false;
  return true;
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

const MOMENTUM_COMPONENT_LABELS: Record<keyof typeof MOMENTUM_WEIGHTS, string> = {
  conversations: "Completed conversations",
  actions: "Completed actions",
  reflections: "Completed reflections",
  developmentUpdates: "Development updates",
  evidence: "Evidence progression",
};

function formatMomentumWeight(key: keyof typeof MOMENTUM_WEIGHTS): string {
  return `${Math.round(MOMENTUM_WEIGHTS[key] * 100)}%`;
}

function momentumDriverSummary(input: {
  components: Record<string, number>;
  previousComponents: Record<string, number> | null;
}): { positive: string | null; limiting: string | null } {
  if (!input.previousComponents) {
    return { positive: null, limiting: null };
  }

  let bestKey: string | null = null;
  let bestDelta = Number.NEGATIVE_INFINITY;
  let worstKey: string | null = null;
  let worstDelta = Number.POSITIVE_INFINITY;

  for (const key of Object.keys(MOMENTUM_COMPONENT_LABELS)) {
    const current = Number(input.components[key] ?? 0);
    const previous = Number(input.previousComponents[key] ?? 0);
    const delta = current - previous;
    if (delta > bestDelta) {
      bestDelta = delta;
      bestKey = key;
    }
    if (delta < worstDelta) {
      worstDelta = delta;
      worstKey = key;
    }
  }

  const positive =
    bestKey && bestDelta > 0
      ? `${
          MOMENTUM_COMPONENT_LABELS[bestKey as keyof typeof MOMENTUM_WEIGHTS]
        } (+${Math.round(bestDelta)} points)`
      : null;
  const limiting =
    worstKey && worstDelta < 0
      ? `${
          MOMENTUM_COMPONENT_LABELS[worstKey as keyof typeof MOMENTUM_WEIGHTS]
        } (${Math.round(worstDelta)} points)`
      : null;

  return { positive, limiting };
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
  const [showMethodology, setShowMethodology] = useState(false);
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

  const themeAttentionAreas = useMemo(() => {
    if (!snapshot || snapshot.emptyState) return [];
    // Theme monitoring is the primary buyer narrative; foundation roll-ups stay
    // in Capability trends so Leads are not shown near-duplicate monitor rows.
    return snapshot.attentionAreas.filter(isThemeMonitorAttentionArea);
  }, [snapshot]);

  const momentumDrivers = useMemo(() => {
    const momentum = overviewMetrics?.momentum;
    if (!momentum?.metadata) return { positive: null, limiting: null };
    const components = momentum.metadata.components;
    const previousComponents = momentum.metadata.previousComponents;
    if (!components || typeof components !== "object") {
      return { positive: null, limiting: null };
    }
    return momentumDriverSummary({
      components: components as Record<string, number>,
      previousComponents:
        previousComponents && typeof previousComponents === "object"
          ? (previousComponents as Record<string, number>)
          : null,
    });
  }, [overviewMetrics?.momentum]);

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
              People Development Intelligence uses anonymised, aggregated
              authorised development signals from relationship work. Leads see
              collective themes once the privacy threshold is met — not private
              conversations, individual development records or performance
              scores. {COVERAGE_CAVEAT_NOTE} {PREVALENCE_DIRECTION_NOTE} Absence
              of a theme does not prove that no development need exists.
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
                Review coaching activity
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
                    "Organisation Intelligence becomes available when enough anonymised coaching evidence has been recorded to report safely. Absence of themes does not prove that no development need exists."
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
              <p>
                Source relationships: {snapshot.sourceRelationshipCount} ·{" "}
                Evidence base confidence:{" "}
                {confidenceLevelWord(snapshot.confidenceLevel)}
              </p>
              <p className="organisation-muted org-intelligence-summary-meta__note">
                Evidence base confidence reflects the overall anonymised sample.
                Theme confidence is shown on each theme and can differ when a
                theme has a narrower evidence base.
              </p>
              {snapshot.restrictedEvidenceExcluded ? (
                <p className="organisation-muted">
                  Restricted evidence was excluded from this view.
                </p>
              ) : null}
            </header>

            <section
              className="org-intelligence-section"
              aria-labelledby="org-intel-brief"
            >
              <div className="org-intelligence-section__header">
                <h2 id="org-intel-brief">Executive brief</h2>
                <button
                  type="button"
                  className="organisation-text-link"
                  onClick={() =>
                    openEvidenceFor("executive_brief", "Executive brief")
                  }
                >
                  View supporting evidence
                </button>
              </div>
              <div className="org-intelligence-brief org-intelligence-brief--sections">
                {(snapshot.executiveBrief || "")
                  .split(/\n\s*\n/)
                  .filter(Boolean)
                  .reduce<Array<{ title?: string; body: string }>>(
                    (sections, block) => {
                      const lines = block.split("\n").filter(Boolean);
                      if (
                        lines.length >= 2 &&
                        EXECUTIVE_BRIEF_SECTION_TITLES.includes(
                          lines[0] as (typeof EXECUTIVE_BRIEF_SECTION_TITLES)[number]
                        )
                      ) {
                        sections.push({
                          title: lines[0],
                          body: lines.slice(1).join(" "),
                        });
                      } else {
                        sections.push({ body: block });
                      }
                      return sections;
                    },
                    []
                  )
                  .map((section, index) => (
                    <article key={`brief-${index}`} className="org-intelligence-brief__section">
                      {section.title ? <h3>{section.title}</h3> : null}
                      <p>{section.body}</p>
                    </article>
                  ))}
              </div>
            </section>

            <section
              className="org-intelligence-section"
              aria-labelledby="org-intel-themes"
            >
              <h2 id="org-intel-themes">Emerging themes</h2>
              <p className="organisation-muted">
                Primary theme narrative for this period. Foundation roll-ups
                appear under Capability trends. {COVERAGE_CAVEAT_NOTE}{" "}
                {PREVALENCE_DIRECTION_NOTE}
              </p>
              {snapshot.themes.length === 0 ? (
                <p className="organisation-muted">
                  Not enough evidence to report safely. Absence of a theme does
                  not prove that no development need exists.
                </p>
              ) : (
                <ol className="org-intelligence-theme-list">
                  {snapshot.themes.map(theme => (
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
              )}
            </section>

            <section
              className="org-intelligence-section"
              aria-labelledby="org-intel-attention"
            >
              <h2 id="org-intel-attention">Themes to monitor</h2>
              <p className="organisation-muted">
                Theme-level monitoring priorities for organisational development
                support — not individual surveillance. Related Six Foundations
                signals are listed once under Capability trends, not repeated
                here. {PREVALENCE_DIRECTION_NOTE}
              </p>
              {themeAttentionAreas.length === 0 ? (
                <p className="organisation-muted">
                  No attention areas identified from the available evidence.
                  That does not prove development needs are absent.
                </p>
              ) : (
                <ul className="org-intelligence-priority-list">
                  {themeAttentionAreas.map(area => (
                    <li key={`${area.kind}-${area.key}`}>
                      <h3>{area.label}</h3>
                      <p>
                        <span className="org-intelligence-sr-only">
                          {directionScreenReaderLabel(area.direction)}
                        </span>
                        {directionLabel(area.direction)} · Theme confidence:{" "}
                        {confidenceLevelWord(area.confidenceLevel)}
                      </p>
                      <p>{area.reason}</p>
                      <p className="organisation-meta">
                        {area.recommendedReview}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              className="org-intelligence-section"
              aria-labelledby="org-intel-priorities"
            >
              <h2 id="org-intel-priorities">Priority areas</h2>
              {snapshot.recommendations.length === 0 ? (
                <p className="organisation-muted">
                  No priority areas identified for this period.
                </p>
              ) : (
                <ul className="org-intelligence-priority-list">
                  {snapshot.recommendations.map(row => (
                    <li key={`${row.priority}-${row.title}`}>
                      <h3>{row.title}</h3>
                      <p>{row.rationale}</p>
                      <p>
                        <strong>Suggested response:</strong> {row.recommendation}
                      </p>
                      <p className="organisation-meta">
                        Theme confidence:{" "}
                        {confidenceLevelWord(row.confidenceLevel)} ·{" "}
                        {row.evidenceCount} evidence · {row.relationshipCount}{" "}
                        relationships
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              className="org-intelligence-section"
              aria-labelledby="org-intel-overview"
            >
              <h2 id="org-intel-overview">Organisation overview</h2>
              <div className="organisation-metric-groups">
                <MetricGroup title="Key figures">
                  <MetricItem
                    value={overviewMetrics?.relationships?.metricValue ?? 0}
                    label="Active relationships"
                  />
                  <MetricItem
                    value={overviewMetrics?.practitioners?.metricValue ?? 0}
                    label="Active practitioners"
                  />
                  <MetricItem
                    value={overviewMetrics?.conversations?.metricValue ?? 0}
                    label="Conversations"
                  />
                  <MetricItem
                    value={overviewMetrics?.evidence?.metricValue ?? 0}
                    label="Evidence items"
                  />
                </MetricGroup>
              </div>
            </section>

            <section
              className="org-intelligence-section"
              aria-labelledby="org-intel-momentum"
            >
              <div className="org-intelligence-section__header">
                <h2 id="org-intel-momentum">Development Activity Momentum</h2>
                <button
                  type="button"
                  className="organisation-text-link"
                  onClick={() => setShowMethodology(open => !open)}
                  aria-expanded={showMethodology}
                >
                  How this is calculated
                </button>
              </div>
              <p className="organisation-muted">
                A directional measure of sustained coaching activity, action and
                recorded development.
              </p>
              {overviewMetrics?.momentum ? (
                <div className="org-intelligence-momentum">
                  <div className="org-intelligence-momentum__row">
                    <p className="org-intelligence-momentum__value">
                      {overviewMetrics.momentum.displayValue}
                    </p>
                    <p>
                      <span className="org-intelligence-sr-only">
                        {directionScreenReaderLabel(
                          overviewMetrics.momentum.direction ??
                            "insufficient_evidence"
                        )}
                      </span>
                      {directionLabel(
                        overviewMetrics.momentum.direction ??
                          "insufficient_evidence"
                      )}
                    </p>
                  </div>
                  {overviewMetrics.momentum.comparisonAvailable &&
                  overviewMetrics.momentum.previousValue != null ? (
                    <p className="organisation-meta">
                      Previous period: {overviewMetrics.momentum.previousValue}
                      {typeof overviewMetrics.momentum.metricValue === "number"
                        ? ` · Change: ${
                            overviewMetrics.momentum.metricValue -
                            overviewMetrics.momentum.previousValue
                          } points`
                        : null}
                    </p>
                  ) : (
                    <p className="organisation-meta">
                      {overviewMetrics.momentum.comparisonAvailable
                        ? snapshot.period.comparisonLabel
                        : "No earlier comparison is available."}
                    </p>
                  )}
                  <div
                    className="org-intelligence-momentum__bar"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={
                      typeof overviewMetrics.momentum.metricValue === "number"
                        ? overviewMetrics.momentum.metricValue
                        : 0
                    }
                    aria-label="Development Momentum"
                  >
                    <span
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(
                            100,
                            Number(overviewMetrics.momentum.metricValue ?? 0)
                          )
                        )}%`,
                      }}
                    />
                  </div>
                  {overviewMetrics.momentum.metadata?.components &&
                  typeof overviewMetrics.momentum.metadata.components ===
                    "object" ? (
                    <ul className="org-intelligence-momentum__components">
                      {(
                        Object.keys(MOMENTUM_COMPONENT_LABELS) as Array<
                          keyof typeof MOMENTUM_WEIGHTS
                        >
                      ).map(key => {
                        const components = overviewMetrics.momentum!
                          .metadata.components as Record<string, number>;
                        const previousComponents =
                          overviewMetrics.momentum!.metadata
                            .previousComponents;
                        const currentScore = Number(components[key] ?? 0);
                        const previousScore =
                          previousComponents &&
                          typeof previousComponents === "object"
                            ? Number(
                                (previousComponents as Record<string, number>)[
                                  key
                                ] ?? 0
                              )
                            : null;
                        const delta =
                          previousScore != null
                            ? currentScore - previousScore
                            : null;
                        return (
                          <li key={key}>
                            <strong>{MOMENTUM_COMPONENT_LABELS[key]}</strong>
                            <span>
                              {" "}
                              {Math.round(currentScore)} points · Weight{" "}
                              {formatMomentumWeight(key)}
                              {delta != null
                                ? ` · Change ${delta >= 0 ? "+" : ""}${Math.round(delta)}`
                                : null}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  {momentumDrivers.positive || momentumDrivers.limiting ? (
                    <div className="org-intelligence-momentum__drivers">
                      {momentumDrivers.positive ? (
                        <p>
                          <strong>Biggest positive driver:</strong>{" "}
                          {momentumDrivers.positive}
                        </p>
                      ) : null}
                      {momentumDrivers.limiting ? (
                        <p>
                          <strong>Area limiting progress:</strong>{" "}
                          {momentumDrivers.limiting}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="organisation-meta">
                    Evidence base confidence:{" "}
                    {confidenceLevelWord(
                      overviewMetrics.momentum.confidenceLevel
                    )}
                  </p>
                </div>
              ) : null}
              {showMethodology ? (
                <div className="org-intelligence-methodology" role="note">
                  <p>{MOMENTUM_METHODOLOGY}</p>
                  <p>
                    Component weights: completed conversations{" "}
                    {formatMomentumWeight("conversations")}, completed actions{" "}
                    {formatMomentumWeight("actions")}, completed reflections{" "}
                    {formatMomentumWeight("reflections")}, development updates{" "}
                    {formatMomentumWeight("developmentUpdates")}, evidence
                    progression {formatMomentumWeight("evidence")}.
                  </p>
                </div>
              ) : null}
            </section>

            <section
              className="org-intelligence-section"
              aria-labelledby="org-intel-capabilities"
            >
              <h2 id="org-intel-capabilities">Capability trends</h2>
              <p className="organisation-muted">
                Six Foundations view derived from reportable themes. This is a
                foundation roll-up, not a second monitoring list.
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
                    {snapshot.capabilities.map(capability => (
                      <tr key={capability.key}>
                        <th scope="row">{capability.label}</th>
                        <td>
                          <span className="org-intelligence-sr-only">
                            {directionScreenReaderLabel(capability.direction)}
                          </span>
                          {capability.changeLabel}
                        </td>
                        <td>
                          {capability.suppressed
                            ? "—"
                            : capability.evidenceCount}
                        </td>
                        <td>
                          {capability.suppressed
                            ? "—"
                            : capability.relationshipCount}
                        </td>
                        <td>
                          {capability.suppressed
                            ? "Not enough evidence to report safely."
                            : confidenceLevelWord(capability.confidenceLevel)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section
              className="org-intelligence-section"
              aria-labelledby="org-intel-impact"
            >
              <h2 id="org-intel-impact">Development indicators</h2>
              <p className="organisation-muted">
                Outcomes associated with coaching activity in the selected period.
                These observations do not claim causation.
              </p>
              {snapshot.coachingImpact.length === 0 ? (
                <p className="organisation-muted">
                  Not enough evidence to report safely.
                </p>
              ) : (
                <ul className="org-intelligence-simple-list">
                  {snapshot.coachingImpact.map(item => (
                    <li key={item.key}>
                      <strong>{item.label}.</strong> {item.statement}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}

        {payload?.history && payload.history.length > 0 ? (
          <section
            className="org-intelligence-section"
            aria-labelledby="org-intel-history"
          >
            <h2 id="org-intel-history">Previous snapshots</h2>
            <ul className="org-intelligence-history">
              {payload.history.map(item => (
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
