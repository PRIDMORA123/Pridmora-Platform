import { PRIVACY_NOTE } from "@/lib/organisation-intelligence/constants";
import { confidenceDisplayLabel } from "@/lib/organisation-intelligence/confidence";
import { directionLabel } from "@/lib/organisation-intelligence/capabilities";
import type { OrganisationIntelligenceSnapshotView } from "@/lib/organisation-intelligence/types";

/**
 * Printable HTML executive export.
 * Never includes names, emails, phones, private notes, raw session notes,
 * relationship references or suppressed small-subgroup data.
 */
export function buildOrganisationIntelligenceExportHtml(
  view: OrganisationIntelligenceSnapshotView
): string {
  const themes = view.themes.filter(theme => !theme.suppressed);
  const metrics = view.metrics.filter(metric => !metric.suppressed);
  const priorities = view.recommendations.slice(0, 3);

  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8" />
  <title>Organisation Intelligence — ${escape(view.organisationName)}</title>
  <style>
    body { font-family: Poppins, Helvetica, Arial, sans-serif; color: #13233a; background: #f7f4ef; margin: 0; padding: 40px; line-height: 1.5; }
    h1, h2 { color: #13233a; }
    h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.1rem; margin-top: 2rem; }
    .eyebrow { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.75rem; color: #4f9d98; font-weight: 600; }
    .meta { color: #5b6675; font-size: 0.95rem; }
    .brief p { max-width: 42rem; }
    ul { padding-left: 1.2rem; }
    li { margin-bottom: 0.5rem; }
    .note { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid #d9d2c7; font-size: 0.9rem; color: #5b6675; }
  </style>
</head>
<body>
  <p class="eyebrow">Organisation Intelligence</p>
  <h1>Development intelligence</h1>
  <p class="meta">${escape(view.organisationName)} · ${escape(view.period.label)} · Generated ${escape(
    new Date(view.generatedAt).toLocaleString("en-GB")
  )}</p>
  <p class="meta">Source relationships: ${view.sourceRelationshipCount} · ${escape(
    confidenceDisplayLabel(view.confidenceLevel)
  )}</p>

  <h2>Executive brief</h2>
  <div class="brief">
    ${(view.executiveBrief || "No executive brief available.")
      .split(/\n\s*\n/)
      .map(paragraph => `<p>${escape(paragraph.trim())}</p>`)
      .join("")}
  </div>

  <h2>Key metrics</h2>
  <ul>
    ${metrics
      .map(
        metric =>
          `<li><strong>${escape(metric.metricLabel)}:</strong> ${escape(
            metric.displayValue
          )}${
            metric.direction
              ? ` (${escape(directionLabel(metric.direction))})`
              : ""
          }</li>`
      )
      .join("")}
  </ul>

  <h2>Emerging themes</h2>
  ${
    themes.length === 0
      ? "<p>Not enough evidence to report safely.</p>"
      : `<ul>${themes
          .map(
            theme =>
              `<li><strong>${escape(theme.themeLabel)}</strong> — ${
                theme.relationshipCount
              } relationships, ${theme.evidenceCount} evidence items, ${escape(
                directionLabel(theme.direction ?? "insufficient_evidence")
              )}, ${escape(confidenceDisplayLabel(theme.confidenceLevel))}.</li>`
          )
          .join("")}</ul>`
  }

  <h2>Priority areas</h2>
  ${
    priorities.length === 0
      ? "<p>No priority areas identified for this period.</p>"
      : `<ul>${priorities
          .map(
            row =>
              `<li><strong>${escape(row.title)}</strong><br />${escape(
                row.rationale
              )}<br />Suggested response: ${escape(row.recommendation)}</li>`
          )
          .join("")}</ul>`
  }

  <div class="note">
    <p><strong>Methodology and privacy</strong></p>
    <p>${escape(PRIVACY_NOTE)}</p>
    <p>Themes and subgroups are shown only when at least ${
      view.privacyThreshold
    } relationships contribute evidence. Suppressed counts are not revealed.</p>
  </div>
</body>
</html>`;
}
