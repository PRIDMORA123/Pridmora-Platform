/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { COMPREHENSIVE_MARKER } from "@/lib/summary-insights/types";
import { collectAvailableEvidence } from "@/lib/reports/evidence";
import { formatReportPeriod } from "@/lib/reports/format";
import { buildDevelopmentReportGenerateInput } from "@/lib/reports/generate-input";
import {
  SNAPSHOT_EVIDENCE_MAX_CHARS,
  SNAPSHOT_EVIDENCE_MAX_ITEMS,
  evidenceItemsForProgressSnapshot,
} from "@/lib/reports/progress-snapshot";
import { developmentReportTaskPrompt } from "@/lib/ai/development-report-prompt";
import { DevelopmentReportPreview } from "@/components/reports/development-report-preview";
import { ReportsList } from "@/components/reports/reports-list";
import type { Client, Session } from "@/lib/types";
import type {
  DevelopmentReport,
  ReportEvidenceItem,
} from "@/lib/reports/types";

const SESSION_SUMMARY =
  "Alex practised stating a clear recommendation in the leadership meeting.";
const INTERPRETATION =
  "Interpretation: ownership is shifting from holding work to leaving decisions with the team. ".repeat(
    6
  );
const IMPLICATION =
  "Implication: continued practice will embed the new pattern under load. ".repeat(
    6
  );
const NEXT_ACTIONS =
  "Next actions: run one more delegated decision this week and review what happened. ".repeat(
    4
  );
const COMPREHENSIVE_SECRET = "internal-trajectory-payload-must-not-leak";
const PRIVATE_NOTE = "PRIVATE_COACH_NOTE_MUST_NEVER_APPEAR";

function packedComprehensive(): string {
  return `${COMPREHENSIVE_MARKER}\n${JSON.stringify({
    developmentTrajectory: COMPREHENSIVE_SECRET,
  })}`;
}

function joinedReflectionEvidence(): string {
  return [
    SESSION_SUMMARY,
    INTERPRETATION.trim(),
    IMPLICATION.trim(),
    NEXT_ACTIONS.trim(),
    packedComprehensive(),
  ].join("\n\n");
}

function session(
  partial: Partial<Session> & Pick<Session, "id" | "sessionNumber" | "status" | "clientId">
): Session {
  return {
    coachId: "coach-1",
    title: "",
    date: "2026-02-10",
    time: "10:00",
    durationMinutes: 60,
    location: "",
    focus: "Delegation",
    preparation: "",
    prepPurpose: "",
    prepTopics: "",
    prepQuestions: "",
    prepCommitmentsReview: "",
    prepRisks: "",
    prepPrivateNotes: "",
    prepAiBrief: null,
    prepAiBriefGeneratedAt: "",
    prepAiBriefStyle: "",
    prepAiBriefConfirmedAt: "",
    prepAiBriefSourceFingerprint: "",
    intelligenceMode: "",
    intelligenceStatus: "idle",
    intelligenceSources: [],
    intelligenceLastRefreshedAt: "",
    intelligenceErrorCode: "",
    notes: "",
    commitments: "",
    parkingLot: "",
    notesSavedAt: "",
    timerElapsedSeconds: 0,
    timerStartedAt: null,
    sessionStartedAt: null,
    reflection: "",
    reflectWhatShifted: "",
    reflectWhatSurprised: "",
    reflectWhatWorked: "",
    reflectDifferently: "",
    reflectProfessionalLearning: "",
    reflectPrivate: "",
    summary: SESSION_SUMMARY,
    emergingThemes: INTERPRETATION,
    strengthsObserved: "",
    valuesBecomingVisible: IMPLICATION,
    professionalIdentityDevelopment: packedComprehensive(),
    agreedActions: NEXT_ACTIONS,
    outcomes: "",
    suggestedFocus: "",
    coachReflection: "",
    summaryStatus: "approved",
    aiSummaryApproved: true,
    coachingQuestions: [],
    completedAt: "2026-02-10T10:00:00.000Z",
    lastUpdated: "",
    ...partial,
  };
}

function client(partial: Partial<Client> = {}): Client {
  return {
    id: "client-1",
    name: "Alex Morgan",
    initials: "AM",
    organisation: "Northbridge",
    role: "Director",
    email: "",
    status: "Active",
    nextSession: "Not scheduled",
    currentFocus: "Build confidence in delegation",
    identitySummary: "",
    coachInsight: "",
    preparationStyleOverride: null,
    strengths: [],
    values: [],
    themes: [],
    goals: [],
    actions: [],
    quotes: [],
    sessions: [
      session({
        id: "session-1",
        sessionNumber: 1,
        status: "completed",
        clientId: "client-1",
      }),
    ],
    journey: [],
    ...partial,
  };
}

function evidenceItem(
  overrides: Partial<ReportEvidenceItem> = {}
): ReportEvidenceItem {
  return {
    id: "reflection-session-1",
    developmentArea: "Delegation",
    evidence: joinedReflectionEvidence(),
    sourceType: "approved_reflection",
    sourceId: "session-1",
    ...overrides,
  };
}

function report(
  overrides: Partial<DevelopmentReport> = {}
): DevelopmentReport {
  return {
    id: "report-1",
    relationshipId: "client-1",
    coachId: "coach-1",
    type: "progress_snapshot",
    audience: "coachee",
    title: "Progress Snapshot — Alex Morgan",
    reportingPeriodStart: "2026-08-01",
    reportingPeriodEnd: "2026-08-27",
    status: "draft",
    coachingPurpose: "Build confidence in delegation",
    executiveSummary: "Alex is practising clearer recommendations.",
    progressSummary: "Approved evidence shows progress on delegation.",
    developmentThemes: [],
    evidenceItems: [
      {
        id: "purpose-client-1",
        developmentArea: "Coaching purpose",
        evidence: "Build confidence in delegation",
        sourceType: "coaching_purpose",
        sourceId: "client-1",
      },
      evidenceItem(),
    ],
    commitments: [],
    futurePriorities: ["Practise one delegated decision this week."],
    coachStatement: null,
    associatedIndicators: [],
    impactMetrics: null,
    includeCoachStatement: false,
    parentReportId: null,
    confidentialityConfirmedAt: null,
    approvedAt: null,
    createdAt: "2026-03-31T10:00:00.000Z",
    updatedAt: "2026-03-31T10:00:00.000Z",
    ...overrides,
  };
}

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

async function renderView(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  mounted.push({ root, container });
  return container;
}

afterEach(async () => {
  for (const entry of mounted.splice(0)) {
    await act(async () => {
      entry.root.unmount();
    });
    entry.container.remove();
  }
});

function evidenceListItems(container: HTMLElement): HTMLLIElement[] {
  const heading = [...container.querySelectorAll("h2")].find(
    node => node.textContent === "Evidence of development" || node.textContent === "Evidence of progress" || node.textContent === "Documented evidence"
  );
  const list = heading?.nextElementSibling;
  if (!list) return [];
  return [...list.querySelectorAll("li")];
}

describe("Progress Snapshot evidence composition", () => {
  it("purpose + one approved reflection stays concise and keeps provenance", () => {
    const snapshot = evidenceItemsForProgressSnapshot(
      report().evidenceItems,
      "Build confidence in delegation"
    );
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.id).toBe("reflection-session-1");
    expect(snapshot[0]?.sourceType).toBe("approved_reflection");
    expect(snapshot[0]?.sourceId).toBe("session-1");
    expect(snapshot[0]?.evidence).toContain("Alex practised stating");
    expect(snapshot[0]?.evidence.length).toBeLessThanOrEqual(
      SNAPSHOT_EVIDENCE_MAX_CHARS
    );
  });

  it("caps Evidence of development at three bullets", () => {
    const items = Array.from({ length: 6 }, (_, index) =>
      evidenceItem({
        id: `item-${index}`,
        developmentArea: `Area ${index}`,
        evidence: `Observable behaviour ${index}.`,
        sourceType: "approved_development_update",
      })
    );
    expect(evidenceItemsForProgressSnapshot(items, null)).toHaveLength(
      SNAPSHOT_EVIDENCE_MAX_ITEMS
    );
  });

  it("does not duplicate coaching purpose when Current coaching focus is shown", () => {
    const snapshot = evidenceItemsForProgressSnapshot(
      report().evidenceItems,
      "Build confidence in delegation"
    );
    expect(snapshot.some(item => item.sourceType === "coaching_purpose")).toBe(
      false
    );
  });

  it("keeps purpose as evidence when Current coaching focus is empty", () => {
    const snapshot = evidenceItemsForProgressSnapshot(
      report().evidenceItems,
      ""
    );
    expect(snapshot[0]?.sourceType).toBe("coaching_purpose");
  });

  it("bounds long reflection/session material instead of dumping it verbatim", () => {
    const excerpt = evidenceItemsForProgressSnapshot(
      [evidenceItem()],
      null
    )[0]?.evidence ?? "";
    expect(excerpt).toContain(SESSION_SUMMARY);
    expect(excerpt).not.toContain(INTERPRETATION.trim());
    expect(excerpt).not.toContain(IMPLICATION.trim());
    expect(excerpt).not.toContain(NEXT_ACTIONS.trim());
    expect(excerpt.length).toBeLessThan(joinedReflectionEvidence().length);
  });

  it("strips [[pridmora_comprehensive]] payloads from snapshot evidence", () => {
    const excerpt = evidenceItemsForProgressSnapshot(
      [
        evidenceItem({
          evidence: `${SESSION_SUMMARY}\n\n${packedComprehensive()}`,
        }),
      ],
      null
    )[0]?.evidence ?? "";
    expect(excerpt).not.toContain(COMPREHENSIVE_MARKER);
    expect(excerpt).not.toContain(COMPREHENSIVE_SECRET);
  });
});

describe("Progress Snapshot preview, history and generate input", () => {
  it("renders a concise snapshot for purpose + one approved reflection", async () => {
    const snapshot = report();
    const container = await renderView(
      <DevelopmentReportPreview
        report={snapshot}
        client={client()}
        coachName="Jordan"
      />
    );
    const period = formatReportPeriod(snapshot);
    expect(container.textContent).toContain("Progress Snapshot");
    expect(container.textContent).toContain("Current coaching focus");
    expect(container.textContent).toContain("Build confidence in delegation");
    expect(container.textContent).toContain(period);
    expect(container.textContent).toContain("27 Aug 2026");
    expect(container.textContent).not.toContain("From 1 Aug 2026");
    expect(container.textContent).not.toContain("Reporting period not set");

    const bullets = evidenceListItems(container);
    expect(bullets.length).toBeLessThanOrEqual(3);
    expect(bullets.length).toBe(1);
    expect(container.textContent).not.toMatch(/Coaching purpose\./);
    expect(container.textContent).not.toContain(COMPREHENSIVE_MARKER);
    expect(container.textContent).not.toContain(COMPREHENSIVE_SECRET);
    expect(container.textContent).not.toContain(INTERPRETATION.trim());
    expect(container.textContent).toContain(SESSION_SUMMARY);
  });

  it("renders the stored period on an approved snapshot", async () => {
    const approved = report({
      status: "approved",
      approvedAt: "2026-03-31T12:00:00.000Z",
    });
    const container = await renderView(
      <DevelopmentReportPreview
        report={approved}
        client={client()}
        coachName="Jordan"
      />
    );
    expect(container.textContent).toContain(formatReportPeriod(approved));
    expect(container.textContent).toContain("27 Aug 2026");
    expect(container.textContent).not.toContain("From 1 Aug 2026");
    expect(container.textContent).not.toContain("Reporting period not set");
  });

  it("renders the stored period in Report history", async () => {
    const item = report({ status: "approved", approvedAt: "2026-03-31T12:00:00.000Z" });
    const container = await renderView(
      <ReportsList reports={[item]} onOpen={() => undefined} />
    );
    expect(container.textContent).toContain("Report history");
    expect(container.textContent).toContain(formatReportPeriod(item));
    expect(container.textContent).toContain("27 Aug 2026");
    expect(container.textContent).not.toContain("From 1 Aug 2026");
    expect(container.textContent).not.toContain("Reporting period not set");
  });

  it("constrains Progress Snapshot generate input without inventing evidence", () => {
    const input = buildDevelopmentReportGenerateInput({
      type: "progress_snapshot",
      audience: "coachee",
      reportingPeriodStart: "2026-01-01",
      reportingPeriodEnd: "2026-03-31",
      title: "Progress Snapshot — Alex Morgan",
      coacheeName: "Alex",
      evidenceItems: report().evidenceItems,
      coachingPurpose: "Build confidence in delegation",
    });
    expect(input).toContain("PROGRESS SNAPSHOT CONSTRAINT");
    expect(input).toContain("Do not invent or infer evidence");
    expect(input).toContain(SESSION_SUMMARY);
    expect(input).not.toContain(COMPREHENSIVE_MARKER);
    expect(input).not.toContain(COMPREHENSIVE_SECRET);
    expect(input).not.toContain("Source: coaching_purpose");
    expect(input).toContain("Reporting period: 2026-01-01 to 2026-03-31");
  });

  it("does not add Progress Snapshot constraints to other report types", () => {
    expect(developmentReportTaskPrompt("development_report")).not.toContain(
      "PROGRESS SNAPSHOT CONSTRAINT"
    );
    expect(developmentReportTaskPrompt("impact_summary")).not.toContain(
      "PROGRESS SNAPSHOT CONSTRAINT"
    );
  });
});

describe("Development Report and Impact Summary retain richer evidence", () => {
  it("keeps the full concatenated reflection on Development Report and Impact Summary", async () => {
    const fatItems = report().evidenceItems;
    const development = report({
      type: "development_report",
      title: "Development Report — Alex Morgan",
    });
    const impact = report({
      type: "impact_summary",
      audience: "sponsor",
      title: "Impact Summary — Alex Morgan",
    });

    const developmentView = await renderView(
      <DevelopmentReportPreview
        report={development}
        client={client()}
        coachName="Jordan"
      />
    );
    const impactView = await renderView(
      <DevelopmentReportPreview
        report={impact}
        client={client()}
        coachName="Jordan"
      />
    );

    expect(developmentView.textContent).toContain(INTERPRETATION.trim());
    expect(developmentView.textContent).toContain(IMPLICATION.trim());
    expect(developmentView.textContent).toContain(NEXT_ACTIONS.trim());
    expect(impactView.textContent).toContain(INTERPRETATION.trim());
    expect(impactView.textContent).toContain(IMPLICATION.trim());

    const developmentInput = buildDevelopmentReportGenerateInput({
      type: "development_report",
      audience: "coachee",
      reportingPeriodStart: "2026-01-01",
      reportingPeriodEnd: "2026-03-31",
      title: development.title,
      coacheeName: "Alex",
      evidenceItems: fatItems,
      coachingPurpose: development.coachingPurpose,
    });
    const impactInput = buildDevelopmentReportGenerateInput({
      type: "impact_summary",
      audience: "sponsor",
      reportingPeriodStart: "2026-01-01",
      reportingPeriodEnd: "2026-03-31",
      title: impact.title,
      coacheeName: "Alex",
      evidenceItems: fatItems,
      coachingPurpose: impact.coachingPurpose,
    });
    expect(developmentInput).toContain(joinedReflectionEvidence());
    expect(impactInput).toContain(joinedReflectionEvidence());
    expect(developmentInput).not.toContain("PROGRESS SNAPSHOT CONSTRAINT");
    expect(impactInput).not.toContain("PROGRESS SNAPSHOT CONSTRAINT");
  });

  it("does not change collectAvailableEvidence concatenation for non-snapshot use", () => {
    const items = collectAvailableEvidence({
      client: client(),
      profile: null,
      updates: [],
    });
    const reflection = items.find(item => item.sourceType === "approved_reflection");
    expect(reflection?.evidence).toContain(SESSION_SUMMARY);
    expect(reflection?.evidence).toContain(INTERPRETATION.trim());
    expect(reflection?.evidence).toContain(IMPLICATION.trim());
    expect(reflection?.evidence).toContain(NEXT_ACTIONS.trim());
  });
});

describe("confidentiality exclusions for report evidence", () => {
  it("never offers private notes or unapproved reflections", () => {
    const items = collectAvailableEvidence({
      client: client({
        sessions: [
          session({
            id: "session-private",
            sessionNumber: 1,
            status: "completed",
            clientId: "client-1",
            notes: PRIVATE_NOTE,
            coachReflection: PRIVATE_NOTE,
            reflectPrivate: PRIVATE_NOTE,
            prepPrivateNotes: PRIVATE_NOTE,
            reflection: PRIVATE_NOTE,
          }),
          session({
            id: "session-unapproved",
            sessionNumber: 2,
            status: "completed",
            clientId: "client-1",
            summaryStatus: "draft",
            aiSummaryApproved: false,
            summary: "Unapproved draft must not appear.",
          }),
        ],
      }),
      profile: null,
      updates: [],
    });

    const serialised = JSON.stringify(items);
    expect(serialised).not.toContain(PRIVATE_NOTE);
    expect(serialised).not.toContain("Unapproved draft must not appear.");
    expect(items.some(item => item.sourceId === "session-unapproved")).toBe(
      false
    );
  });
});
