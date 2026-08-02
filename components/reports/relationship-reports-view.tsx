"use client";

import { useEffect, useRef, useState } from "react";
import type { Client } from "@/lib/types";
import type { ClientWorkspaceTab } from "@/components/client-workspace-tabs";
import { IdentityBackLink } from "@/components/identity";
import { JourneyStagePage } from "@/components/coaching-journey/journey-stage-page";
import { RelationshipIdentityBar } from "@/components/coaching-journey/relationship-identity-bar";
import { StageOrientation } from "@/components/coaching-journey/stage-orientation";
import { JourneyNextStep } from "@/components/coaching-journey/journey-next-step";
import { StagePrimaryAction } from "@/components/coaching-journey/stage-primary-action";
import { STAGE_ORIENTATION_COPY } from "@/lib/coaching-journey";
import { useRelationshipReports } from "@/lib/reports/use-relationship-reports";
import type { DevelopmentReport, ReportType } from "@/lib/reports/types";
import { apiJson, errorMessage, toError } from "@/lib/api-client";
import { toSafeReportsUserMessage } from "@/lib/reports/availability";
import { CreateReportFlow } from "@/components/reports/create-report-flow";
import { DevelopmentReportPreview } from "@/components/reports/development-report-preview";
import { ReportPrivacyNotice } from "@/components/reports/report-privacy-notice";
import { ReportTypeSelection } from "@/components/reports/report-type-selection";
import { ReportsList } from "@/components/reports/reports-list";
import { ReportsUnavailableState } from "@/components/reports/reports-unavailable-state";

export function RelationshipReportsView({
  client,
  coachName,
  onBack,
  onTabChange,
  initialReportId,
}: {
  client: Client;
  coachName: string;
  onBack: () => void;
  onTabChange: (tab: ClientWorkspaceTab) => void;
  initialReportId?: string | null;
}) {
  void onTabChange;
  const {
    reports,
    availability,
    reportsAvailable,
    loading,
    error,
    refresh,
  } = useRelationshipReports(client.id);
  const [mode, setMode] = useState<"list" | "create" | "view">("list");
  const [createType, setCreateType] = useState<ReportType | undefined>();
  const [activeReport, setActiveReport] = useState<DevelopmentReport | null>(
    null
  );
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [actionError, setActionError] = useState("");
  const openedInitialReport = useRef(false);

  useEffect(() => {
    setMode("list");
    setCreateType(undefined);
    setActiveReport(null);
    setShowTypeMenu(false);
    setActionError("");
    openedInitialReport.current = false;
  }, [client.id]);

  async function openReport(report: DevelopmentReport) {
    if (!reportsAvailable) return;
    if (report.relationshipId !== client.id) {
      console.error(
        "[relationship-isolation] Refusing to open report from another relationship",
        { relationshipId: client.id, reportId: report.id }
      );
      setActionError("This report does not belong to the selected relationship.");
      return;
    }
    setActionError("");
    try {
      const data = await apiJson<{ report: DevelopmentReport }>(
        `/api/development-reports/${report.id}`
      );
      if (data.report.relationshipId !== client.id) {
        console.error(
          "[relationship-isolation] Report ownership mismatch on load",
          { relationshipId: client.id, reportId: data.report.id }
        );
        setActionError("This report does not belong to the selected relationship.");
        return;
      }
      setActiveReport(data.report);
      if (data.report.status === "draft") {
        setMode("create");
      } else {
        setMode("view");
      }
    } catch (err) {
      setActionError(toSafeReportsUserMessage(err) || errorMessage(toError(err)));
    }
  }

  async function createDraftVersion(report: DevelopmentReport) {
    if (!reportsAvailable) return;
    setActionError("");
    try {
      const data = await apiJson<{ report: DevelopmentReport }>(
        `/api/development-reports/${report.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ createDraftVersion: true }),
        }
      );
      setActiveReport(data.report);
      setMode("create");
      await refresh();
    } catch (err) {
      setActionError(toSafeReportsUserMessage(err) || errorMessage(toError(err)));
    }
  }

  useEffect(() => {
    if (
      !initialReportId ||
      !reportsAvailable ||
      openedInitialReport.current ||
      loading
    ) {
      return;
    }
    const match = reports.find(report => report.id === initialReportId);
    if (!match) return;
    openedInitialReport.current = true;
    void openReport(match);
  }, [initialReportId, loading, reports, reportsAvailable]);

  const orientation = STAGE_ORIENTATION_COPY.reports;
  const scopedReports = reports.filter(
    report => report.relationshipId === client.id
  );
  const focalReport = scopedReports[0] ?? null;

  return (
    <JourneyStagePage
      className="client-reports-page"
      back={
        <IdentityBackLink onClick={onBack}>{`Back to ${client.name}`}</IdentityBackLink>
      }
      navigation={null}
      identity={
        <RelationshipIdentityBar
          clientName={client.name}
          role={client.role}
          organisation={client.organisation}
        />
      }
      orientation={
        <StageOrientation
          title={orientation.title}
          description={orientation.description}
        />
      }
      nextStep={
        mode === "list" ? (
          <JourneyNextStep
            now={
              availability.status === "unavailable"
                ? "Reports unavailable"
                : focalReport
                  ? "Reviewing available reports"
                  : "No reports created yet"
            }
            next={
              reportsAvailable
                ? "Create a formal coaching output"
                : "Complete approved development evidence first"
            }
          />
        ) : null
      }
      nextStepPosition="before"
    >
      {loading ? (
        <p className="muted" aria-busy="true">
          Loading reports…
        </p>
      ) : null}

      {!loading && mode === "list" ? (
        <>
          {focalReport ? (
            <section className="reports-focal">
              <p className="stage-context-row__label">Most relevant report</p>
              <h2 className="reports-focal__title">{focalReport.title}</h2>
              <button
                type="button"
                className="identity-text-action"
                onClick={() => void openReport(focalReport)}
              >
                Open report
              </button>
            </section>
          ) : availability.status === "unavailable" ? (
            <ReportsUnavailableState />
          ) : (
            <p className="identity-empty-copy">
              No reports yet. Create a Progress Snapshot, Development Report, or
              Impact Summary when ready.
            </p>
          )}

          {reportsAvailable ? (
            <StagePrimaryAction>
              <button
                type="button"
                className="identity-button identity-button--primary is-primary"
                onClick={() => {
                  setShowTypeMenu(current => !current);
                }}
              >
                Create report
              </button>
            </StagePrimaryAction>
          ) : null}

          {showTypeMenu && reportsAvailable ? (
            <ReportTypeSelection
              onSelect={type => {
                setCreateType(type);
                setActiveReport(null);
                setShowTypeMenu(false);
                setMode("create");
              }}
            />
          ) : null}

          <ReportPrivacyNotice />

          {availability.status === "available" && (error || actionError) ? (
            <p className="report-inline-error">{error || actionError}</p>
          ) : null}

          {availability.status === "available" && scopedReports.length > 0 ? (
            <ReportsList
              reports={scopedReports}
              onOpen={report => void openReport(report)}
            />
          ) : null}
        </>
      ) : null}

      {!loading && mode === "create" && reportsAvailable ? (
        <CreateReportFlow
          client={client}
          coachName={coachName}
          initialType={createType}
          existingReport={
            activeReport?.relationshipId === client.id ? activeReport : null
          }
          onCancel={() => {
            setMode("list");
            setActiveReport(null);
            setCreateType(undefined);
            void refresh();
          }}
          onCompleted={report => {
            setActiveReport(report);
            setMode("view");
            void refresh();
          }}
        />
      ) : null}

      {!loading &&
      mode === "view" &&
      activeReport &&
      activeReport.relationshipId === client.id ? (
        <div className="report-view-shell">
          <div className="report-preview-toolbar report-editor-actions">
            <button
              type="button"
              className="identity-button identity-button--quiet is-quiet is-sm"
              onClick={() => {
                setMode("list");
                setActiveReport(null);
              }}
            >
              Back to reports
            </button>
            <button
              type="button"
              className="identity-button identity-button--secondary is-secondary is-sm"
              onClick={() => void createDraftVersion(activeReport)}
            >
              Create new draft version
            </button>
            <button
              type="button"
              className="identity-button identity-button--primary is-primary is-sm"
              onClick={() => window.print()}
            >
              Print or save as PDF
            </button>
          </div>

          {actionError ? (
            <p className="report-inline-error">{actionError}</p>
          ) : null}

          <DevelopmentReportPreview
            report={activeReport}
            client={client}
            coachName={coachName}
          />
        </div>
      ) : null}
    </JourneyStagePage>
  );
}
