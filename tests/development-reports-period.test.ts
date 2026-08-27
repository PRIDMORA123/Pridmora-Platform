import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyDevelopmentReportDraftPatch,
  reportingPeriodFieldsForCreate,
  reportingPeriodFieldsForEvidenceResave,
} from "@/lib/reports/draft-patch";
import { formatReportPeriod } from "@/lib/reports/format";
import {
  buildDevelopmentReportGenerateInput,
  formatReportingPeriodForGenerate,
} from "@/lib/reports/generate-input";
import type {
  DevelopmentReport,
  ReportEvidenceItem,
} from "@/lib/reports/types";

const root = process.cwd();

const UAT_START = "2026-08-01";
const UAT_END = "2026-08-27";

function report(
  overrides: Partial<DevelopmentReport> = {}
): DevelopmentReport {
  return {
    id: "report-1",
    relationshipId: "client-1",
    coachId: "coach-1",
    type: "progress_snapshot",
    audience: "coachee",
    title: "Progress Snapshot — Alex",
    reportingPeriodStart: UAT_START,
    reportingPeriodEnd: UAT_END,
    status: "draft",
    coachingPurpose: "Build confidence in delegation",
    executiveSummary: null,
    progressSummary: null,
    developmentThemes: [],
    evidenceItems: [],
    commitments: [],
    futurePriorities: [],
    coachStatement: null,
    associatedIndicators: [],
    impactMetrics: null,
    includeCoachStatement: false,
    parentReportId: null,
    confidentialityConfirmedAt: null,
    approvedAt: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function evidenceItem(
  overrides: Partial<ReportEvidenceItem> = {}
): ReportEvidenceItem {
  return {
    id: "reflection-session-1",
    developmentArea: "Delegation",
    evidence: "Alex practised stating a clear recommendation.",
    sourceType: "approved_reflection",
    sourceId: "session-1",
    ...overrides,
  };
}

/** Mirrors the PATCH handler: omitted JSON keys arrive as undefined. */
function evidencePatch(overrides: Partial<DevelopmentReport> = {}) {
  return {
    title: undefined,
    audience: undefined,
    reportingPeriodStart: undefined,
    reportingPeriodEnd: undefined,
    includeCoachStatement: undefined,
    coachingPurpose: "Build confidence in delegation",
    executiveSummary: undefined,
    progressSummary: undefined,
    developmentThemes: undefined,
    evidenceItems: [evidenceItem()],
    commitments: [],
    futurePriorities: undefined,
    coachStatement: undefined,
    associatedIndicators: undefined,
    impactMetrics: undefined,
    ...overrides,
  } as Partial<DevelopmentReport>;
}

describe("formatReportPeriod UAT dates", () => {
  it("formats both 2026-08-01 and 2026-08-27 as a closed range", () => {
    const label = formatReportPeriod(report());
    expect(label).toBe("1 Aug 2026 – 27 Aug 2026");
    expect(label.startsWith("From")).toBe(false);
  });

  it("still uses From when only the start date is present", () => {
    expect(
      formatReportPeriod(
        report({ reportingPeriodStart: UAT_START, reportingPeriodEnd: null })
      )
    ).toBe("From 1 Aug 2026");
  });
});

describe("Step 1 POST and Evidence-step date payload", () => {
  it("includes both dates in the Step 1 create payload", () => {
    expect(
      reportingPeriodFieldsForCreate({
        reportingPeriodStart: UAT_START,
        reportingPeriodEnd: UAT_END,
      })
    ).toEqual({
      reportingPeriodStart: UAT_START,
      reportingPeriodEnd: UAT_END,
    });
  });

  it("writes both date columns from Evidence-step form values", () => {
    const dates = reportingPeriodFieldsForEvidenceResave({
      reportingPeriodStart: UAT_START,
      reportingPeriodEnd: UAT_END,
    });
    expect(dates).toEqual({
      reportingPeriodStart: UAT_START,
      reportingPeriodEnd: UAT_END,
    });

    const afterEvidence = applyDevelopmentReportDraftPatch(
      report({
        reportingPeriodStart: UAT_START,
        reportingPeriodEnd: null,
      }),
      evidencePatch(dates)
    );
    expect(afterEvidence.reportingPeriodStart).toBe(UAT_START);
    expect(afterEvidence.reportingPeriodEnd).toBe(UAT_END);
  });

  it("does not send null for an empty Evidence-step date field", () => {
    const dates = reportingPeriodFieldsForEvidenceResave({
      reportingPeriodStart: UAT_START,
      reportingPeriodEnd: "",
    });
    expect(dates).toEqual({ reportingPeriodStart: UAT_START });
    expect("reportingPeriodEnd" in dates).toBe(false);
    expect(JSON.stringify(dates)).not.toContain("null");

    const afterEvidence = applyDevelopmentReportDraftPatch(
      report(),
      evidencePatch({
        reportingPeriodStart: dates.reportingPeriodStart,
        reportingPeriodEnd: dates.reportingPeriodEnd,
      })
    );
    expect(afterEvidence.reportingPeriodStart).toBe(UAT_START);
    expect(afterEvidence.reportingPeriodEnd).toBe(UAT_END);
  });

  it("wires the Evidence-step PATCH to the non-nulling resave helper", () => {
    const source = readFileSync(
      join(root, "components/reports/create-report-flow.tsx"),
      "utf8"
    );
    expect(source).toContain("reportingPeriodFieldsForEvidenceResave(details)");
    expect(source).toContain("reportingPeriodFieldsForCreate(details)");
  });
});

describe("updateDraftDevelopmentReport partial merge", () => {
  it("preserves reportingPeriodStart/End when a PATCH omits those keys", () => {
    const next = applyDevelopmentReportDraftPatch(report(), evidencePatch());
    expect(next.reportingPeriodStart).toBe(UAT_START);
    expect(next.reportingPeriodEnd).toBe(UAT_END);
    expect(next.evidenceItems).toHaveLength(1);
  });

  it("treats explicit null as an intentional clear of the reporting period", () => {
    const next = applyDevelopmentReportDraftPatch(report(), {
      reportingPeriodStart: null,
      reportingPeriodEnd: null,
    });
    expect(next.reportingPeriodStart).toBeNull();
    expect(next.reportingPeriodEnd).toBeNull();
  });

  it("does not treat undefined as a clear", () => {
    const next = applyDevelopmentReportDraftPatch(report(), {
      reportingPeriodStart: undefined,
      reportingPeriodEnd: undefined,
      evidenceItems: [evidenceItem()],
    });
    expect(next.reportingPeriodStart).toBe(UAT_START);
    expect(next.reportingPeriodEnd).toBe(UAT_END);
  });

  it("keeps dates through create → evidence PATCH → generate → review PATCH → approve fields", () => {
    const created = report();
    expect(created.reportingPeriodStart).toBe(UAT_START);
    expect(created.reportingPeriodEnd).toBe(UAT_END);

    const afterEvidence = applyDevelopmentReportDraftPatch(
      created,
      evidencePatch(
        reportingPeriodFieldsForEvidenceResave({
          reportingPeriodStart: UAT_START,
          reportingPeriodEnd: UAT_END,
        })
      )
    );
    expect(afterEvidence.reportingPeriodStart).toBe(UAT_START);
    expect(afterEvidence.reportingPeriodEnd).toBe(UAT_END);

    const afterGenerate = applyDevelopmentReportDraftPatch(afterEvidence, {
      executiveSummary: "Short executive summary.",
      progressSummary: "Documented progress on delegation.",
      developmentThemes: [
        { id: "theme-1", title: "Delegation", summary: "Recommendations are clearer." },
      ],
      futurePriorities: ["Practise one delegated decision."],
      reportingPeriodStart: undefined,
      reportingPeriodEnd: undefined,
    });
    expect(afterGenerate.reportingPeriodStart).toBe(UAT_START);
    expect(afterGenerate.reportingPeriodEnd).toBe(UAT_END);

    const afterReview = applyDevelopmentReportDraftPatch(afterGenerate, {
      executiveSummary: "Edited executive summary.",
      progressSummary: "Edited progress summary.",
      developmentThemes: afterGenerate.developmentThemes,
      futurePriorities: afterGenerate.futurePriorities,
      reportingPeriodStart: undefined,
      reportingPeriodEnd: undefined,
    });
    expect(afterReview.reportingPeriodStart).toBe(UAT_START);
    expect(afterReview.reportingPeriodEnd).toBe(UAT_END);

    const afterConfidentiality = applyDevelopmentReportDraftPatch(afterReview, {
      confidentialityConfirmedAt: "2026-08-27T12:00:00.000Z",
    });
    expect(afterConfidentiality.reportingPeriodStart).toBe(UAT_START);
    expect(afterConfidentiality.reportingPeriodEnd).toBe(UAT_END);
  });

  it("does not change approved-report immutability in the repository", () => {
    const source = readFileSync(
      join(root, "lib/reports/repository.ts"),
      "utf8"
    );
    expect(source).toContain("Approved reports are immutable. Create a new draft instead.");
    expect(source).toContain('eq("status", "draft")');
    expect(source).toContain("applyDevelopmentReportDraftPatch");
  });
});

describe("reporting period display and generate context", () => {
  it("renders the stored period rather than “Reporting period not set”", () => {
    const label = formatReportPeriod(report());
    expect(label).not.toBe("Reporting period not set");
    expect(label).toBe("1 Aug 2026 – 27 Aug 2026");
    expect(formatReportPeriod(report({ reportingPeriodStart: null, reportingPeriodEnd: null }))).toBe(
      "Reporting period not set"
    );
  });

  it("passes stored dates into the generation prompt", () => {
    const input = buildDevelopmentReportGenerateInput({
      type: "progress_snapshot",
      audience: "coachee",
      reportingPeriodStart: UAT_START,
      reportingPeriodEnd: UAT_END,
      title: "Progress Snapshot — Alex",
      coacheeName: "Alex",
      evidenceItems: [evidenceItem()],
      coachingPurpose: "Build confidence in delegation",
    });
    expect(input).toContain(
      `Reporting period: ${formatReportingPeriodForGenerate({
        reportingPeriodStart: UAT_START,
        reportingPeriodEnd: UAT_END,
      })}`
    );
    expect(input).not.toContain("Reporting period: not set");
  });

  it("wires generate route to stored reporting period fields", () => {
    const source = readFileSync(
      join(root, "app/api/development-reports/[reportId]/generate/route.ts"),
      "utf8"
    );
    expect(source).toContain("buildDevelopmentReportGenerateInput");
    expect(source).toContain("reportingPeriodStart: existing.reportingPeriodStart");
    expect(source).toContain("reportingPeriodEnd: existing.reportingPeriodEnd");
  });
});
