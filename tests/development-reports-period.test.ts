import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyDevelopmentReportDraftPatch } from "@/lib/reports/draft-patch";
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
    reportingPeriodStart: "2026-01-01",
    reportingPeriodEnd: "2026-03-31",
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
    createdAt: "2026-01-15T10:00:00.000Z",
    updatedAt: "2026-01-15T10:00:00.000Z",
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

describe("updateDraftDevelopmentReport partial merge", () => {
  it("preserves reportingPeriodStart/End when a PATCH omits those keys", () => {
    const next = applyDevelopmentReportDraftPatch(report(), evidencePatch());
    expect(next.reportingPeriodStart).toBe("2026-01-01");
    expect(next.reportingPeriodEnd).toBe("2026-03-31");
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
    expect(next.reportingPeriodStart).toBe("2026-01-01");
    expect(next.reportingPeriodEnd).toBe("2026-03-31");
  });

  it("keeps dates through create → evidence PATCH → generate → review PATCH → approve fields", () => {
    const created = report();
    expect(created.reportingPeriodStart).toBe("2026-01-01");
    expect(created.reportingPeriodEnd).toBe("2026-03-31");

    const afterEvidence = applyDevelopmentReportDraftPatch(
      created,
      evidencePatch()
    );
    expect(afterEvidence.reportingPeriodStart).toBe("2026-01-01");
    expect(afterEvidence.reportingPeriodEnd).toBe("2026-03-31");

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
    expect(afterGenerate.reportingPeriodStart).toBe("2026-01-01");
    expect(afterGenerate.reportingPeriodEnd).toBe("2026-03-31");

    const afterReview = applyDevelopmentReportDraftPatch(afterGenerate, {
      executiveSummary: "Edited executive summary.",
      progressSummary: "Edited progress summary.",
      developmentThemes: afterGenerate.developmentThemes,
      futurePriorities: afterGenerate.futurePriorities,
      reportingPeriodStart: undefined,
      reportingPeriodEnd: undefined,
    });
    expect(afterReview.reportingPeriodStart).toBe("2026-01-01");
    expect(afterReview.reportingPeriodEnd).toBe("2026-03-31");

    const afterConfidentiality = applyDevelopmentReportDraftPatch(afterReview, {
      confidentialityConfirmedAt: "2026-03-31T12:00:00.000Z",
    });
    expect(afterConfidentiality.reportingPeriodStart).toBe("2026-01-01");
    expect(afterConfidentiality.reportingPeriodEnd).toBe("2026-03-31");
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
    expect(label).toMatch(/2026/);
    expect(formatReportPeriod(report({ reportingPeriodStart: null, reportingPeriodEnd: null }))).toBe(
      "Reporting period not set"
    );
  });

  it("passes stored dates into the generation prompt", () => {
    const input = buildDevelopmentReportGenerateInput({
      type: "progress_snapshot",
      audience: "coachee",
      reportingPeriodStart: "2026-01-01",
      reportingPeriodEnd: "2026-03-31",
      title: "Progress Snapshot — Alex",
      coacheeName: "Alex",
      evidenceItems: [evidenceItem()],
      coachingPurpose: "Build confidence in delegation",
    });
    expect(input).toContain(
      `Reporting period: ${formatReportingPeriodForGenerate({
        reportingPeriodStart: "2026-01-01",
        reportingPeriodEnd: "2026-03-31",
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
