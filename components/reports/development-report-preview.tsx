import { IdentityPathMark } from "@/components/identity/path-mark";
import { BRAND } from "@/lib/brand";
import { formatDate, formatReportPeriod } from "@/lib/reports/format";
import {
  REPORT_TYPE_LABELS,
  type DevelopmentReport,
} from "@/lib/reports/types";
import type { Client } from "@/lib/types";

function IdentityReportMark() {
  return (
    <div className="identity-report-mark" aria-label={BRAND.productName}>
      <IdentityPathMark />
      <span>{BRAND.productShortName}</span>
    </div>
  );
}

function ReportCover({ report }: { report: DevelopmentReport }) {
  return (
    <section className="identity-report-page identity-report-cover">
      <div>
        <IdentityReportMark />
        <p className="identity-report-eyebrow">{BRAND.productName}</p>
        <h1>{BRAND.reportName}</h1>
        <p className="identity-report-prose muted">
          {REPORT_TYPE_LABELS[report.type]}
        </p>
      </div>

      <div className="identity-report-cover-details">
        <strong>{report.title}</strong>
        <span>{formatReportPeriod(report)}</span>
      </div>

      <footer>
        <span>
          Supported by {BRAND.intelligenceName} · For professional review
        </span>
      </footer>
    </section>
  );
}

function ReportExecutiveSummary({ report }: { report: DevelopmentReport }) {
  if (!report.executiveSummary?.trim()) return null;
  return (
    <section className="identity-report-page">
      <div className="identity-report-accent" />
      <p className="identity-report-eyebrow">Overview</p>
      <h2>Executive summary</h2>
      <p className="identity-report-prose">{report.executiveSummary}</p>
    </section>
  );
}

function ReportCoachingPurpose({ report }: { report: DevelopmentReport }) {
  if (!report.coachingPurpose?.trim()) return null;
  return (
    <section className="identity-report-page">
      <div className="identity-report-accent" />
      <p className="identity-report-eyebrow">Focus</p>
      <h2>Coaching purpose</h2>
      <p className="identity-report-prose">{report.coachingPurpose}</p>
    </section>
  );
}

function ReportProgressJourney({ report }: { report: DevelopmentReport }) {
  if (!report.progressSummary?.trim()) return null;
  return (
    <section className="identity-report-page">
      <div className="identity-report-accent" />
      <p className="identity-report-eyebrow">Journey</p>
      <h2>Development journey</h2>
      <p className="identity-report-prose">{report.progressSummary}</p>
    </section>
  );
}

function ReportThemes({ report }: { report: DevelopmentReport }) {
  if (!report.developmentThemes.length) return null;
  return (
    <section className="identity-report-page">
      <div className="identity-report-accent" />
      <p className="identity-report-eyebrow">Themes</p>
      <h2>Development themes</h2>
      <div className="report-themes">
        {report.developmentThemes.map(theme => (
          <div className="report-theme" key={theme.id}>
            <strong>{theme.title}</strong>
            <p>{theme.summary}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReportEvidence({ report }: { report: DevelopmentReport }) {
  if (!report.evidenceItems.length) return null;

  const items =
    report.type === "progress_snapshot"
      ? report.evidenceItems.slice(0, 3)
      : report.evidenceItems;

  return (
    <section className="identity-report-page">
      <div className="identity-report-accent" />
      <p className="identity-report-eyebrow">Documented development</p>
      <h2>Evidence of progress</h2>
      <div className="report-evidence-table">
        {items.map(item => (
          <div className="report-evidence-row" key={item.id}>
            <strong>{item.developmentArea}</strong>
            <p>{item.evidence}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReportCommitments({ report }: { report: DevelopmentReport }) {
  if (!report.commitments.length) return null;
  return (
    <section className="identity-report-page">
      <div className="identity-report-accent" />
      <p className="identity-report-eyebrow">Actions</p>
      <h2>Commitments and actions</h2>
      <div className="report-commitments">
        {report.commitments.map(item => (
          <div className="report-commitment" key={item.id}>
            <strong>
              {item.status === "completed" ? "Completed" : "In progress"}
            </strong>
            <p>{item.statement}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReportFuturePriorities({ report }: { report: DevelopmentReport }) {
  if (!report.futurePriorities.length) return null;
  const priorities =
    report.type === "progress_snapshot"
      ? report.futurePriorities.slice(0, 3)
      : report.futurePriorities;

  return (
    <section className="identity-report-page">
      <div className="identity-report-accent" />
      <p className="identity-report-eyebrow">Looking ahead</p>
      <h2>Future priorities</h2>
      <ul className="report-priorities-list">
        {priorities.map(priority => (
          <li key={priority}>{priority}</li>
        ))}
      </ul>
    </section>
  );
}

function ReportCoachStatement({ report }: { report: DevelopmentReport }) {
  if (!report.includeCoachStatement || !report.coachStatement?.trim()) {
    return null;
  }
  return (
    <section className="identity-report-page">
      <div className="identity-report-accent" />
      <p className="identity-report-eyebrow">Coach perspective</p>
      <h2>Coach statement</h2>
      <p className="identity-report-prose">{report.coachStatement}</p>
    </section>
  );
}

function ProgressSnapshotPreview({
  report,
  client,
  coachName,
}: {
  report: DevelopmentReport;
  client: Client;
  coachName: string;
}) {
  return (
    <article className="identity-report-preview">
      <section className="identity-report-page">
        <IdentityReportMark />
        <p className="identity-report-eyebrow">{BRAND.productShortName}</p>
        <h1>Progress Snapshot</h1>
        <div className="identity-report-accent" />

        <dl className="report-snapshot-meta">
          <div>
            <dt>Name</dt>
            <dd>{client.name}</dd>
          </div>
          <div>
            <dt>Role and organisation</dt>
            <dd>
              {[client.role, client.organisation].filter(Boolean).join(" · ") ||
                "—"}
            </dd>
          </div>
          <div>
            <dt>Reporting period</dt>
            <dd>{formatReportPeriod(report)}</dd>
          </div>
        </dl>

        {report.coachingPurpose?.trim() ? (
          <div className="report-snapshot-block">
            <h2>Current coaching focus</h2>
            <p>{report.coachingPurpose}</p>
          </div>
        ) : null}

        {report.progressSummary?.trim() ? (
          <div className="report-snapshot-block">
            <h2>Progress to date</h2>
            <p>{report.progressSummary}</p>
          </div>
        ) : null}

        {report.evidenceItems.length > 0 ? (
          <div className="report-snapshot-block">
            <h2>Evidence of development</h2>
            <ul>
              {report.evidenceItems.slice(0, 3).map(item => (
                <li key={item.id}>
                  <strong>{item.developmentArea}.</strong> {item.evidence}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {report.futurePriorities.length > 0 ? (
          <div className="report-snapshot-block">
            <h2>Next priorities</h2>
            <ul>
              {report.futurePriorities.slice(0, 3).map(priority => (
                <li key={priority}>{priority}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <footer className="report-snapshot-footer">
          <span>Prepared by {coachName}</span>
          <span>{formatDate(report.approvedAt || report.updatedAt)}</span>
        </footer>
      </section>
    </article>
  );
}

function ImpactSummaryPreview({
  report,
  client,
}: {
  report: DevelopmentReport;
  client: Client;
}) {
  const metrics = report.impactMetrics;

  return (
    <article className="identity-report-preview">
      <ReportCover report={report} />

      <section className="identity-report-page">
        <div className="identity-report-accent" />
        <p className="identity-report-eyebrow">Organisational summary</p>
        <h2>Programme overview</h2>
        <p className="identity-report-prose">
          This Impact Summary covers the coaching relationship with{" "}
          {client.name}
          {client.role || client.organisation
            ? `, ${[client.role, client.organisation].filter(Boolean).join(", ")}`
            : ""}
          , for the period {formatReportPeriod(report)}.
        </p>

        {report.coachingPurpose?.trim() ? (
          <>
            <h2>Agreed objectives</h2>
            <p className="identity-report-prose">{report.coachingPurpose}</p>
          </>
        ) : null}

        {metrics ? (
          <>
            <h2>Coaching engagement</h2>
            <dl className="report-impact-metrics">
              <div>
                <dt>Conversations completed</dt>
                <dd>{metrics.conversationsCompleted}</dd>
              </div>
              <div>
                <dt>Reflections completed</dt>
                <dd>{metrics.reflectionsCompleted}</dd>
              </div>
              <div>
                <dt>Commitments created</dt>
                <dd>{metrics.commitmentsCreated}</dd>
              </div>
              <div>
                <dt>Commitments completed</dt>
                <dd>{metrics.commitmentsCompleted}</dd>
              </div>
              <div>
                <dt>Approved development updates</dt>
                <dd>{metrics.approvedDevelopmentUpdates}</dd>
              </div>
            </dl>
          </>
        ) : null}

        {report.developmentThemes.length > 0 ? (
          <>
            <h2>Broad development themes</h2>
            <div className="report-themes">
              {report.developmentThemes.map(theme => (
                <div className="report-theme" key={theme.id}>
                  <strong>{theme.title}</strong>
                  <p>{theme.summary}</p>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {report.evidenceItems.length > 0 ? (
          <>
            <h2>Documented evidence</h2>
            <div className="report-evidence-table">
              {report.evidenceItems.map(item => (
                <div className="report-evidence-row" key={item.id}>
                  <strong>{item.developmentArea}</strong>
                  <p>{item.evidence}</p>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {report.associatedIndicators.length > 0 ? (
          <>
            <h2>Associated organisational indicators</h2>
            <p className="identity-report-interpretation-note">
              Organisational indicators are presented alongside coaching
              evidence to support evaluation. They should be interpreted as
              associated measures rather than proof of direct causation.
            </p>
            <div className="report-indicators">
              {report.associatedIndicators.map(indicator => (
                <div className="report-indicator" key={indicator.id}>
                  <strong>{indicator.name}</strong>
                  <span>
                    Baseline: {indicator.baselineValue} · Current:{" "}
                    {indicator.currentValue}
                  </span>
                  {indicator.context ? <p>{indicator.context}</p> : null}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="identity-report-interpretation-note">
            Organisational indicators are presented alongside coaching evidence
            to support evaluation. They should be interpreted as associated
            measures rather than proof of direct causation.
          </p>
        )}

        {report.futurePriorities.length > 0 ? (
          <>
            <h2>Next recommendations</h2>
            <ul className="report-priorities-list">
              {report.futurePriorities.map(priority => (
                <li key={priority}>{priority}</li>
              ))}
            </ul>
          </>
        ) : null}

        {report.executiveSummary?.trim() ? (
          <>
            <h2>Summary</h2>
            <p className="identity-report-prose">{report.executiveSummary}</p>
          </>
        ) : null}
      </section>
    </article>
  );
}

export function DevelopmentReportPreview({
  report,
  client,
  coachName = "Coach",
}: {
  report: DevelopmentReport;
  client: Client;
  coachName?: string;
}) {
  if (report.type === "progress_snapshot") {
    return (
      <ProgressSnapshotPreview
        report={report}
        client={client}
        coachName={coachName}
      />
    );
  }

  if (report.type === "impact_summary") {
    return <ImpactSummaryPreview report={report} client={client} />;
  }

  return (
    <article className="identity-report-preview">
      <ReportCover report={report} />
      <ReportExecutiveSummary report={report} />
      <ReportCoachingPurpose report={report} />
      <ReportProgressJourney report={report} />
      <ReportThemes report={report} />
      <ReportEvidence report={report} />
      <ReportCommitments report={report} />
      <ReportFuturePriorities report={report} />
      <ReportCoachStatement report={report} />
    </article>
  );
}
