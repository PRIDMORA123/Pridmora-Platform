import {
  PRIVACY_NOTE,
} from "@/lib/organisation-intelligence/constants";
import { confidenceDisplayLabel } from "@/lib/organisation-intelligence/confidence";
import { directionLabel } from "@/lib/organisation-intelligence/capabilities";
import type { OrganisationIntelligenceSnapshotView } from "@/lib/organisation-intelligence/types";

/**
 * Printable HTML People Development Intelligence export.
 *
 * Never includes names, emails, phones, private notes, raw session notes,
 * relationship references or suppressed small-subgroup data.
 */
export function buildOrganisationIntelligenceExportHtml(
  view: OrganisationIntelligenceSnapshotView
): string {
  const themes = view.themes.filter(theme => !theme.suppressed);
  const capabilities = view.capabilities.filter(
    capability => !capability.suppressed
  );

  const activeRelationships = view.metrics.find(
    metric => metric.metricKey === "active_relationships"
  );
  const activePractitioners = view.metrics.find(
    metric => metric.metricKey === "active_practitioners"
  );

  const primaryTheme = themes[0] ?? null;
  const recommendedResponse =
    view.recommendations[0]?.recommendation ??
    view.attentionAreas[0]?.recommendedReview ??
    null;

  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const noThemeResponse =
    "Continue normal developmental conversations and authorised evidence capture. No organisational intervention is indicated solely because no collective theme has met the reporting threshold.";

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8" />
  <title>People Development Intelligence — ${escape(
    view.organisationName
  )}</title>
  <style>
    body { font-family: Poppins, Helvetica, Arial, sans-serif; color: #13233a; background: #ffffff; margin: 0; padding: 40px; line-height: 1.55; }
    h1, h2, h3 { color: #13233a; }
    h1 { font-size: 1.75rem; margin: 0 0 0.25rem; }
    h2 { font-size: 1.15rem; margin-top: 2rem; }
    h3 { font-size: 1rem; margin-bottom: 0.35rem; }
    p { max-width: 46rem; }
    .eyebrow { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.75rem; color: #4f9d98; font-weight: 600; }
    .meta { color: #5b6675; font-size: 0.95rem; }
    .panel { margin-top: 1rem; padding: 1rem 1.25rem; border: 1px solid #d9dfe5; border-radius: 10px; }
    .metrics { display: flex; flex-wrap: wrap; gap: 1rem; padding: 0; list-style: none; }
    .metrics li { min-width: 10rem; }
    .metric-value { display: block; font-size: 1.35rem; font-weight: 600; }
    ul { padding-left: 1.2rem; }
    li { margin-bottom: 0.6rem; }
    .note { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid #d9d2c7; font-size: 0.9rem; color: #5b6675; }
  </style>
</head>
<body>
  <p class="eyebrow">People Development Intelligence</p>
  <h1>${escape(view.organisationName)}</h1>
  <p class="meta">${escape(view.period.label)} · Generated ${escape(
    new Date(view.generatedAt).toLocaleString("en-GB")
  )}</p>

  <h2>Executive insight</h2>

  ${
    primaryTheme
      ? `
  <div class="panel">
    <p class="meta">What the evidence indicates</p>
    <h3>${escape(primaryTheme.themeLabel)}</h3>
    <p>${escape(
      primaryTheme.summary ||
        "A collective people development pattern has met the reporting threshold for this period."
    )}</p>

    <h3>What this means — and does not mean</h3>
    <p>This is a privacy-safe collective development signal from authorised evidence. It can help identify where organisational support may be useful. It is not an individual assessment, performance score or conclusion about every person in the organisation.</p>

    <h3>Recommended organisational response</h3>
    <p>${escape(
      recommendedResponse ||
        "Keep the pattern under proportionate review and use it to inform development support rather than individual judgement."
    )}</p>
  </div>`
      : `
  <div class="panel">
    <h3>No reportable people development theme has emerged in this period.</h3>
    <p>The available authorised evidence does not currently support a collective people development theme above the reporting threshold.</p>

    <h3>What this means — and does not mean</h3>
    <p>No consistent collective pattern is reportable from the evidence available. This does not prove that development needs are absent and no individual conclusion should be drawn from the absence of a theme.</p>

    <h3>Recommended organisational response</h3>
    <p>${escape(noThemeResponse)}</p>
  </div>`
  }

  ${
    themes.length > 0
      ? `
  <h2>Reportable themes</h2>
  <ul>
    ${themes
      .map(
        theme =>
          `<li><strong>${escape(theme.themeLabel)}</strong> — ${
            theme.relationshipCount
          } relationships, ${theme.evidenceCount} evidence items, ${escape(
            directionLabel(theme.direction ?? "insufficient_evidence")
          )}, ${escape(
            confidenceDisplayLabel(theme.confidenceLevel)
          )}. ${
            theme.summary ? escape(theme.summary) : ""
          }</li>`
      )
      .join("")}
  </ul>`
      : ""
  }

  <h2>Evidence context</h2>
  <p class="meta">These figures describe the evidence base available to this snapshot. They are context for interpreting the intelligence, not participation targets or performance measures.</p>

  <ul class="metrics">
    <li>
      <span class="metric-value">${escape(
        String(activeRelationships?.metricValue ?? 0)
      )}</span>
      Active relationships
    </li>
    <li>
      <span class="metric-value">${view.sourceRelationshipCount}</span>
      Relationships contributing
    </li>
    <li>
      <span class="metric-value">${view.sourceConversationCount}</span>
      Conversations contributing
    </li>
    <li>
      <span class="metric-value">${view.sourceEvidenceCount}</span>
      Evidence items
    </li>
  </ul>

  <p class="meta">The Active relationships figure shows the broader relationship activity in scope. Relationships contributing is the privacy-safe sample that actually informed this snapshot. Evidence base confidence: ${escape(
    confidenceDisplayLabel(view.confidenceLevel)
  )}. Confidence describes the overall anonymised evidence base and does not mean that a reportable theme must be present.</p>

  ${
    view.restrictedEvidenceExcluded
      ? '<p class="meta">Restricted evidence was excluded from this view.</p>'
      : ""
  }

  <h2>Development activity</h2>
  <p class="meta">Activity helps explain how much developmental work is being recorded in Pridmora. It is not an intelligence finding, participation target or measure of organisational performance.</p>

  <ul class="metrics">
    <li>
      <span class="metric-value">${escape(
        String(activePractitioners?.metricValue ?? 0)
      )}</span>
      Active Managers
    </li>
    <li>
      <span class="metric-value">${view.sourceConversationCount}</span>
      Recorded conversations
    </li>
  </ul>

  ${
    capabilities.length > 0
      ? `
  <h2>Capability trends</h2>
  <p class="meta">Six Foundations view derived from reportable people development signals. Only capabilities with sufficient privacy-safe evidence are shown.</p>
  <ul>
    ${capabilities
      .map(
        capability =>
          `<li><strong>${escape(
            capability.label
          )}</strong> — ${escape(
            directionLabel(capability.direction ?? "insufficient_evidence")
          )}, ${escape(
            confidenceDisplayLabel(capability.confidenceLevel)
          )}.</li>`
      )
      .join("")}
  </ul>`
      : ""
  }

  ${
    view.coachingImpact.length > 0
      ? `
  <h2>Development indicators</h2>
  <p class="meta">Outcomes associated with recorded people development activity in the selected period. These observations do not claim causation.</p>
  <ul>
    ${view.coachingImpact
      .map(
        item =>
          `<li><strong>${escape(item.label)}</strong>: ${escape(
            item.statement
          )}</li>`
      )
      .join("")}
  </ul>`
      : ""
  }

  <div class="note">
    <p><strong>How to read this intelligence</strong></p>
    <p>${escape(PRIVACY_NOTE)}</p>
    <p>Collective themes are shown only when at least ${
      view.privacyThreshold
    } relationships contribute evidence. Suppressed counts are not revealed.</p>
    <p>Absence of a reportable theme does not prove that development needs are absent. Confidence describes the strength of the anonymised evidence base and should not be interpreted as an individual judgement or performance measure.</p>
  </div>
</body>
</html>`;
}
