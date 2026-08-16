import { describe, expect, it } from "vitest";
import {
  authorisedDevelopmentEvidenceFingerprintPart,
  evidenceParentAuthorisedForPreparation,
  formatAuthorisedDevelopmentEvidenceForPrompt,
  selectAuthorisedObservationsForPreparation,
  type PreparationAuthorisedObservation,
} from "@/lib/coaching-intelligence/authorised-development-evidence";
import {
  buildPreparationIntelligenceInput,
  buildPreparationIntelligenceInstructions,
} from "@/lib/coaching-intelligence/prompt";
import { PREPARATION_INTELLIGENCE_PROMPT } from "@/lib/coaching-intelligence/rules";
import type { ResolvedIntelligenceSources } from "@/lib/coaching-intelligence/resolve-sources";
import { PREPARATION_BRIEF_SYSTEM_PROMPT } from "@/lib/ai/preparation-brief-prompt";
import { buildSourceFingerprint, isPreparationBriefStale } from "@/lib/preparation-brief";
import type {
  DevelopmentEvidenceObservation,
  DevelopmentEvidenceRecord,
} from "@/lib/development-evidence/types";

function makeEvidence(
  overrides: Partial<DevelopmentEvidenceRecord> &
    Pick<DevelopmentEvidenceRecord, "id" | "title">
): DevelopmentEvidenceRecord {
  return {
    organisationId: "org-1",
    clientId: "client-1",
    evidenceType: "stakeholder_feedback",
    sourceType: "uploaded_document",
    sourceRecordId: null,
    evidenceDate: "2026-08-16",
    capturedAt: "2026-08-16T12:00:00.000Z",
    capturedBy: null,
    originalDocumentId: "doc-1",
    processingStatus: "ready",
    reviewStatus: "edited",
    includeInIntelligence: true,
    structuredEvidence: {
      observations: [
        {
          title: "Stale structured excluded observation",
          description: "Must never enter Preparation via structured_evidence",
          behaviouralEvidence:
            "Opportunity to strengthen impact by recommending solutions",
        },
      ],
    },
    sourceSummary: null,
    freshnessClass: "current",
    restricted: false,
    contentHash: null,
    extractionVersion: null,
    purpose: null,
    sourceLabel: null,
    capabilityKeys: [],
    createdAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T13:03:47.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function makeObservation(
  overrides: Partial<DevelopmentEvidenceObservation> &
    Pick<DevelopmentEvidenceObservation, "id" | "evidenceId" | "title">
): DevelopmentEvidenceObservation {
  return {
    organisationId: "org-1",
    clientId: "client-1",
    description: "",
    category: null,
    behaviouralEvidence: null,
    developmentImplication: null,
    sourceConfidence: "medium",
    assessmentContext: null,
    limitations: null,
    capabilityKey: null,
    includeInIntelligence: false,
    reviewStatus: "proposed",
    sortOrder: 0,
    createdAt: "2026-08-16T12:45:14.000Z",
    updatedAt: "2026-08-16T13:03:46.000Z",
    ...overrides,
  };
}

const approvedObservation = makeObservation({
  id: "obs-approved",
  evidenceId: "ev-1",
  title: "Increased willingness to raise delivery concerns early",
  includeInIntelligence: true,
  reviewStatus: "approved",
  behaviouralEvidence:
    "In the last project meeting, Alex identified a potential delay and clarified who needed to take the next action.",
  updatedAt: "2026-08-16T13:03:46.000Z",
});

const excludedObservation = makeObservation({
  id: "obs-excluded",
  evidenceId: "ev-1",
  title: "Opportunity to strengthen impact by recommending solutions",
  includeInIntelligence: false,
  reviewStatus: "excluded",
  behaviouralEvidence: "Would recommend solutions more often in meetings.",
});

const pendingObservation = makeObservation({
  id: "obs-pending",
  evidenceId: "ev-1",
  title: "Pending observation",
  includeInIntelligence: false,
  reviewStatus: "proposed",
  behaviouralEvidence: "Pending behavioural note.",
});

const rejectedObservation = makeObservation({
  id: "obs-rejected",
  evidenceId: "ev-1",
  title: "Rejected observation",
  includeInIntelligence: false,
  reviewStatus: "rejected",
  behaviouralEvidence: "Rejected behavioural note.",
});

const parent = makeEvidence({
  id: "ev-1",
  title: "Alex feedback.docx",
});

const emptySources: ResolvedIntelligenceSources = {
  previousConversations: [],
  approvedSummaries: [],
  openCommitments: [],
  approvedReflections: [],
  journeyEvidence: [],
  developmentThemes: [],
  approvedReports: [],
  authorisedDevelopmentEvidence: [],
  usedSources: [],
};

describe("Preparation authorised Development Evidence", () => {
  it("A. includes approved observation in Preparation source context", () => {
    const selected = selectAuthorisedObservationsForPreparation({
      evidence: [parent],
      observations: [
        approvedObservation,
        excludedObservation,
        pendingObservation,
        rejectedObservation,
      ],
    });

    expect(selected).toHaveLength(1);
    expect(selected[0]?.title).toBe(approvedObservation.title);
    expect(selected[0]?.behaviouralEvidence).toContain("potential delay");
    expect(selected[0]?.evidenceType).toBe("stakeholder_feedback");
    expect(selected[0]?.sourceTitle).toBe("Alex feedback.docx");

    const sources: ResolvedIntelligenceSources = {
      ...emptySources,
      authorisedDevelopmentEvidence: selected,
      usedSources: ["authorised_development_evidence"],
    };
    const prompt = buildPreparationIntelligenceInput({
      mode: "comprehensive",
      personContext: "Name: Alex Morgan",
      coachingPurpose: "Build judgement in meetings",
      sources,
      clientDisplayName: "Alex Morgan",
    });

    expect(prompt).toContain(approvedObservation.title);
    expect(prompt).toContain("potential delay");
    expect(prompt).toContain("Alex feedback.docx");
    expect(prompt).toContain("stakeholder_feedback");
  });

  it("B. excludes excluded observation from Preparation", () => {
    const selected = selectAuthorisedObservationsForPreparation({
      evidence: [parent],
      observations: [approvedObservation, excludedObservation],
    });
    const prompt = formatAuthorisedDevelopmentEvidenceForPrompt(selected);

    expect(selected.every(item => item.observationId !== "obs-excluded")).toBe(
      true
    );
    expect(prompt).not.toContain(
      "Opportunity to strengthen impact by recommending solutions"
    );
  });

  it("C. excludes pending and rejected observations", () => {
    const selected = selectAuthorisedObservationsForPreparation({
      evidence: [parent],
      observations: [pendingObservation, rejectedObservation],
    });
    expect(selected).toEqual([]);
  });

  it("D. never supplies full extracted document text", () => {
    const fullDocument =
      "FULL DOCUMENT BODY that must never enter Preparation context.";
    const selected = selectAuthorisedObservationsForPreparation({
      evidence: [
        makeEvidence({
          id: "ev-1",
          title: "Alex feedback.docx",
          sourceSummary: fullDocument,
          structuredEvidence: {
            observations: [
              {
                title: "Structured path",
                description: "Must not enter Preparation",
                behaviouralEvidence: fullDocument,
              },
            ],
          },
        }),
      ],
      observations: [approvedObservation],
    });
    const prompt = buildPreparationIntelligenceInput({
      mode: "assisted",
      personContext: "Name: Alex Morgan",
      coachingPurpose: "Focus",
      sources: {
        ...emptySources,
        authorisedDevelopmentEvidence: selected,
      },
      clientDisplayName: "Alex Morgan",
    });

    expect(prompt).not.toContain(fullDocument);
    expect(prompt).toContain(approvedObservation.behaviouralEvidence!);
  });

  it("E. new or updated authorised Development Evidence changes fingerprint", () => {
    const first = selectAuthorisedObservationsForPreparation({
      evidence: [parent],
      observations: [approvedObservation],
    });
    const updated: PreparationAuthorisedObservation[] =
      selectAuthorisedObservationsForPreparation({
        evidence: [
          makeEvidence({
            id: "ev-1",
            title: "Alex feedback.docx",
            updatedAt: "2026-08-16T14:00:00.000Z",
          }),
        ],
        observations: [
          {
            ...approvedObservation,
            updatedAt: "2026-08-16T14:00:00.000Z",
          },
        ],
      });

    const fingerprintA = buildSourceFingerprint([
      "client-updated",
      "previous_conversations,authorised_development_evidence",
      authorisedDevelopmentEvidenceFingerprintPart(first),
    ]);
    const fingerprintB = buildSourceFingerprint([
      "client-updated",
      "previous_conversations,authorised_development_evidence",
      authorisedDevelopmentEvidenceFingerprintPart(updated),
    ]);

    expect(fingerprintA).not.toBe(fingerprintB);
    expect(
      isPreparationBriefStale(
        { generatedAt: "2026-08-16T13:34:38.000Z", sourceFingerprint: fingerprintA },
        fingerprintB
      )
    ).toBe(true);
  });

  it("F. preserves existing session/journey sources alongside Development Evidence", () => {
    const selected = selectAuthorisedObservationsForPreparation({
      evidence: [parent],
      observations: [approvedObservation],
    });
    const sources: ResolvedIntelligenceSources = {
      ...emptySources,
      previousConversations: [
        {
          id: "session-4",
          sessionNumber: 4,
          date: "2026-08-30",
          focus: "Recommendation practice",
          summary: "Approved previous conversation summary.",
          commitments: "Practise stating a recommendation.",
          emergingThemes: "",
        },
      ],
      approvedSummaries: [
        {
          id: "session-4",
          summary: "Approved previous conversation summary.",
          focus: "Recommendation practice",
        },
      ],
      journeyEvidence: [
        {
          id: "session-4",
          summary: "Journey evidence summary.",
          focus: "Recommendation practice",
        },
      ],
      authorisedDevelopmentEvidence: selected,
      usedSources: [
        "previous_conversations",
        "approved_summaries",
        "journey_evidence",
        "authorised_development_evidence",
      ],
    };

    const prompt = buildPreparationIntelligenceInput({
      mode: "comprehensive",
      personContext: "Name: Alex Morgan",
      coachingPurpose: "Build judgement",
      sources,
      clientDisplayName: "Alex Morgan",
    });

    expect(prompt).toContain("Approved previous conversation summary.");
    expect(prompt).toContain("Journey evidence summary.");
    expect(prompt).toContain(approvedObservation.title);
  });

  it("G. fingerprint change after approval supports Preparation regenerate/stale detection", () => {
    const beforeApproval = authorisedDevelopmentEvidenceFingerprintPart([]);
    const afterApproval = authorisedDevelopmentEvidenceFingerprintPart(
      selectAuthorisedObservationsForPreparation({
        evidence: [parent],
        observations: [approvedObservation],
      })
    );

    const before = buildSourceFingerprint([
      "2026-08-15T20:35:48.321146+00:00",
      "previous_conversations,approved_summaries",
      beforeApproval,
    ]);
    const after = buildSourceFingerprint([
      "2026-08-15T20:35:48.321146+00:00",
      "previous_conversations,approved_summaries,authorised_development_evidence",
      afterApproval,
    ]);

    expect(before).not.toBe(after);
    expect(
      isPreparationBriefStale(
        {
          generatedAt: "2026-08-16T13:34:38.000Z",
          sourceFingerprint: before,
        },
        after
      )
    ).toBe(true);
  });

  it("H. longitudinal prompt instructs progress-vs-unresolved reasoning", () => {
    const instructions = buildPreparationIntelligenceInstructions({
      mode: "comprehensive",
      clientDisplayName: "Alex Morgan",
    });

    expect(PREPARATION_INTELLIGENCE_PROMPT).toMatch(/newly authorised evidence/i);
    expect(PREPARATION_INTELLIGENCE_PROMPT).toMatch(
      /evidence of progress or lack of progress/i
    );
    expect(PREPARATION_INTELLIGENCE_PROMPT).toMatch(/what remains unresolved/i);
    expect(PREPARATION_INTELLIGENCE_PROMPT).toMatch(
      /avoid repeating an old weakness/i
    );
    expect(PREPARATION_INTELLIGENCE_PROMPT).toMatch(
      /single authorised observation as a stable pattern/i
    );
    expect(instructions).toContain(PREPARATION_INTELLIGENCE_PROMPT.trim());
    expect(PREPARATION_BRIEF_SYSTEM_PROMPT).toMatch(/LONGITUDINAL REASONING/);
  });

  it("I. keeps Preparation workflow source model intact and blocks structured_evidence fallback", () => {
    expect(evidenceParentAuthorisedForPreparation(parent)).toBe(true);
    expect(
      evidenceParentAuthorisedForPreparation(
        makeEvidence({
          id: "ev-excluded-parent",
          title: "Excluded parent",
          includeInIntelligence: false,
          reviewStatus: "excluded",
        })
      )
    ).toBe(false);

    const selected = selectAuthorisedObservationsForPreparation({
      evidence: [parent],
      observations: [excludedObservation],
    });
    // Excluded observation stays out even when structured_evidence still holds it.
    expect(selected).toEqual([]);
    expect(
      formatAuthorisedDevelopmentEvidenceForPrompt(selected)
    ).toBe("None available.");

    const sources: ResolvedIntelligenceSources = {
      ...emptySources,
      previousConversations: [
        {
          id: "s1",
          sessionNumber: 1,
          date: "2026-08-10",
          focus: "Focus",
          summary: "Summary",
          commitments: "",
          emergingThemes: "",
        },
      ],
      authorisedDevelopmentEvidence: [],
      usedSources: ["previous_conversations"],
    };
    const prompt = buildPreparationIntelligenceInput({
      mode: "assisted",
      personContext: "Name: Alex Morgan",
      coachingPurpose: "Purpose",
      sources,
      clientDisplayName: "Alex Morgan",
    });
    expect(prompt).toContain("Previous conversations:");
    expect(prompt).toContain("Authorised Development Evidence observations");
    expect(prompt).not.toContain(
      "Opportunity to strengthen impact by recommending solutions"
    );
  });
});
